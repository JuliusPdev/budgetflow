import { describe, expect, it } from 'vitest';
import type { BudgetData, Expense, LogEntry } from '../engine/types';
import {
  createLocalStore,
  parseBackup,
  serializeBackup,
  STARTING_BALANCE_ID,
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

// All data is made up.
const trip: Expense = { id: 'trip', name: 'Made-up trip', targetCents: 50_000, dueMonth: '2027-03' };
const EMPTY: BudgetData = { envelopes: [], log: [], settings: { payday: 1 } };
const setAside: LogEntry = { id: 'made-up-entry', kind: 'set-aside', date: '2026-11-16', month: '2026-11', amountCents: 10_000 };
const correction: LogEntry = { id: 'fix', kind: 'adjustment', amountCents: -2_500, date: '2026-11-17' };
const withdrawal: LogEntry = { id: 'out', kind: 'withdrawal', date: '2026-11-19', month: '2026-11', amountCents: 10_000, reason: 'Concert' };
const paycheck: LogEntry = { id: 'pay', kind: 'paycheck', date: '2026-11-19', month: '2026-11', amountCents: 240_000 };

/** Saved data in an older version, as text. */
function old(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

describe('envelope store', () => {
  it('starts empty when nothing has been saved', async () => {
    expect(await createLocalStore(fakeDrawer()).load()).toEqual(EMPTY);
  });

  it('gives back exactly what was saved', async () => {
    const store = createLocalStore(fakeDrawer());
    const paidTrip: Expense = { ...trip, id: 'paid', paidMonth: '2027-01', dueDate: '2027-03-14' };
    const data: BudgetData = { envelopes: [trip, paidTrip], log: [setAside, correction, paycheck, withdrawal], settings: { payday: 21 } };
    await store.save(data);
    expect(await store.load()).toEqual(data);
  });

  it('always saves the newest version', async () => {
    const drawer = fakeDrawer();
    await createLocalStore(drawer).save({ envelopes: [trip], log: [], settings: { payday: 1 } });
    expect(JSON.parse(drawer.contents.get(STORAGE_KEY) ?? '{}').version).toBe(6);
  });

  it('backs up unreadable data instead of crashing or losing it', async () => {
    const drawer = fakeDrawer({ [STORAGE_KEY]: '{half a save' });
    expect(await createLocalStore(drawer).load()).toEqual(EMPTY);
    expect(drawer.contents.get(UNREADABLE_BACKUP_KEY)).toBe('{half a save');
  });

  it('rejects an expense or log entry with a missing or malformed field', async () => {
    const bad = [
      { version: 4, envelopes: [{ id: 'x', name: 'x', targetCents: 100 }], log: [], settings: { payday: 1 } },
      { version: 4, envelopes: [{ ...trip, targetCents: 12.5 }], log: [], settings: { payday: 1 } },
      { version: 4, envelopes: [{ ...trip, dueDate: '2027-04-14' }], log: [], settings: { payday: 1 } },
      { version: 4, envelopes: [trip], log: [{ ...setAside, amountCents: -1 }], settings: { payday: 1 } },
      { version: 4, envelopes: [trip], log: [], settings: { payday: 32 } },
      { version: 5, envelopes: [trip], log: [{ ...paycheck, date: '19 Nov' }], settings: { payday: 1 } },
      { version: 6, envelopes: [trip], log: [{ ...withdrawal, amountCents: 0 }], settings: { payday: 1 } },
    ];
    for (const data of bad) {
      const drawer = fakeDrawer({ [STORAGE_KEY]: JSON.stringify(data) });
      expect(await createLocalStore(drawer).load()).toEqual(EMPTY);
    }
  });

  it('ignores data saved by the old app', async () => {
    const drawer = fakeDrawer({ 'budgetflow-v1': '{"budget":{}}' });
    expect(await createLocalStore(drawer).load()).toEqual(EMPTY);
    expect(drawer.contents.get('budgetflow-v1')).toBe('{"budget":{}}');
  });
});

describe('switching to one pot (from version 3 and older)', () => {
  // Version 3: €300 inside the trip, of which €100 came from a logged set-aside
  // that was €150 in total (€50 of it was extra nobody needed). Tyres paid in full.
  const version3 = old({
    version: 3,
    envelopes: [
      { ...trip, savedCents: 30_000 },
      { id: 'tyres', name: 'Made-up tyres', targetCents: 40_000, dueMonth: '2026-10', savedCents: 40_000, paidMonth: '2026-10' },
    ],
    log: [{ id: 'made-up-entry', kind: 'set-aside', date: '2026-11-16', month: '2026-11', amountCents: 15_000, split: { trip: 10_000 } }],
    settings: { payday: 21 },
  });

  it('turns the money inside expenses into a starting balance, without counting logged money twice', () => {
    expect(parseBackup(version3)).toEqual({
      envelopes: [trip, { id: 'tyres', name: 'Made-up tyres', targetCents: 40_000, dueMonth: '2026-10', paidMonth: '2026-10' }],
      log: [
        // 300 + 400 inside the expenses, minus the 100 the logged set-aside put in.
        { id: STARTING_BALANCE_ID, kind: 'adjustment', amountCents: 60_000, note: 'Starting balance' },
        { id: 'made-up-entry', kind: 'set-aside', date: '2026-11-16', month: '2026-11', amountCents: 15_000 },
      ],
      settings: { payday: 21 },
    });
    // In the pot: 600 + 150 − 400 for the paid tyres = 350 — the old 300 plus the €50 extra.
  });

  it('converts to exactly the same data on every device, so sync agrees', () => {
    const first = parseBackup(version3);
    const second = parseBackup(version3);
    if (first === null || second === null) throw new Error('expected readable data');
    expect(serializeBackup(first)).toBe(serializeBackup(second));
  });

  it('reads version 1 (no log) and version 2 (payday on the 1st)', () => {
    expect(parseBackup(old({ version: 1, envelopes: [{ ...trip, savedCents: 10_000 }] }))).toEqual({
      envelopes: [trip],
      log: [{ id: STARTING_BALANCE_ID, kind: 'adjustment', amountCents: 10_000, note: 'Starting balance' }],
      settings: { payday: 1 },
    });
    expect(parseBackup(old({ version: 2, envelopes: [{ ...trip, savedCents: 0 }], log: [] }))).toEqual({
      envelopes: [trip],
      log: [],
      settings: { payday: 1 },
    });
  });

  it('still refuses broken old data', () => {
    const brokenSplit = { id: 'e', kind: 'set-aside', date: '2026-11-16', month: '2026-11', amountCents: 1, split: { trip: 0.5 } };
    expect(parseBackup(old({ version: 2, envelopes: [{ ...trip, savedCents: 0 }], log: [brokenSplit] }))).toBeNull();
    expect(parseBackup(old({ version: 3, envelopes: [trip], log: [], settings: { payday: 1 } }))).toBeNull();
  });
});

describe('version 4 (one pot, before paychecks)', () => {
  it('reads as it was', () => {
    const data = { envelopes: [trip], log: [setAside], settings: { payday: 21 } };
    expect(parseBackup(JSON.stringify({ version: 4, ...data }))).toEqual(data);
  });
});

describe('backup files', () => {
  it('reads back exactly what was written', () => {
    const data: BudgetData = { envelopes: [trip], log: [setAside, correction], settings: { payday: 21 } };
    expect(parseBackup(serializeBackup(data))).toEqual(data);
  });

  it('refuses files that are not BudgetFlow backups', () => {
    for (const text of ['', 'hello', '{"version":2,"envelopes":[]}', '{"envelopes":[{"id":"x"}],"version":1}']) {
      expect(parseBackup(text)).toBeNull();
    }
  });
});
