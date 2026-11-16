import {
  createVaultKey,
  DEFAULT_ITERATIONS,
  openBox,
  sealText,
  unlockWithPassphrase,
  type SealedBox,
  type VaultKey,
} from '../crypto/vault';
import type { BudgetData } from '../engine/types';
import { parseBackup, serializeBackup } from '../storage/envelopeStore';

// The decisions and steps of syncing, independent of React and of Supabase:
// "the server" is anything that implements RemoteVault, so tests can use a
// fake one kept in memory.

/** Your one row on the server: the sealed box and how many times it was saved. */
export interface RemoteRecord {
  box: SealedBox;
  revision: number;
}

export interface RemoteVault {
  fetch(): Promise<RemoteRecord | null>;
  /** 'exists' if another device created the row first. */
  create(box: SealedBox): Promise<RemoteRecord | 'exists'>;
  /** Saves only if the server is still at expectedRevision; 'conflict' if someone saved in between. */
  update(box: SealedBox, expectedRevision: number): Promise<RemoteRecord | 'conflict'>;
}

/** The server can't be reached: offline, or the free database is asleep. */
export class SyncUnavailableError extends Error {
  constructor() {
    super("Can't reach the sync service");
    this.name = 'SyncUnavailableError';
  }
}

/** The last moment this device agreed with the server. */
export interface SyncPoint {
  revision: number;
  /** A short code computed from the budget: same budget, same code. */
  fingerprint: string;
}

/** SHA-256 of the budget, as hex. Detects any change without keeping a second copy. */
export async function fingerprint(data: BudgetData): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serializeBackup(data)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The newest saved-data version this app can read. */
export const CURRENT_DATA_VERSION = 2;

/** The version number written inside saved data, or 0 when there isn't a readable one. */
export function savedVersionOf(text: string): number {
  try {
    const parsed: unknown = JSON.parse(text);
    const version = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>).version : 0;
    return typeof version === 'number' ? version : 0;
  } catch {
    return 0;
  }
}

/**
 * The text to lock and upload — but only after reading it back with the same
 * checks the other device will use. Data that wouldn't be readable is never sent.
 */
function readableText(data: BudgetData): string {
  const text = serializeBackup(data);
  if (parseBackup(text) === null) {
    throw new Error('Refused to upload data that could not be read back.');
  }
  return text;
}

export const MIN_PASSPHRASE_LENGTH = 12;

/** Checks a new passphrase and its repeat. A message to show, or null when fine. */
export function checkNewPassphrase(first: string, second: string): string | null {
  if (first.length < MIN_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_PASSPHRASE_LENGTH} characters. Four or five random words work well.`;
  }
  if (first !== second) return "The two passphrases don't match.";
  return null;
}

/** First device: makes the key, locks this device's budget, creates the row. */
export async function setUpVault(
  remote: RemoteVault,
  passphrase: string,
  local: BudgetData,
  iterations = DEFAULT_ITERATIONS,
): Promise<{ vaultKey: VaultKey; point: SyncPoint } | 'exists'> {
  const vaultKey = await createVaultKey(passphrase, iterations);
  const created = await remote.create(await sealText(vaultKey, readableText(local)));
  if (created === 'exists') return 'exists';
  return { vaultKey, point: { revision: created.revision, fingerprint: await fingerprint(local) } };
}

/** Another device: rebuilds the key from the passphrase. Null when it doesn't fit. */
export async function unlockVault(passphrase: string, record: RemoteRecord): Promise<VaultKey | null> {
  const unlocked = await unlockWithPassphrase(passphrase, record.box);
  return unlocked?.vaultKey ?? null;
}

export type StartDecision =
  | { kind: 'needs-setup' }
  | { kind: 'needs-unlock' }
  | { kind: 'in-step'; point: SyncPoint }
  | { kind: 'use-remote'; data: BudgetData; point: SyncPoint }
  | { kind: 'push-local'; revision: number }
  | { kind: 'choose'; remoteData: BudgetData; record: RemoteRecord }
  /** The key fits, but what's inside isn't valid BudgetFlow data. */
  | { kind: 'damaged'; record: RemoteRecord }
  /** Saved by a newer BudgetFlow than this one: reload, never replace. */
  | { kind: 'newer-app' };

/**
 * What to do, comparing this device's budget and the server's row against the
 * last moment they agreed (lastPoint):
 *   device unchanged, server unchanged → in step
 *   device unchanged, server changed   → take the server's
 *   device changed,   server unchanged → send this device's
 *   both changed                       → ask
 */
export async function decideStart(
  record: RemoteRecord | null,
  vaultKey: VaultKey | null,
  local: BudgetData,
  lastPoint: SyncPoint | null,
): Promise<StartDecision> {
  if (record === null) return { kind: 'needs-setup' };
  if (vaultKey === null) return { kind: 'needs-unlock' };

  const text = await openBox(vaultKey, record.box);
  // The key no longer fits (e.g. the passphrase was changed elsewhere).
  if (text === null) return { kind: 'needs-unlock' };
  const remoteData = parseBackup(text);
  if (remoteData === null) {
    return savedVersionOf(text) > CURRENT_DATA_VERSION ? { kind: 'newer-app' } : { kind: 'damaged', record };
  }

  const [localPrint, remotePrint] = await Promise.all([fingerprint(local), fingerprint(remoteData)]);
  const remotePoint: SyncPoint = { revision: record.revision, fingerprint: remotePrint };
  if (localPrint === remotePrint) return { kind: 'in-step', point: remotePoint };

  if (lastPoint === null) {
    // First time on this device: an empty budget simply takes the synced copy.
    return local.envelopes.length === 0 && local.log.length === 0
      ? { kind: 'use-remote', data: remoteData, point: remotePoint }
      : { kind: 'choose', remoteData, record };
  }

  const deviceChanged = localPrint !== lastPoint.fingerprint;
  const serverChanged = record.revision !== lastPoint.revision;
  if (!deviceChanged) return { kind: 'use-remote', data: remoteData, point: remotePoint };
  if (!serverChanged) return { kind: 'push-local', revision: record.revision };
  return { kind: 'choose', remoteData, record };
}

/** Locks this device's budget and saves it, if nobody saved since knownRevision. */
export async function pushLocal(
  remote: RemoteVault,
  vaultKey: VaultKey,
  local: BudgetData,
  knownRevision: number,
): Promise<SyncPoint | 'conflict'> {
  const updated = await remote.update(await sealText(vaultKey, readableText(local)), knownRevision);
  if (updated === 'conflict') return 'conflict';
  return { revision: updated.revision, fingerprint: await fingerprint(local) };
}
