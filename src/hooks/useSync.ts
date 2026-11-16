import { useEffect, useRef, useState } from 'react';
import type { VaultKey } from '../crypto/vault';
import type { BudgetData } from '../engine/types';
import { forgetVaultKey, loadVaultKey, saveVaultKey } from '../sync/keyStore';
import { supabaseVault } from '../sync/remoteVault';
import {
  decideStart,
  fingerprint,
  pushLocal,
  setUpVault,
  SyncUnavailableError,
  unlockVault,
  type RemoteRecord,
  type StartDecision,
  type SyncPoint,
} from '../sync/syncCore';
import { clearSyncPoint, loadSyncPoint, saveSyncPoint } from '../sync/syncPointStore';
import type { AccountState } from './useAccount';

export type SyncStatus =
  | { kind: 'off' }
  | { kind: 'starting' }
  | { kind: 'needs-setup' }
  | { kind: 'needs-unlock' }
  | { kind: 'choose'; deviceCount: number; syncedCount: number }
  | { kind: 'saving' }
  | { kind: 'synced'; at: Date }
  | { kind: 'unavailable' }
  | { kind: 'problem' };

interface UseSyncOptions {
  account: AccountState;
  /** Your budget on this device: saved expenses and the savings log. */
  data: BudgetData;
  /** True until this device's own list has loaded. */
  isLoading: boolean;
  replaceAll: (data: BudgetData) => void;
}

const UNAVAILABLE_MESSAGE =
  "Can't reach sync right now. If BudgetFlow hasn't been used for a week, the sync database may be asleep: wake it in the Supabase dashboard.";
const PROBLEM_MESSAGE = 'Something went wrong while syncing. Your expenses are safe on this device.';

function messageFor(error: unknown): string {
  return error instanceof SyncUnavailableError ? UNAVAILABLE_MESSAGE : PROBLEM_MESSAGE;
}

