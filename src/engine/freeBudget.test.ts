import { describe, expect, it } from 'vitest';
import { freeBudget, type FreeBudgetInput } from './freeBudget';
import type { MonthPlan } from './plan';
import type { Expense, FixedCost, LogEntry } from './types';

// Made-up numbers. Payday on the 24th; today's paycheck is November's.
const PAYDAY = 24;
const month = (key: string, totalCents: number): MonthPlan => ({ month: key, totalCents, byEnvelope: {}, billsOut: {} });
const plan = [month('2026-11', 38_000), month('2026-12', 25_000), month('2027-01', 25_000)];
const fixedCosts: FixedCost[] = [
  { id: 'rent', name: 'Rent', amountCents: 90_000 },
  { id: 'phone', name: 'Phone', amountCents: 30_000 },
];
// 15 Jan falls in the paycheck that starts on 24 Dec.
const concert: Expense = { id: 'concert', name: 'Concert', targetCents: 15_000, dueMonth: '2027-01', dueDate: '2027-01-15' };
const loggedNovember: LogEntry = { id: 'pay', kind: 'paycheck', date: '2026-11-24', month: '2026-11', amountCents: 260_000 };

function rows(overrides: Partial<FreeBudgetInput> = {}) {
  return freeBudget({
    plan,
    fromPaycheck: [concert],
    fixedCosts,
    log: [loggedNovember],
    usualPayCents: 250_000,
    payday: PAYDAY,
    currentPaycheck: '2026-11',
    ...overrides,
  });
}

describe('the free budget forecast', () => {
  it('adds up what each paycheck carries: put aside, fixed costs and what it pays directly', () => {
    expect(rows().map((row) => [row.paycheck, row.putAsideCents, row.fixedCents, row.fromPayCents, row.loadCents])).toEqual([
      ['2026-11', 38_000, 120_000, 0, 158_000],
      ['2026-12', 25_000, 120_000, 15_000, 160_000],
      ['2027-01', 25_000, 120_000, 0, 145_000],
    ]);
    expect(rows()[1].fromPay).toEqual([{ id: 'concert', name: 'Concert', cents: 15_000 }]);
  });

  it('uses what really arrived for a logged paycheck, and your usual pay for the rest', () => {
    expect(rows().map((row) => [row.incomeCents, row.incomeIsReal, row.freeCents])).toEqual([
      [260_000, true, 102_000],
      [250_000, false, 90_000],
      [250_000, false, 105_000],
    ]);
  });

  it('still shows the load before you enter any pay, without a free amount', () => {
    const [first] = rows({ usualPayCents: undefined, log: [] });
    expect(first.loadCents).toBe(158_000);
    expect(first.incomeCents).toBeUndefined();
    expect(first.freeCents).toBeUndefined();
  });

  it('goes below zero when a paycheck carries more than it brings', () => {
    expect(rows({ usualPayCents: 150_000 })[1].freeCents).toBe(-10_000);
  });

  it('reaches as far as an expense paid from a later paycheck', () => {
    const late: Expense = { ...concert, dueMonth: '2027-03', dueDate: '2027-03-10' };
    const result = rows({ fromPaycheck: [late] });
    expect(result.map((row) => row.paycheck)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(result[3]).toMatchObject({ putAsideCents: 0, fromPayCents: 15_000, loadCents: 135_000 });
  });

  it('counts a finished one at what it really cost, and leaves out the past', () => {
    const done: Expense = { ...concert, done: { date: '2027-01-15', costCents: 18_000 } };
    expect(rows({ fromPaycheck: [done] })[1].fromPayCents).toBe(18_000);
    const past: Expense = { ...concert, dueMonth: '2026-10', dueDate: '2026-10-30' };
    expect(rows({ fromPaycheck: [past] }).every((row) => row.fromPayCents === 0)).toBe(true);
  });
});
