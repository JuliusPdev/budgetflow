import { describe, expect, it } from 'vitest';
import { createVaultKey, sealText, type VaultKey } from '../crypto/vault';
import type { BudgetData, Envelope } from '../engine/types';
import { serializeBackup } from '../storage/envelopeStore';
import {
  checkNewPassphrase,
  decideStart,
  fingerprint,
  pushLocal,
  setUpVault,
  unlockVault,
  type RemoteRecord,
  type RemoteVault,
  type SyncPoint,
} from './syncCore';

// All data is made up. Fewer kneading rounds than real, only to keep tests fast.
const FAST = 1_000;
const PASSPHRASE = 'made-up quiet harbour lantern';

const trip: Envelope = { id: 'trip', name: 'Made-up trip', targetCents: 50_000, dueMonth: '2027-03', savedCents: 0 };
const tyres: Envelope = { id: 'tyres', name: 'Made-up tyres', targetCents: 40_000, dueMonth: '2027-02', savedCents: 0 };

/** A budget with these expenses and an empty savings log. */
function budget(...envelopes: Envelope[]): BudgetData {
  return { envelopes, log: [], settings: { payday: 1 } };
}

/** A pretend server holding one row in memory, with the same rules as the real one. */
function fakeServer(): RemoteVault & { record: RemoteRecord | null } {
  const server: RemoteVault & { record: RemoteRecord | null } = {
    record: null,
    async fetch() {
      return server.record;
    },
    async create(box) {
      if (server.record !== null) return 'exists';
      server.record = { box, revision: 1 };
      return server.record;
    },
    async update(box, expectedRevision) {
      if (server.record === null || server.record.revision !== expectedRevision) return 'conflict';
      server.record = { box, revision: expectedRevision + 1 };
      return server.record;
    },
  };
  return server;
}

/** A server row holding `envelopes`, plus the key that opens it. */
async function serverWith(data: BudgetData, revision: number) {
  const vaultKey = await createVaultKey(PASSPHRASE, FAST);
  const record: RemoteRecord = { box: await sealText(vaultKey, serializeBackup(data)), revision };
  return { vaultKey, record };
}

