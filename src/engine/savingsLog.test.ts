import { describe, expect, it } from 'vitest';
import { planSetAside } from './plan';
import { potAtPeriodStart, potCents, setAsideInMonth, stillOpenThisMonth } from './savingsLog';
import type { Expense, LogEntry } from './types';

// All amounts are made up.
const NOVEMBER = '2026-11';
const flights: Expense = { id: 'flights', name: 'Flights', targetCents: 90_000, dueMonth: '2027-01' };
const tyres: Expense = { id: 'tyres', name: 'Tyres', targetCents: 40_000, dueMonth: '2026-10', paidMonth: '2026-10' };

const log: LogEntry[] = [
  { id: 'start', kind: 'adjustment', amountCents: 60_000, note: 'Starting balance' },
  { id: 'oct', kind: 'set-aside', date: '2026-10-25', month: '2026-10', amountCents: 20_000 },
  { id: 'nov', kind: 'set-aside', date: '2026-11-22', month: NOVEMBER, amountCents: 15_000 },
  { id: 'fix', kind: 'adjustment', amountCents: -5_000, date: '2026-11-23' },
];

describe('the savings log', () => {
  it('adds up what was set aside in one period', () => {
    expect(setAsideInMonth(log, NOVEMBER)).toBe(15_000);
    expect(setAsideInMonth(log, '2026-12')).toBe(0);
  });

  it("knows what's still open of this period's plan", () => {
    const novemberPlan = planSetAside([{ ...flights, savedCents: 30_000 }], NOVEMBER)[0];
    expect(novemberPlan.totalCents).toBe(20_000);
    expect(stillOpenThisMonth(novemberPlan, log)).toBe(5_000);
    expect(stillOpenThisMonth(undefined, log)).toBe(0);
  });
});

describe('the pot', () => {
  it('is everything put in and corrected, minus bills paid out of it', () => {
    // 600 + 200 + 150 − 50 − 400 for the paid tyres.
    expect(potCents([flights, tyres], log)).toBe(50_000);
  });

  it('can go below zero when more was paid than put in', () => {
    expect(potCents([tyres], [])).toBe(-40_000);
  });

  it("leaves out this period's set-asides when planning it", () => {
    expect(potAtPeriodStart([flights, tyres], log, NOVEMBER)).toBe(35_000);
  });
});
