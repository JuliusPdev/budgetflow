import { describe, expect, it } from 'vitest';
import { previewDone, previewPayment } from './paymentPreview';
import { addUpParts, coverPaidFirst, lastPaymentCents, paidCentsById, progressById, splitPayment, ticksToPayments, withPayments } from './payments';
import { withShares } from './pot';
import type { Expense, LogEntry, PaymentEntry } from './types';

// Made-up amounts. Plain calendar months (payday on the 1st) unless a test says otherwise.
const NOVEMBER = '2026-11';
const START = '2026-11-01';
const trip: Expense = { id: 'trip', name: 'Trip', targetCents: 80_000, dueMonth: '2027-02', dueDate: '2027-02-25' };
const gifts: Expense = { id: 'gifts', name: 'Gifts', targetCents: 30_000, dueMonth: NOVEMBER };

function payment(id: string, date: string, envelopeId: string, amountCents: number): PaymentEntry {
  return { id, kind: 'payment', date, envelopeId, amountCents };
}

describe('splitting an expense by its payments', () => {
  it('leaves an expense without payments as it is', () => {
    expect(withPayments([trip], [], 1)).toEqual([trip]);
  });

  it('becomes the part still to pay, plus one paid part per payment', () => {
    const log: LogEntry[] = [payment('a', '2026-11-22', 'trip', 30_000), payment('b', '2026-12-03', 'trip', 10_000)];
    const parts = withPayments([trip], log, 1);
    // The part still to pay keeps the expense's id, so its bar and share stay put.
    expect(parts[0]).toEqual({ ...trip, targetCents: 40_000 });
    expect(parts.slice(1).map((part) => [part.id, part.targetCents, part.paidMonth, part.partOf])).toEqual([
      ['trip~a', 30_000, '2026-11', 'trip'],
      ['trip~b', 10_000, '2026-12', 'trip'],
    ]);
  });

  it('puts a payment in the paycheck it was made in', () => {
    // Payday on the 21st: 3 Dec still belongs to the paycheck that arrived 21 Nov.
    const [, paid] = withPayments([trip], [payment('a', '2026-12-03', 'trip', 10_000)], 21);
    expect(paid.paidMonth).toBe('2026-11');
  });

  it('has only paid parts once everything is paid', () => {
    const parts = withPayments([trip], [payment('a', '2026-11-22', 'trip', 80_000)], 1);
    expect(parts.map((part) => part.id)).toEqual(['trip~a']);
  });

  it('adds payments up per expense', () => {
    const log: LogEntry[] = [payment('a', '2026-11-22', 'trip', 30_000), payment('b', '2026-12-03', 'trip', 10_000)];
    expect(paidCentsById(log)).toEqual({ trip: 40_000 });
  });

  it('adds the parts back together for the screens', () => {
    const parts = withPayments([trip], [payment('a', '2026-11-22', 'trip', 30_000)], 1);
    // €100 in the pot for what's left, €50 of the €300 paid already put back.
    const shown = withShares(parts, { shares: { trip: 10_000, 'trip~a': 5_000 }, extraCents: 0, shortfallCents: 0 }, NOVEMBER);
    expect(progressById(shown)).toEqual({ trip: { paidCents: 30_000, coveredCents: 15_000 } });
  });
});

describe('showing the parts as one expense', () => {
  const parts = withPayments([trip, gifts], [payment('a', '2026-11-22', 'trip', 30_000)], 1);

  it('adds up each paycheck’s amounts per expense', () => {
    expect(addUpParts({ trip: 8_000, 'trip~a': 5_500, gifts: 4_100 }, parts)).toEqual({ trip: 13_500, gifts: 4_100 });
  });

  it('covers what was paid before what is still to pay', () => {
    // €181 held for the trip, but €300 of it already paid: the €181 went into that payment.
    const shown = withShares(parts, { shares: { trip: 18_100, 'trip~a': 0, gifts: 10_000 }, extraCents: 0, shortfallCents: 0 }, NOVEMBER);
    const covered = coverPaidFirst(shown);
    expect(covered.map((part) => [part.id, part.savedCents])).toEqual([
      ['trip', 0],
      ['trip~a', 18_100],
      ['gifts', 10_000],
    ]);
    expect(progressById(covered).trip.coveredCents).toBe(18_100);
  });
});

