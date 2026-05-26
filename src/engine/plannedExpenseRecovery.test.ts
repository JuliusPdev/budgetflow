import { describe, expect, it } from 'vitest';
import type { PlannedExpense, PlannedExpensePayment, PlannedExpenseRecovery } from './types';
import type { BudgetState } from './types';
import {
  backfillRecoveriesFromLockIns,
  recoveriesFromLockInAmount,
  recoveryOwedForExpense,
  removeRecoveriesForFreeUp,
  splitSetAsideForMonth,
} from './plannedExpenseRecovery';

const trip: PlannedExpense = {
  id: 'trip',
  name: 'Trip',
  amount: 800,
  targetMonth: '2026-05',
  category: 'travel',
  confidence: 'confirmed',
};

const payment: PlannedExpensePayment = {
  id: 'p1',
  plannedExpenseId: 'trip',
  month: '2026-02',
  amount: 400,
  potDeduction: 200,
};

describe('plannedExpenseRecovery', () => {
  it('recovery owed is only the free-budget portion of payments', () => {
    expect(recoveryOwedForExpense('trip', [payment], [])).toBe(200);
  });

  it('recovery owed decreases as recoveries are recorded', () => {
    const recoveries: PlannedExpenseRecovery[] = [
      { id: 'r1', plannedExpenseId: 'trip', month: '2026-03', amount: 100 },
    ];
    expect(recoveryOwedForExpense('trip', [payment], recoveries)).toBe(100);
  });

  it('splitSetAside allocates recovery before funding', () => {
    const split = splitSetAsideForMonth(200, [trip], [payment], []);
    expect(split.recovery).toBe(200);
    expect(split.funding).toBe(0);
    expect(split.byExpense[0]?.amount).toBe(200);
  });

  it('after recovery is complete, all set-aside funds the plan', () => {
    const recoveries: PlannedExpenseRecovery[] = [
      { id: 'r1', plannedExpenseId: 'trip', month: '2026-03', amount: 200 },
    ];
    const split = splitSetAsideForMonth(200, [trip], [payment], recoveries);
    expect(split.recovery).toBe(0);
    expect(split.funding).toBe(200);
  });

  it('recoveriesFromLockInAmount books recovery slice from a lock-in', () => {
    const booked = recoveriesFromLockInAmount(200, '2026-03', [trip], [payment], []);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({
      plannedExpenseId: 'trip',
      month: '2026-03',
      amount: 200,
    });
  });

  it('removeRecoveriesForFreeUp reverses newest recovery in that month first', () => {
    const recoveries: PlannedExpenseRecovery[] = [
      { id: 'r1', plannedExpenseId: 'trip', month: '2026-03', amount: 100 },
      { id: 'r2', plannedExpenseId: 'trip', month: '2026-03', amount: 100 },
    ];
    const next = removeRecoveriesForFreeUp(150, '2026-03', recoveries);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: 'r1', amount: 50 });
  });

  it('backfillRecoveriesFromLockIns rebuilds ledger from historical lock-ins', () => {
    const budget: BudgetState = {
      income: 3000,
      fixedExpenses: [],
      plannedExpenses: [trip],
      savingsGoals: [],
      lockIns: [{ id: 'l1', month: '2026-03', lockedAmount: 200, lockState: 'planned' }],
      unplannedExpenses: [],
      envelopeActualizations: [],
      plannedExpensePayments: [payment],
      plannedExpenseRecoveries: [],
      plannedExpenseSettlements: [],
    };
    const ledger = backfillRecoveriesFromLockIns(budget);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(200);
  });
});
