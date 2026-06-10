import { describe, it, expect } from 'vitest';
import { runEngine } from '../engine/smoothing';
import { shouldAskPlannedExpenseFundingTiming } from './PlannedExpenseFundingModal';
import type { BudgetState, PlannedExpense } from '../engine/types';

const CURRENT = '2026-01';

function makeState(
  income: number,
  expenses: Pick<PlannedExpense, 'amount' | 'targetMonth' | 'startFromMonth'>[],
): BudgetState {
  return {
    income,
    fixedExpenses: [],
    plannedExpenses: expenses.map((e, i) => ({
      id: `expense-${i}`,
      name: `Expense ${i}`,
      amount: e.amount,
      targetMonth: e.targetMonth,
      category: 'general',
      confidence: 'confirmed',
      ...(e.startFromMonth ? { startFromMonth: e.startFromMonth } : {}),
    })),
    savingsGoals: [],
    lockIns: [],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };
}

describe('shouldAskPlannedExpenseFundingTiming', () => {
  it('returns false for a far-future expense that does not move the current-month rate', () => {
    // Near-term expense already sets the binding rate; a small distant deadline does not change it.
    const budget = makeState(5000, [{ amount: 2000, targetMonth: '2026-02' }]);
    const engine = runEngine(budget, CURRENT);
    const draft = {
      name: 'Holiday',
      amount: 50,
      targetMonth: '2026-12',
      category: 'general',
      confidence: 'confirmed' as const,
    };

    expect(
      shouldAskPlannedExpenseFundingTiming(budget, engine, draft, CURRENT),
    ).toBe(false);
  });

  it('returns true when a near-future expense changes the current-month rate', () => {
    const budget = makeState(1000, []);
    const engine = runEngine(budget, CURRENT);
    const draft = {
      name: 'Insurance',
      amount: 600,
      targetMonth: '2026-02',
      category: 'general',
      confidence: 'confirmed' as const,
    };

    expect(
      shouldAskPlannedExpenseFundingTiming(budget, engine, draft, CURRENT),
    ).toBe(true);
  });

  it('returns false when the target month is not after the current month', () => {
    const budget = makeState(1000, []);
    const engine = runEngine(budget, CURRENT);
    const draft = {
      name: 'Due now',
      amount: 400,
      targetMonth: CURRENT,
      category: 'general',
      confidence: 'confirmed' as const,
    };

    expect(
      shouldAskPlannedExpenseFundingTiming(budget, engine, draft, CURRENT),
    ).toBe(false);
  });
});