describe('old "Already paid" ticks', () => {
  it('become one payment of the full amount on the 1st of that month', () => {
    const { expenses, payments } = ticksToPayments([{ ...trip, paidMonth: '2026-10' }, gifts]);
    expect(expenses).toEqual([trip, gifts]);
    expect(payments).toEqual([payment('paid-trip', '2026-10-01', 'trip', 80_000)]);
  });
});

describe('what paying towards an expense changes', () => {
  // The pot holds €300, all of it for the gifts due this month.
  const log: LogEntry[] = [{ id: 'start', kind: 'adjustment', amountCents: 30_000 }];

  it('takes the money out of the pot and says what is left to pay', () => {
    const preview = previewPayment([gifts, trip], log, 1, NOVEMBER, START, payment('p', '2026-11-22', 'trip', 30_000));
    expect(preview.potBeforeCents).toBe(30_000);
    expect(preview.potAfterCents).toBe(0);
    expect(preview.leftAfterCents).toBe(50_000);
  });

  it('says how much was borrowed from your other expenses', () => {
    const preview = previewPayment([gifts, trip], log, 1, NOVEMBER, START, payment('p', '2026-11-22', 'trip', 30_000));
    // Nothing in the pot was for the trip yet: all €300 is the gifts' money.
    expect(preview.ownMoneyCents).toBe(0);
    expect(preview.borrowedCents).toBe(30_000);
  });

  it('asks for the borrowed money back before the expense it came from is due', () => {
    const preview = previewPayment([gifts, trip], log, 1, NOVEMBER, START, payment('p', '2026-11-22', 'trip', 30_000));
    // The gifts need their €300 this month, so it goes back in now; the trip
    // then needs €300 less from the later paychecks.
    expect(preview.openAfterCents - preview.openBeforeCents).toBe(preview.laterChanges.reduce((sum, change) => sum + change.beforeCents - change.afterCents, 0));
    expect(preview.openAfterCents).toBeGreaterThan(preview.openBeforeCents);
  });

  it('changes no paycheck when the money would be back in time anyway', () => {
    // A trip due later, paid from money meant for something due even later.
    const laptop: Expense = { id: 'laptop', name: 'Laptop', targetCents: 100_000, dueMonth: '2027-06' };
    const preview = previewPayment([trip, laptop], log, 1, NOVEMBER, START, payment('p', '2026-11-22', 'trip', 30_000));
    expect(preview.openAfterCents).toBe(preview.openBeforeCents);
    expect(preview.laterChanges).toEqual([]);
  });
});

