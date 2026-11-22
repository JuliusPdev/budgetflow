import { describe, expect, it } from 'vitest';
import { periodMovements, potAtPeriodStart, potCents } from './savingsLog';
import type { LogEntry } from './types';

// All amounts are made up. The November period starts on 21 Nov.
const NOVEMBER = '2026-11';
const PERIOD_START = '2026-11-21';

const log: LogEntry[] = [
  { id: 'start', kind: 'adjustment', amountCents: 60_000, note: 'Starting balance' },
  { id: 'tyres-paid', kind: 'payment', date: '2026-10-12', envelopeId: 'tyres', amountCents: 40_000 },
  { id: 'oct', kind: 'set-aside', date: '2026-10-25', month: '2026-10', amountCents: 20_000 },
  { id: 'old-fix', kind: 'adjustment', amountCents: -1_000, date: '2026-11-02' },
  { id: 'nov', kind: 'set-aside', date: '2026-11-22', month: NOVEMBER, amountCents: 15_000 },
  { id: 'out', kind: 'withdrawal', date: '2026-11-23', month: NOVEMBER, amountCents: 3_000, reason: 'Concert' },
  { id: 'fix', kind: 'adjustment', amountCents: -5_000, date: '2026-11-24' },
];

describe('the pot', () => {
  it('is everything put in and corrected, minus money taken out and payments', () => {
    // 600 + 200 − 10 + 150 − 30 − 50 − 400 for the paid tyres.
    expect(potCents(log)).toBe(46_000);
  });

  it('never counts a paycheck as money in the pot', () => {
    const paid: LogEntry = { id: 'pay', kind: 'paycheck', date: '2026-11-19', month: NOVEMBER, amountCents: 240_000 };
    expect(potCents([...log, paid])).toBe(46_000);
  });

  it('can go below zero when more was paid than put in', () => {
    expect(potCents([{ id: 'p', kind: 'payment', date: '2026-11-25', envelopeId: 'tyres', amountCents: 40_000 }])).toBe(
      -40_000,
    );
  });
});

describe('one savings period', () => {
  it('adds up what moved in and out of the pot during it', () => {
    expect(periodMovements(log, NOVEMBER, PERIOD_START)).toEqual({
      setAsideCents: 15_000,
      takenOutCents: 3_000,
      // The correction from 2 Nov belongs to the period before.
      correctedCents: -5_000,
      netCents: 7_000,
    });
  });

  it('started with the pot as it was before any of that', () => {
    expect(potAtPeriodStart(log, NOVEMBER, PERIOD_START)).toBe(39_000);
  });
});
