import { describe, expect, it } from 'vitest';
import type { Month, MonthResult, PlannedExpense, PlannedExpensePayment } from '../engine/types';
import { plannedExpenseLedgerCell, setAsideLedgerAmount } from './ledgerDisplay';

function monthResult(overrides: Partial<MonthResult> & Pick<MonthResult, 'month'>): MonthResult {
  return {
    monthlyIncome: 3500,
    availableAfterFixed: 3000,
    plannedExpenses: [],
    plannedTotal: 0,
    unplannedExpenses: [],
    unplannedTotal: 0,
    incomeCarryover: 0,
    setAsideRecommended: 0,
    setAsideRecovery: 0,
    setAsideFunding: 0,
    plannedExpenseRecoverySlices: [],
    setAsideLocked: 0,
    freeBudget: 0,
    potAfter: 0,
    physicalPotAfter: 0,
    lockStatus: 'unlocked',
    ...overrides,
  };
}

const trip: PlannedExpense = {
  id: 'trip',
  name: 'Trip',
  amount: 800,
  targetMonth: '2026-09',
  category: 'travel',
  confidence: 'confirmed',
};

describe('setAsideLedgerAmount', () => {
  const currentMonth: Month = '2026-06';
  const isReconciled = (m: Month) => m === '2026-05';

  it('uses locked amount for reconciled past month when recommended is zero', () => {
    const may = monthResult({
      month: '2026-05',
      setAsideLocked: 200,
      setAsideRecommended: 0,
    });
    expect(setAsideLedgerAmount(may, currentMonth, isReconciled)).toBe(200);
  });

  it('uses recommended amount for future months', () => {
    const july = monthResult({
      month: '2026-07',
      setAsideLocked: 0,
      setAsideRecommended: 150,
    });
    expect(setAsideLedgerAmount(july, currentMonth, isReconciled)).toBe(150);
  });

  it('uses locked when current month locked exceeds recommended', () => {
    const june = monthResult({
      month: '2026-06',
      setAsideLocked: 250,
      setAsideRecommended: 200,
    });
    expect(setAsideLedgerAmount(june, currentMonth, () => false)).toBe(250);
  });
});

describe('plannedExpenseLedgerCell', () => {
  const payments: PlannedExpensePayment[] = [
    {
      id: 'pay1',
      plannedExpenseId: 'trip',
      month: '2026-05',
      amount: 400,
      potDeduction: 400,
    },
  ];

  it('shows early payment in payment month', () => {
    expect(plannedExpenseLedgerCell(trip, '2026-05', payments)).toEqual({
      kind: 'early-payment',
      amount: 400,
    });
  });

  it('shows target amount in target month alongside early payment elsewhere', () => {
    expect(plannedExpenseLedgerCell(trip, '2026-09', payments)).toEqual({
      kind: 'target',
      amount: 800,
    });
    expect(plannedExpenseLedgerCell(trip, '2026-06', payments)).toEqual({ kind: 'empty' });
  });
});
