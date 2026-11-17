import { describe, expect, it } from 'vitest';
import { planSetAside } from './plan';
import { fundingMonth, paycheckDates, paycheckMonthOf, paycheckRange, periodMonth, planningView } from './timing';
import type { Envelope } from './types';

// Payday on the 21st, as in the examples we discussed. Amounts are made up.
const PAYDAY = 21;

function expense(fields: Partial<Envelope>): Envelope {
  return { id: 'x', name: 'x', targetCents: 20_000, dueMonth: '2026-12', savedCents: 0, ...fields };
}

describe('which paycheck pays for it', () => {
  it('uses the previous paycheck for anything needed before payday', () => {
    expect(fundingMonth(expense({ dueMonth: '2026-12', dueDate: '2026-12-05' }), PAYDAY)).toBe('2026-11');
  });

  it("uses that month's paycheck from payday on", () => {
    expect(fundingMonth(expense({ dueMonth: '2027-01', dueDate: '2027-01-28' }), PAYDAY)).toBe('2027-01');
    expect(fundingMonth(expense({ dueMonth: '2027-01', dueDate: '2027-01-21' }), PAYDAY)).toBe('2027-01');
  });

  it('treats a month on its own as "ready when the month starts"', () => {
    expect(fundingMonth(expense({ dueMonth: '2026-12' }), PAYDAY)).toBe('2026-11');
  });

  it('changes nothing with payday on the 1st', () => {
    expect(fundingMonth(expense({ dueMonth: '2026-12' }), 1)).toBe('2026-12');
    expect(fundingMonth(expense({ dueMonth: '2026-12', dueDate: '2026-12-05' }), 1)).toBe('2026-12');
  });

  it('moves payday to the last day in shorter months', () => {
    // Payday on the 31st: in February it falls on the 28th.
    expect(paycheckMonthOf('2027-02-28', 31)).toBe('2027-02');
    expect(paycheckMonthOf('2027-02-27', 31)).toBe('2027-01');
  });
});

describe('the current paycheck', () => {
  it('is still the previous one until payday arrives', () => {
    expect(paycheckMonthOf('2026-11-16', PAYDAY)).toBe('2026-10');
    expect(paycheckMonthOf('2026-11-21', PAYDAY)).toBe('2026-11');
    expect(paycheckMonthOf('2026-12-05', PAYDAY)).toBe('2026-11');
  });

  it('is opened by the last payday and closed by the next one', () => {
    expect(paycheckDates('2026-10', PAYDAY)).toEqual({ last: '2026-10-21', next: '2026-11-21' });
    expect(paycheckDates('2027-01', 31)).toEqual({ last: '2027-01-31', next: '2027-02-28' });
  });

  it('runs from payday to the day before the next one', () => {
    expect(paycheckRange('2026-11', PAYDAY)).toEqual({ from: '2026-11-21', to: '2026-12-20' });
    expect(paycheckRange('2026-11', 1)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(paycheckRange('2027-01', 31)).toEqual({ from: '2027-01-31', to: '2027-02-27' });
  });
});

describe('the month a period is named after', () => {
  it('is the month holding most of its days', () => {
    // 21 Oct – 20 Nov: 11 days in October, 20 in November.
    expect(periodMonth('2026-10', PAYDAY)).toBe('2026-11');
    // 5 Nov – 4 Dec: mostly November.
    expect(periodMonth('2026-11', 5)).toBe('2026-11');
  });

  it('is the month itself with payday on the 1st', () => {
    expect(periodMonth('2026-11', 1)).toBe('2026-11');
  });

  it('goes to the starting month on a tie', () => {
    // 16 Nov – 15 Dec: 15 days each.
    expect(periodMonth('2026-11', 16)).toBe('2026-11');
  });
});

describe('planning by paycheck', () => {
  it('saves for early-December presents from the November paycheck only', () => {
    const presents = expense({ id: 'presents', dueMonth: '2026-12', dueDate: '2026-12-05' });
    const byPaycheck = planSetAside(planningView([presents], PAYDAY), '2026-11');
    expect(byPaycheck.map((month) => month.totalCents)).toEqual([20_000]);

    // By calendar month it would have been spread over Nov and Dec — too late.
    expect(planSetAside([presents], '2026-11').map((month) => month.totalCents)).toEqual([10_000, 10_000]);
  });

  it('leaves real dates untouched outside the planning copy', () => {
    const presents = expense({ dueMonth: '2026-12', dueDate: '2026-12-05' });
    planningView([presents], PAYDAY);
    expect(presents.dueMonth).toBe('2026-12');
  });
});