describe('passphrase rules', () => {
  it('asks for length and a matching repeat', () => {
    expect(checkNewPassphrase('short', 'short')).toMatch(/at least 12/);
    expect(checkNewPassphrase('long enough words', 'long enough wordz')).toMatch(/don't match/);
    expect(checkNewPassphrase('long enough words', 'long enough words')).toBeNull();
  });
});

describe('fingerprint', () => {
  it('is the same for the same list and different after any change', async () => {
    expect(await fingerprint(budget(trip))).toBe(await fingerprint(budget({ ...trip })));
    expect(await fingerprint(budget(trip))).not.toBe(await fingerprint(budget({ ...trip, savedCents: 1 })));
  });
});

describe('two devices', () => {
  it('sets up on one device and unlocks the same list on another', async () => {
    const server = fakeServer();
    const setUp = await setUpVault(server, PASSPHRASE, budget(trip, tyres), FAST);
    expect(setUp).not.toBe('exists');

    const record = await server.fetch();
    if (record === null) throw new Error('expected a row');
    expect(JSON.stringify(record.box)).not.toContain('Made-up trip');

    const otherDeviceKey = await unlockVault(PASSPHRASE, record);
    const decision = await decideStart(record, otherDeviceKey, budget(), null);
    expect(decision).toMatchObject({ kind: 'use-remote', data: budget(trip, tyres) });
  });

  it('refuses the wrong passphrase on the other device', async () => {
    const { record } = await serverWith(budget(trip), 1);
    expect(await unlockVault('made-up wrong passphrase', record)).toBeNull();
  });

  it('does not set up twice', async () => {
    const server = fakeServer();
    await setUpVault(server, PASSPHRASE, budget(trip), FAST);
    expect(await setUpVault(server, 'made-up other passphrase', budget(tyres), FAST)).toBe('exists');
  });
});

describe('decideStart', () => {
  it('asks to set up when there is no row, and to unlock when this device has no key', async () => {
    const { record } = await serverWith(budget(trip), 1);
    expect(await decideStart(null, null, budget(), null)).toEqual({ kind: 'needs-setup' });
    expect(await decideStart(record, null, budget(), null)).toEqual({ kind: 'needs-unlock' });
  });

  it('asks to unlock again when the stored key no longer fits', async () => {
    const { record } = await serverWith(budget(trip), 1);
    const staleKey = await createVaultKey('made-up old passphrase', FAST);
    expect(await decideStart(record, staleKey, budget(trip), null)).toEqual({ kind: 'needs-unlock' });
  });

  it('is in step when both sides hold the same list', async () => {
    const { vaultKey, record } = await serverWith(budget(trip), 3);
    expect(await decideStart(record, vaultKey, budget(trip), null)).toMatchObject({ kind: 'in-step', point: { revision: 3 } });
  });

  it('asks the first time when this device already has a different list', async () => {
    const { vaultKey, record } = await serverWith(budget(trip), 1);
    expect(await decideStart(record, vaultKey, budget(tyres), null)).toMatchObject({ kind: 'choose' });
  });

  it('takes the server copy when only the server changed', async () => {
    const { vaultKey, record } = await serverWith(budget(trip, tyres), 2);
    const lastPoint: SyncPoint = { revision: 1, fingerprint: await fingerprint(budget(trip)) };
    expect(await decideStart(record, vaultKey, budget(trip), lastPoint)).toMatchObject({
      kind: 'use-remote',
      data: budget(trip, tyres),
    });
  });

  it('sends this device copy when only this device changed', async () => {
    const { vaultKey, record } = await serverWith(budget(trip), 1);
    const lastPoint: SyncPoint = { revision: 1, fingerprint: await fingerprint(budget(trip)) };
    expect(await decideStart(record, vaultKey, budget(trip, tyres), lastPoint)).toEqual({ kind: 'push-local', revision: 1 });
  });

  it('asks when both changed since they last agreed', async () => {
    const { vaultKey, record } = await serverWith(budget(tyres), 2);
    const lastPoint: SyncPoint = { revision: 1, fingerprint: await fingerprint(budget(trip)) };
    expect(await decideStart(record, vaultKey, budget(trip, tyres), lastPoint)).toMatchObject({ kind: 'choose' });
  });
});

describe('pushLocal', () => {
  it('saves when nobody saved in between, and reports a conflict otherwise', async () => {
    const server = fakeServer();
    const setUp = await setUpVault(server, PASSPHRASE, budget(trip), FAST);
    if (setUp === 'exists') throw new Error('expected a fresh setup');

    const saved = await pushLocal(server, setUp.vaultKey, budget(trip, tyres), 1);
    expect(saved).toMatchObject({ revision: 2 });
    // A device still thinking the server is at revision 1 must not overwrite revision 2.
    expect(await pushLocal(server, setUp.vaultKey, budget(tyres), 1)).toBe('conflict');
  });
});

describe('unreadable synced copies', () => {
  async function serverHolding(text: string): Promise<{ vaultKey: VaultKey; record: RemoteRecord }> {
    const vaultKey = await createVaultKey(PASSPHRASE, FAST);
    return { vaultKey, record: { box: await sealText(vaultKey, text), revision: 4 } };
  }

  it('calls a known-version copy with missing pieces damaged', async () => {
    // What a half-converted app could upload: the version number and nothing else.
    const { vaultKey, record } = await serverHolding('{"version":2}');
    expect(await decideStart(record, vaultKey, budget(trip), null)).toEqual({ kind: 'damaged', record });
  });

  it('never calls a copy from a newer BudgetFlow damaged', async () => {
    const { vaultKey, record } = await serverHolding('{"version":4,"somethingNew":[]}');
    expect(await decideStart(record, vaultKey, budget(trip), null)).toEqual({ kind: 'newer-app' });
  });

  it('can replace a damaged copy with this device budget', async () => {
    const server = fakeServer();
    const { vaultKey, record } = await serverHolding('{"version":2}');
    server.record = record;
    const repaired = await pushLocal(server, vaultKey, budget(trip, tyres), record.revision);
    expect(repaired).toMatchObject({ revision: 5 });
  });
});

describe('upload safety check', () => {
  it('refuses to upload data that would not read back', async () => {
    const server = fakeServer();
    const setUp = await setUpVault(server, PASSPHRASE, budget(trip), FAST);
    if (setUp === 'exists') throw new Error('expected a fresh setup');
    const before = server.record;

    // A plain list where a budget belongs: exactly the half-converted mistake.
    const notABudget = [trip] as unknown as BudgetData;
    await expect(pushLocal(server, setUp.vaultKey, notABudget, 1)).rejects.toThrow(/could not be read back/);
    expect(server.record).toBe(before);
  });
});
