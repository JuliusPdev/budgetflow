import { describe, expect, it } from 'vitest';
import type { BudgetData, Envelope, LogEntry } from '../engine/types';
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

const EMPTY: BudgetData = { envelopes: [], log: [], settings: { payday: 1 } };

const setAside: LogEntry = {
  id: 'made-up-entry',
  kind: 'set-aside',
  date: '2026-11-16',
  month: '2026-11',
  amountCents: 10_000,
  split: { trip: 10_000 },
};

describe('envelope store', () => {
  it('starts empty when nothing has been saved', async () => {
    expect(await createLocalStore(fakeDrawer()).load()).toEqual(EMPTY);
  });

  it('gives back exactly what was saved', async () => {
    const store = createLocalStore(fakeDrawer());
    const paidTrip = { ...trip, paidMonth: '2027-01' };

    const data: BudgetData = { envelopes: [trip, paidTrip], log: [setAside], settings: { payday: 21 } };
    await store.save(data);

    expect(await store.load()).toEqual(data);
  });

  it('backs up unreadable data instead of crashing or losing it', async () => {
    const drawer = fakeDrawer({ [STORAGE_KEY]: '{half a save' });

    expect(await createLocalStore(drawer).load()).toEqual(EMPTY);
    expect(drawer.contents.get(UNREADABLE_BACKUP_KEY)).toBe('{half a save');
  });

  it('rejects an envelope with a missing or malformed field', async () => {
    const missingDueMonth = { id: 'x', name: 'x', targetCents: 100, savedCents: 0 };
    const centsWithDecimals = { ...trip, targetCents: 12.5 };

    for (const broken of [missingDueMonth, centsWithDecimals]) {
      const drawer = fakeDrawer({ [STORAGE_KEY]: JSON.stringify({ version: 1, envelopes: [broken] }) });
      expect(await createLocalStore(drawer).load()).toEqual(EMPTY);
    }
  });

  it('reads data saved before the savings log existed (version 1) as an empty log', async () => {
    const drawer = fakeDrawer({ [STORAGE_KEY]: JSON.stringify({ version: 1, envelopes: [trip] }) });
    expect(await createLocalStore(drawer).load()).toEqual({ envelopes: [trip], log: [], settings: { payday: 1 } });
  });

  it('always saves the newest version', async () => {
    const drawer = fakeDrawer();
    await createLocalStore(drawer).save({ envelopes: [trip], log: [], settings: { payday: 1 } });
    expect(JSON.parse(drawer.contents.get(STORAGE_KEY) ?? '{}').version).toBe(3);
  });

  it('rejects a log entry with a broken split', async () => {
    const broken = { ...setAside, split: { trip: 12.5 } };
    const drawer = fakeDrawer({ [STORAGE_KEY]: JSON.stringify({ version: 2, envelopes: [trip], log: [broken] }) });
    expect(await createLocalStore(drawer).load()).toEqual(EMPTY);
  });

  it('ignores data saved by the old app', async () => {
    const drawer = fakeDrawer({ 'budgetflow-v1': '{"budget":{}}' });

    expect(await createLocalStore(drawer).load()).toEqual(EMPTY);
    expect(drawer.contents.get('budgetflow-v1')).toBe('{"budget":{}}');
  });
});

describe('backup files', () => {
  it('reads back exactly what was written', () => {
    const paidTrip = { ...trip, id: 'paid', paidMonth: '2027-01' };
    const data: BudgetData = { envelopes: [trip, paidTrip], log: [setAside], settings: { payday: 21 } };
    expect(parseBackup(serializeBackup(data))).toEqual(data);
  });

  it('refuses files that are not BudgetFlow backups', () => {
    for (const text of ['', 'hello', '{"version":2,"envelopes":[]}', '{"envelopes":[{"id":"x"}],"version":1}']) {
      expect(parseBackup(text)).toBeNull();
    }
  });
});

describe('version 3: exact dates and settings', () => {
  it('reads version 2 data with payday on the 1st, keeping its calculations unchanged', async () => {
    const drawer = fakeDrawer({ [STORAGE_KEY]: JSON.stringify({ version: 2, envelopes: [trip], log: [] }) });
    expect((await createLocalStore(drawer).load()).settings).toEqual({ payday: 1 });
  });

  it('keeps an exact due date and the payday', async () => {
    const store = createLocalStore(fakeDrawer());
    const dated = { ...trip, dueDate: '2027-03-14' };
    await store.save({ envelopes: [dated], log: [], settings: { payday: 21 } });
    expect(await store.load()).toEqual({ envelopes: [dated], log: [], settings: { payday: 21 } });
  });

  it('refuses a date outside its due month, or an impossible payday', async () => {
    const wrongMonth = { ...trip, dueDate: '2027-04-14' };
    const bad = [
      { version: 3, envelopes: [wrongMonth], log: [], settings: { payday: 21 } },
      { version: 3, envelopes: [trip], log: [], settings: { payday: 32 } },
    ];
    for (const data of bad) {
      const drawer = fakeDrawer({ [STORAGE_KEY]: JSON.stringify(data) });
      expect(await createLocalStore(drawer).load()).toEqual(EMPTY);
    }
  });
});