/** Keeps this device's list in step with the encrypted copy on the server. */
export function useSync({ account, data, isLoading, replaceAll }: UseSyncOptions) {
  const [status, setStatus] = useState<SyncStatus>({ kind: 'off' });
  const userId = account.status === 'signed-in' ? account.userId : null;

  // What the sync steps need right now, without redrawing the screen.
  const userIdRef = useRef(userId);
  const dataRef = useRef(data);
  const statusRef = useRef(status);
  const keyRef = useRef<VaultKey | null>(null);
  // Null while sync is paused (needs setup, unlock, or a choice): nothing is pushed.
  const pointRef = useRef<SyncPoint | null>(null);
  const choiceRef = useRef<{ remoteData: BudgetData; record: RemoteRecord } | null>(null);
  // Sync steps run one at a time, in order, like a single checkout lane.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    userIdRef.current = userId;
    dataRef.current = data;
    statusRef.current = status;
  });

  function enqueue(step: () => Promise<void>): Promise<void> {
    const next = queueRef.current.then(step).catch((error: unknown) => {
      setStatus(error instanceof SyncUnavailableError ? { kind: 'unavailable' } : { kind: 'problem' });
    });
    queueRef.current = next;
    return next;
  }

  function agree(point: SyncPoint): void {
    pointRef.current = point;
    const id = userIdRef.current;
    if (id !== null) saveSyncPoint(id, point);
    setStatus({ kind: 'synced', at: new Date() });
  }

  async function apply(decision: StartDecision): Promise<void> {
    switch (decision.kind) {
      case 'needs-setup':
        pointRef.current = null;
        setStatus({ kind: 'needs-setup' });
        return;
      case 'needs-unlock': {
        pointRef.current = null;
        keyRef.current = null;
        const id = userIdRef.current;
        if (id !== null) await forgetVaultKey(id);
        setStatus({ kind: 'needs-unlock' });
        return;
      }
      case 'in-step':
        agree(decision.point);
        return;
      case 'use-remote':
        // Agree first, so receiving the list doesn't echo back as a save.
        agree(decision.point);
        replaceAll(decision.data);
        dataRef.current = decision.data;
        return;
      case 'push-local':
        // The stale fingerprint guarantees the push goes ahead.
        pointRef.current = { revision: decision.revision, fingerprint: '' };
        await pushNow();
        return;
      case 'choose':
        pointRef.current = null;
        choiceRef.current = { remoteData: decision.remoteData, record: decision.record };
        setStatus({
          kind: 'choose',
          deviceCount: dataRef.current.envelopes.length,
          syncedCount: decision.remoteData.envelopes.length,
        });
        return;
    }
  }

  async function start(): Promise<void> {
    const id = userIdRef.current;
    if (id === null) return;
    setStatus({ kind: 'starting' });
    const [vaultKey, record] = await Promise.all([loadVaultKey(id), supabaseVault.fetch()]);
    keyRef.current = vaultKey;
    await apply(await decideStart(record, vaultKey, dataRef.current, loadSyncPoint(id)));
  }

  async function pushNow(): Promise<void> {
    const vaultKey = keyRef.current;
    const point = pointRef.current;
    if (vaultKey === null || point === null) return;
    const local = dataRef.current;
    if ((await fingerprint(local)) === point.fingerprint) return;

    setStatus({ kind: 'saving' });
    const saved = await pushLocal(supabaseVault, vaultKey, local, point.revision);
    if (saved !== 'conflict') {
      agree(saved);
      return;
    }
    // Someone saved in between: compare again, which may ask you to choose.
    await apply(await decideStart(await supabaseVault.fetch(), vaultKey, local, point));
  }

  async function pullIfNewer(): Promise<void> {
    const vaultKey = keyRef.current;
    const point = pointRef.current;
    if (vaultKey === null || point === null) return;
    const record = await supabaseVault.fetch();
    if (record !== null && record.revision === point.revision) return;
    await apply(await decideStart(record, vaultKey, dataRef.current, point));
  }

  // 1. Start when signed in and this device's list has loaded; stop when signed out.
  useEffect(() => {
    if (userId === null) {
      // Signed out: forget what's in memory. The status shows "off" by itself (see the end).
      keyRef.current = null;
      pointRef.current = null;
      choiceRef.current = null;
      return;
    }
    if (isLoading) return;
    void enqueue(start);
    // start/enqueue read refs, so only the sign-in and loading state matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isLoading]);

  // 2. Save shortly after a change, so quick edits become one save.
  useEffect(() => {
    if (pointRef.current === null) return;
    const timer = window.setTimeout(() => void enqueue(pushNow), 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // 3. Catch up when you come back to BudgetFlow or the connection returns.
  useEffect(() => {
    function handleReturn(): void {
      if (document.visibilityState !== 'visible' || userIdRef.current === null) return;
      if (statusRef.current.kind === 'unavailable' || statusRef.current.kind === 'problem') void enqueue(start);
      else if (pointRef.current !== null) void enqueue(pullIfNewer);
    }
    document.addEventListener('visibilitychange', handleReturn);
    window.addEventListener('focus', handleReturn);
    window.addEventListener('online', handleReturn);
    return () => {
      document.removeEventListener('visibilitychange', handleReturn);
      window.removeEventListener('focus', handleReturn);
      window.removeEventListener('online', handleReturn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** First device: choose the passphrase. A message to show, or null when sync is on. */
  async function turnOn(passphrase: string): Promise<string | null> {
    const id = userIdRef.current;
    if (id === null) return null;
    try {
      const result = await setUpVault(supabaseVault, passphrase, dataRef.current);
      if (result === 'exists') {
        await enqueue(start);
        return 'Sync was already turned on from another device. Enter that passphrase instead.';
      }
      keyRef.current = result.vaultKey;
      await saveVaultKey(id, result.vaultKey);
      agree(result.point);
      return null;
    } catch (error) {
      return messageFor(error);
    }
  }

  /** Another device: unlock with the passphrase. A message to show, or null when unlocked. */
  async function unlock(passphrase: string): Promise<string | null> {
    const id = userIdRef.current;
    if (id === null) return null;
    try {
      const record = await supabaseVault.fetch();
      if (record === null) {
        setStatus({ kind: 'needs-setup' });
        return null;
      }
      const vaultKey = await unlockVault(passphrase, record);
      if (vaultKey === null) return "That passphrase doesn't open your synced expenses. Check it and try again.";
      keyRef.current = vaultKey;
      await saveVaultKey(id, vaultKey);
      await apply(await decideStart(record, vaultKey, dataRef.current, loadSyncPoint(id)));
      return null;
    } catch (error) {
      return messageFor(error);
    }
  }

  /** Both copies changed: keep the synced copy, or this device's. */
  function choose(keep: 'synced' | 'this-device'): Promise<void> {
    const choice = choiceRef.current;
    choiceRef.current = null;
    if (choice === null) return Promise.resolve();
    return enqueue(async () => {
      if (keep === 'synced') {
        agree({ revision: choice.record.revision, fingerprint: await fingerprint(choice.remoteData) });
        replaceAll(choice.remoteData);
        dataRef.current = choice.remoteData;
      } else {
        pointRef.current = { revision: choice.record.revision, fingerprint: '' };
        await pushNow();
      }
    });
  }

  /** Before signing out: remove this device's key and sync point. Expenses stay. */
  async function forgetThisDevice(): Promise<void> {
    const id = userIdRef.current;
    keyRef.current = null;
    pointRef.current = null;
    clearSyncPoint();
    if (id !== null) await forgetVaultKey(id);
  }

  function retry(): void {
    void enqueue(start);
  }

  return {
    // Worked out, not stored: nobody signed in means sync is off.
    status: userId === null ? ({ kind: 'off' } as const) : status,
    turnOn,
    unlock,
    choose,
    forgetThisDevice,
    retry,
    unavailableMessage: UNAVAILABLE_MESSAGE,
    problemMessage: PROBLEM_MESSAGE,
  };
}
