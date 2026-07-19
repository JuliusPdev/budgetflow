import { describe, expect, it } from 'vitest';
import {
  plannedExpenseLedgerCell,
  plannedExpenseLedgerColumnTotal,
} from './ledgerDisplay';
import type { PlannedExpense, PlannedExpensePayment } from '../engine/types';

const expense: PlannedExpense = {
  id: 'trip',
  name: 'Trip',
  amount: 800,
  targetMonth: '2026-08',
  category: 'travel',
  confidence: 'confirmed',
};

describe('plannedExpenseLedgerCell', () => {
  it('includes paymentId on early-payment cells so edit/remove modal can open', () => {
    const payments: PlannedExpensePayment[] = [
      {
        id: 'pay-jun',
        plannedExpenseId: 'trip',
        month: '2026-06',
        amount: 400,
        potDeduction: 400,
      },
    ];

    const cell = plannedExpenseLedgerCell(expense, '2026-06', payments);

    expect(cell).toEqual({
      kind: 'early-payment',
      amount: 400,
      paymentId: 'pay-jun',
    });
  });

  it('returns target cell with full amount when nothing paid yet', () => {
    const cell = plannedExpenseLedgerCell(expense, '2026-08', []);
    expect(cell).toEqual({ kind: 'target', amount: 800 });
  });

  it('returns target cell with remaining amount on the expense target month', () => {
    const payments: PlannedExpensePayment[] = [
      {
        id: 'pay-jun',
        plannedExpenseId: 'trip',
        month: '2026-06',
        amount: 400,
        potDeduction: 400,
      },
    ];
    const cell = plannedExpenseLedgerCell(expense, '2026-08', payments);
    expect(cell).toEqual({ kind: 'target', amount: 400 });
  });

  it('returns target-paid when fully funded before the target month', () => {
    const payments: PlannedExpensePayment[] = [
      {
        id: 'pay-jun',
        plannedExpenseId: 'trip',
        month: '2026-06',
        amount: 800,
        potDeduction: 800,
      },
    ];
    const cell = plannedExpenseLedgerCell(expense, '2026-08', payments);
    expect(cell).toEqual({ kind: 'target-paid', amount: 800 });
  });

  it('returns empty for months with no payment and no target', () => {
    const cell = plannedExpenseLedgerCell(expense, '2026-07', []);
    expect(cell).toEqual({ kind: 'empty' });
  });
});

describe('plannedExpenseLedgerColumnTotal', () => {
  const trip: PlannedExpense = {
    id: 'trip',
    name: 'Trip',
    amount: 800,
    targetMonth: '2026-08',
    category: 'travel',
    confidence: 'confirmed',
  };

  const car: PlannedExpense = {
    id: 'car',
    name: 'Car repair',
    amount: 300,
    targetMonth: '2026-06',
    category: 'transport',
    confidence: 'confirmed',
  };

  it('sums early payments and target hits per column without double-counting within a month', () => {
    const payments: PlannedExpensePayment[] = [
      {
        id: 'pay-jun',
        plannedExpenseId: 'trip',
        month: '2026-06',
        amount: 400,
        potDeduction: 400,
      },
    ];

    expect(plannedExpenseLedgerColumnTotal([trip, car], '2026-06', payments)).toBe(700);
    expect(plannedExpenseLedgerColumnTotal([trip, car], '2026-08', payments)).toBe(400);
    expect(plannedExpenseLedgerColumnTotal([trip, car], '2026-07', payments)).toBe(0);
  });

  it('excludes fully-paid target cells from October totals (Soundboks scenario)', () => {
    const soundboks: PlannedExpense = {
      id: 'soundboks',
      name: 'Soundboks',
      amount: 375,
      targetMonth: '2026-10',
      category: 'gear',
      confidence: 'confirmed',
    };
    const splitwise: PlannedExpense = {
      id: 'splitwise',
      name: 'Splitwise',
      amount: 400,
      targetMonth: '2026-10',
      category: 'general',
      confidence: 'confirmed',
    };
    const oktoberfest: PlannedExpense = {
      id: 'oktoberfest',
      name: 'Oktoberfest',
      amount: 400,
      targetMonth: '2026-10',
      category: 'travel',
      confidence: 'confirmed',
    };
    const payments: PlannedExpensePayment[] = [
      {
        id: 'pay-jun',
        plannedExpenseId: 'soundboks',
        month: '2026-06',
        amount: 375,
        potDeduction: 375,
      },
    ];
    const expenses = [soundboks, splitwise, oktoberfest];

    expect(plannedExpenseLedgerColumnTotal(expenses, '2026-06', payments)).toBe(375);
    expect(plannedExpenseLedgerColumnTotal(expenses, '2026-10', payments)).toBe(800);

    const soundboksOct = plannedExpenseLedgerCell(soundboks, '2026-10', payments);
    expect(soundboksOct).toEqual({ kind: 'target-paid', amount: 375 });
  });
});
