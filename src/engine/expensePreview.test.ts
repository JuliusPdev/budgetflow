import { describe, expect, it } from 'vitest';
import { previewExpense } from './expensePreview';
import type { Expense, LogEntry } from './types';

// Made-up amounts, in paycheck terms. The November paycheck started 21 Nov.
const NOVEMBER = '2026-11';
const START = '2026-11-21';
const gifts: Expense = { id: 'gifts', name: 'Gifts', targetCents: 30_000, dueMonth: '2026-11' };
const trip: Expense = { id: 'trip', name: 'Trip', targetCents: 60_000, dueMonth: '2027-01' };
const log: LogEntry[] = [];

describe('what a new expense changes', () => {
  it('shows this paycheck before and after, and the new expense’s own share', () => {
    // €900 over three paychecks stays as even as possible: 300 / 300 / 300. This
    // paycheck's €300 is all for the gifts, so the trip only fills the next two.
    const preview = previewExpense([gifts], log, NOVEMBER, START, [trip]);
    expect(preview.openBeforeCents).toBe(30_000);
    expect(preview.openAfterCents).toBe(30_000);
    expect(preview.ownShares).toEqual([
      { month: '2026-12', cents: 30_000 },
      { month: '2027-01', cents: 30_000 },
    ]);
  });

  it('lists the later paychecks that change', () => {
    const preview = previewExpense([gifts], log, NOVEMBER, START, [trip]);
    expect(preview.laterChanges).toEqual([
      { month: '2026-12', beforeCents: 0, afterCents: 30_000 },
      { month: '2027-01', beforeCents: 0, afterCents: 30_000 },
    ]);
  });

  it('when editing, swaps the old version for the draft instead of adding it twice', () => {
    const cheaperTrip = { ...trip, targetCents: 30_000 };
    const preview = previewExpense([gifts, trip], log, NOVEMBER, START, [cheaperTrip], 'trip');
    // Before: 300 / 300 / 300. A €300 trip instead: 300 now, then 150 / 150.
    expect(preview.openBeforeCents).toBe(30_000);
    expect(preview.openAfterCents).toBe(30_000);
    expect(preview.laterChanges.map((change) => `${change.beforeCents}→${change.afterCents}`)).toEqual([
      '30000→15000',
      '30000→15000',
    ]);
  });

  it('raises this paycheck when the new expense is due soon', () => {
    const soon: Expense = { id: 'soon', name: 'Repair', targetCents: 20_000, dueMonth: '2026-11' };
    const preview = previewExpense([gifts], log, NOVEMBER, START, [soon]);
    expect(preview.openAfterCents - preview.openBeforeCents).toBe(20_000);
  });

  it('changes nothing for an expense that is already covered', () => {
    const rich: LogEntry[] = [{ id: 'start', kind: 'adjustment', amountCents: 200_000 }];
    const preview = previewExpense([gifts], rich, NOVEMBER, START, [trip]);
    expect(preview.openAfterCents).toBe(preview.openBeforeCents);
    expect(preview.laterChanges).toEqual([]);
  });
});