describe('finishing an expense', () => {
  const done = { date: '2026-11-22', costCents: 70_000 };

  it('needs nothing more once done, even if less was paid than planned', () => {
    const parts = withPayments([{ ...trip, done }], [payment('a', '2026-11-22', 'trip', 70_000)], 1);
    expect(parts.map((part) => [part.id, part.targetCents])).toEqual([['trip~a', 70_000]]);
  });

  it('drops out of the plan when it cost nothing (cancelled)', () => {
    expect(withPayments([{ ...trip, done: { date: '2026-11-22', costCents: 0 } }, gifts], [], 1)).toEqual([gifts]);
  });

  it('lets the pot pay what it really cost, minus what is paid already', () => {
    // €800 planned, €300 paid.
    expect(lastPaymentCents(80_000, 30_000, 80_000, 'pot')).toBe(50_000);
    expect(lastPaymentCents(80_000, 30_000, 70_000, 'pot')).toBe(40_000);
    expect(lastPaymentCents(80_000, 30_000, 95_000, 'pot')).toBe(65_000);
  });

  it('pays only up to the plan when the extra came from spending money', () => {
    expect(lastPaymentCents(80_000, 30_000, 95_000, 'spending')).toBe(50_000);
    expect(lastPaymentCents(80_000, 80_000, 95_000, 'spending')).toBe(0);
  });

  it('frees later paychecks when it cost less than planned', () => {
    const log: LogEntry[] = [{ id: 'start', kind: 'adjustment', amountCents: 30_000 }];
    const preview = previewDone([gifts, trip], log, 1, NOVEMBER, START, 'trip', { date: '2026-11-22', costCents: 0 }, null);
    expect(preview.potAfterCents).toBe(preview.potBeforeCents);
    expect(preview.laterChanges.length).toBeGreaterThan(0);
    expect(preview.laterChanges.every((change) => change.afterCents < change.beforeCents)).toBe(true);
    expect(preview.leftAfterCents).toBe(0);
  });

  it('takes the last payment out of the pot', () => {
    const log: LogEntry[] = [{ id: 'start', kind: 'adjustment', amountCents: 90_000 }];
    const last = payment('last', '2026-11-22', 'trip', 70_000);
    const preview = previewDone([gifts, trip], log, 1, NOVEMBER, START, 'trip', { ...done, paymentId: 'last' }, last);
    expect(preview.potAfterCents).toBe(20_000);
    expect(preview.ownMoneyCents + preview.borrowedCents).toBe(70_000);
  });
});

describe('paying more than planned, or more than the pot holds', () => {
  it('lets the pot pay it all when it holds enough and the extra comes from the pot', () => {
    // €800 planned, €900 guide, €1,000 in the pot.
    expect(splitPayment(90_000, 80_000, 100_000, 'pot')).toEqual({ fromPotCents: 90_000, fromSpendingCents: 0, extraCents: 10_000, shortCents: 0 });
  });

  it('leaves the extra to your spending money when you say so', () => {
    expect(splitPayment(90_000, 80_000, 100_000, 'spending')).toEqual({ fromPotCents: 80_000, fromSpendingCents: 10_000, extraCents: 10_000, shortCents: 0 });
  });

  it('never takes more than the pot holds', () => {
    // Only €500 in the pot: the other €400 came from somewhere else.
    expect(splitPayment(90_000, 80_000, 50_000, 'pot')).toEqual({ fromPotCents: 50_000, fromSpendingCents: 40_000, extraCents: 10_000, shortCents: 40_000 });
    expect(splitPayment(30_000, 80_000, -5_000, 'pot').fromPotCents).toBe(0);
  });

  it('counts money from spending as paid, but puts back only what the pot paid', () => {
    const log: LogEntry[] = [{ ...payment('a', '2026-11-22', 'trip', 50_000), fromSpendingCents: 40_000 }];
    expect(paidCentsById(log)).toEqual({ trip: 90_000 });
    // €800 planned, €900 paid: nothing left to pay; only the pot's €500 is a paid part.
    expect(withPayments([trip], log, 1).map((part) => [part.id, part.targetCents])).toEqual([['trip~a', 50_000]]);
  });

  it('has no paid part for a payment made entirely from spending money', () => {
    const log: LogEntry[] = [{ ...payment('a', '2026-11-22', 'trip', 0), fromSpendingCents: 20_000 }];
    expect(withPayments([trip], log, 1).map((part) => [part.id, part.targetCents])).toEqual([['trip', 60_000]]);
  });

  it('shows a raised plan in the preview', () => {
    const log: LogEntry[] = [{ id: 'start', kind: 'adjustment', amountCents: 100_000 }];
    const preview = previewPayment([trip], log, 1, NOVEMBER, START, payment('p', '2026-11-22', 'trip', 90_000), 90_000);
    expect(preview.potAfterCents).toBe(10_000);
    expect(preview.leftAfterCents).toBe(0);
  });
});
