import { describe, expect, it } from 'vitest';
import { groupChanges, previewTakeOut } from './takeOut';
import type { Expense, LogEntry } from './types';

// Made-up amounts: €1,120 of expenses over four paychecks from November → €280 each.
const NOVEMBER = '2026-11';
const START = '2026-11-21';
const TODAY = '2026-11-23';
const presents: Expense = { id: 'presents', name: 'Presents', targetCents: 30_000, dueMonth: '2026-12' };
const musical: Expense = { id: 'musical', name: 'Musical', targetCents: 22_000, dueMonth: '2026-12' };
const trip: Expense = { id: 'trip', name: 'Trip', targetCents: 60_000, dueMonth: '2027-02' };
const expenses = [presents, musical, trip];
const setAside300: LogEntry = { id: 'in', kind: 'set-aside', date: '2026-11-22', month: NOVEMBER, amountCents: 30_000 };

describe('previewTakeOut', () => {
  it('shows the money as still to put aside this period', () => {
    const preview = previewTakeOut(expenses, [setAside300], NOVEMBER, START, 30_000, TODAY);
    expect(preview).toMatchObject({ openBeforeCents: 0, openAfterCents: 28_000, fromExtraCents: 0 });
  });

  it("shows what happens later if it isn't put back this period", () => {
    const preview = previewTakeOut(expenses, [setAside300], NOVEMBER, START, 30_000, TODAY);
    // Usually the €20 you were ahead lowers the rest to €273.33. Without the €300 back,
    // December has to cover its €520 of bills in full, and the trip's months rise a little.
    expect(groupChanges(preview.laterChanges)).toEqual([
      { from: '2026-12', to: '2026-12', beforeCents: 27_334, afterCents: 52_000 },
      { from: '2027-01', to: '2027-02', beforeCents: 27_333, afterCents: 30_000 },
    ]);
    expect(preview.backToNormal).toBeNull();
  });

  it('costs nothing when it comes out of money no expense needs', () => {
    const rich: LogEntry[] = [{ id: 'start', kind: 'adjustment', amountCents: 130_000 }];
    const preview = previewTakeOut(expenses, rich, NOVEMBER, START, 10_000, TODAY);
    expect(preview).toMatchObject({
      openBeforeCents: 0,
      openAfterCents: 0,
      extraCents: 18_000,
      fromExtraCents: 10_000,
      laterChanges: [],
    });
  });
});

describe('groupChanges', () => {
  it('joins neighbouring paychecks with the same change, a cent apart counting as the same', () => {
    expect(
      groupChanges([
        { month: '2026-12', beforeCents: 30_000, afterCents: 35_000 },
        { month: '2027-01', beforeCents: 30_000, afterCents: 34_999 },
        { month: '2027-02', beforeCents: 30_000, afterCents: 31_000 },
      ]),
    ).toEqual([
      { from: '2026-12', to: '2027-01', beforeCents: 30_000, afterCents: 35_000 },
      { from: '2027-02', to: '2027-02', beforeCents: 30_000, afterCents: 31_000 },
    ]);
  });
});
