import { describe, expect, it } from 'vitest';
import type { Envelope } from '../engine/types';
import {
  createLocalStore,
  parseBackup,
  serializeBackup,
  STORAGE_KEY,
  UNREADABLE_BACKUP_KEY,
  type KeyValueDrawer,
} from './envelopeStore';

// A pretend storage drawer, so the store can be tested outside a browser.
function fakeDrawer(initial: Record<string, string> = {}): KeyValueDrawer & { contents: Map<string, string> } {
  const contents = new Map(Object.entries(initial));
  return {
    contents,
    getItem: (key) => contents.get(key) ?? null,
    setItem: (key, value) => {
      contents.set(key, value);
    },
  };
}

const trip: Envelope = {
  id: 'trip',
  name: 'Made-up trip',
  targetCents: 50_000,
  dueMonth: '2027-03',
  savedCents: 10_000,
};

describe('envelope store', () => {
  it('starts empty when nothing has been saved', async () => {
    expect(await createLocalStore(fakeDrawer()).load()).toEqual([]);
  });

  it('gives back exactly what was saved', async () => {
    const store = createLocalStore(fakeDrawer());
    const paidTrip = { ...trip, paidMonth: '2027-01' };

    await store.save([trip, paidTrip]);

    expect(await store.load()).toEqual([trip, paidTrip]);
  });

  it('backs up unreadable data instead of crashing or losing it', async () => {
    const drawer = fakeDrawer({ [STORAGE_KEY]: '{half a save' });

    expect(await createLocalStore(drawer).load()).toEqual([]);
    expect(drawer.contents.get(UNREADABLE_BACKUP_KEY)).toBe('{half a save');
  });

  it('rejects an envelope with a missing or malformed field', async () => {
    const missingDueMonth = { id: 'x', name: 'x', targetCents: 100, savedCents: 0 };
    const centsWithDecimals = { ...trip, targetCents: 12.5 };

    for (const broken of [missingDueMonth, centsWithDecimals]) {
      const drawer = fakeDrawer({ [STORAGE_KEY]: JSON.stringify({ version: 1, envelopes: [broken] }) });
      expect(await createLocalStore(drawer).load()).toEqual([]);
    }
  });

  it('ignores data saved by the old app', async () => {
    const drawer = fakeDrawer({ 'budgetflow-v1': '{"budget":{}}' });

    expect(await createLocalStore(drawer).load()).toEqual([]);
    expect(drawer.contents.get('budgetflow-v1')).toBe('{"budget":{}}');
  });
});

describe('backup files', () => {
  it('reads back exactly what was written', () => {
    const paidTrip = { ...trip, id: 'paid', paidMonth: '2027-01' };
    expect(parseBackup(serializeBackup([trip, paidTrip]))).toEqual([trip, paidTrip]);
  });

  it('refuses files that are not BudgetFlow backups', () => {
    for (const text of ['', 'hello', '{"version":2,"envelopes":[]}', '{"envelopes":[{"id":"x"}],"version":1}']) {
      expect(parseBackup(text)).toBeNull();
    }
  });
});
