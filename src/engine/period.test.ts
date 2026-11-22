import { describe, expect, it } from 'vitest';
import { periodStatus } from './period';
import type { Expense, LogEntry } from './types';

// The situation from our conversation, with made-up amounts: €1,120 of expenses
// over four paychecks from November, nothing in the pot yet → €280 each.
const NOVEMBER = '2026-11';
const START = '2026-11-21';
const expenses: Expense[] = [
  { id: 'presents', name: 'Presents', targetCents: 30_000, dueMonth: '2026-12' },
  { id: 'musical', name: 'Musical', targetCents: 22_000, dueMonth: '2026-12' },
  { id: 'trip', name: 'Trip', targetCents: 60_000, dueMonth: '2027-02' },
];
const setAside300: LogEntry = { id: 'in', kind: 'set-aside', date: '2026-11-22', month: NOVEMBER, amountCents: 30_000 };

function totals(log: LogEntry[]): number[] {
  return periodStatus(expenses, log, NOVEMBER, START).plan.map((month) => month.totalCents);
}

describe('the current period', () => {
  it('is done once you set aside its amount', () => {
    const status = periodStatus(expenses, [setAside300], NOVEMBER, START);
    expect(status.plannedCents).toBe(28_000);
    expect(status.openCents).toBe(0);
  });

  it('keeps its amount when you take out what you put in: the two cancel out', () => {
    const out: LogEntry = { id: 'out', kind: 'withdrawal', date: '2026-11-23', month: NOVEMBER, amountCents: 30_000, reason: 'Trip' };
    const status = periodStatus(expenses, [setAside300, out], NOVEMBER, START);
    expect(status.plannedCents).toBe(28_000);
    expect(status.movements.netCents).toBe(0);
    expect(status.openCents).toBe(28_000);
    // Later paychecks are untouched as long as you put it back this period.
    expect(totals([setAside300, out])).toEqual([28_000, 28_000, 28_000, 28_000]);
  });

  it('treats a correction the same way: €300 set aside, corrected to €200, leaves €80 open', () => {
    const fix: LogEntry = { id: 'fix', kind: 'adjustment', amountCents: -10_000, date: '2026-11-23', note: 'Correction' };
    const status = periodStatus(expenses, [setAside300, fix], NOVEMBER, START);
    expect(status.movements.netCents).toBe(20_000);
    expect(status.openCents).toBe(8_000);
  });

  it('lowers later paychecks right away when you put in more than it asks', () => {
    const setAside500: LogEntry = { ...setAside300, amountCents: 50_000 };
    const status = periodStatus(expenses, [setAside500], NOVEMBER, START);
    expect(status.plannedCents).toBe(28_000);
    expect(status.openCents).toBe(0);
    expect(status.aheadCents).toBe(22_000);
    // The €220 extra is spread over the rest straight away, not only from the next payday.
    expect(totals([setAside500])).toEqual([28_000, 20_700, 20_700, 20_600]);
    // The same numbers the next payday would bring.
    const december = periodStatus(expenses, [setAside500], '2026-12', '2026-12-21');
    expect(december.plan.map((month) => month.totalCents)).toEqual([20_700, 20_700, 20_600]);
  });

  it("still lists this period's bills only once", () => {
    // Paid from this paycheck: the December bills, due before the next payday.
    const early: Expense[] = expenses.map((expense) => (expense.dueMonth === '2026-12' ? { ...expense, dueMonth: NOVEMBER } : expense));
    const setAside700: LogEntry = { ...setAside300, amountCents: 70_000 };
    const plan = periodStatus(early, [setAside700], NOVEMBER, START).plan;
    expect(plan.map((month) => month.totalCents)).toEqual([52_000, 14_000, 14_000, 14_000]);
    expect(plan.map((month) => Object.keys(month.billsOut))).toEqual([['presents', 'musical'], [], [], ['trip']]);
  });

  it('goes back to normal when you take the extra out again', () => {
    const setAside500: LogEntry = { ...setAside300, amountCents: 50_000 };
    const out = (amountCents: number): LogEntry => ({ id: 'out', kind: 'withdrawal', date: '2026-11-23', month: NOVEMBER, amountCents, reason: 'Concert' });
    expect(totals([setAside500, out(22_000)])).toEqual([28_000, 28_000, 28_000, 28_000]);
    // Taking out more: this period shows what to put back, later ones stay.
    expect(periodStatus(expenses, [setAside500, out(40_000)], NOVEMBER, START).openCents).toBe(18_000);
    expect(totals([setAside500, out(40_000)])).toEqual([28_000, 28_000, 28_000, 28_000]);
  });

  it('counts an earlier correction upwards the same way', () => {
    const fix: LogEntry = { id: 'fix', kind: 'adjustment', amountCents: 22_000, date: '2026-11-23', note: 'Correction' };
    const setAside280: LogEntry = { ...setAside300, amountCents: 28_000 };
    expect(totals([setAside280, fix])).toEqual([28_000, 20_700, 20_700, 20_600]);
  });

  it('asks for nothing back when the money came out of extra', () => {
    // €1,300 in the pot from before: €180 more than all expenses need.
    const rich: LogEntry[] = [{ id: 'start', kind: 'adjustment', amountCents: 130_000 }];
    const out: LogEntry = { id: 'out', kind: 'withdrawal', date: '2026-11-23', month: NOVEMBER, amountCents: 10_000, reason: 'Concert' };
    expect(periodStatus(expenses, [...rich, out], NOVEMBER, START).openCents).toBe(0);
  });

  it('spreads a gap that is still there when the next period starts', () => {
    // November ended €280 short. December's bills (€520) are due in December, so the gap
    // can't be spread past them: December covers them in full, the trip spreads after.
    const december = periodStatus(expenses, [], '2026-12', '2026-12-21');
    expect(december.plan.map((month) => month.totalCents)).toEqual([52_000, 30_000, 30_000]);
  });
});

describe('how the pot is shared', () => {
  it('follows the plan while that asks nothing extra', () => {
    // €300 set aside in November, now December: following the plan still asks €274, €273, €273.
    const december = periodStatus(expenses, [setAside300], '2026-12', '2026-12-21');
    expect(december.rule).toBe('plan');
    expect(december.plan.map((month) => month.totalCents)).toEqual([27_400, 27_300, 27_300]);
    // The ledger split follows the plan too: the December bills get the rest they still need.
    expect(december.plan[0].byEnvelope.presents).toBe(30_000 - 16_072);
  });

  it('covers the closest deadlines first when you are behind and it matters', () => {
    // Only €100 in November: following the plan would ask €427 in December instead of €420.
    const short: LogEntry = { ...setAside300, amountCents: 10_000 };
    const december = periodStatus(expenses, [short], '2026-12', '2026-12-21');
    expect(december.rule).toBe('closest');
    expect(december.plan.map((month) => month.totalCents)).toEqual([42_000, 30_000, 30_000]);
  });
});
