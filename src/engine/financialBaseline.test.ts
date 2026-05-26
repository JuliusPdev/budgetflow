import { describe, expect, it } from 'vitest';
import type { BudgetState } from './types';
import { runEngine } from './smoothing';
import {
  anchoredFreeBudget,
  applyFinancialBaselineEffects,
  mergeAnchoredFreeBudget,
  openingPotSeed,
} from './financialBaseline';

const base: BudgetState = {
  income: 3000,
  fixedExpenses: [{ id: 'rent', name: 'Rent', amount: 1000, category: 'housing', isEnvelope: false, actualAmount: null }],
  plannedExpenses: [],
  savingsGoals: [],
  lockIns: [],
  unplannedExpenses: [],
  envelopeActualizations: [],
  plannedExpensePayments: [],
  plannedExpenseRecoveries: [],
  plannedExpenseSettlements: [],
};

describe('financialBaseline', () => {
  it('openingPotSeed subtracts current-month lock-ins from stated pot balance', () => {
    const baseline = {
      asOfMonth: '2026-05' as const,
      checkingBalance: 0,
      potBalance: 600,
      setAsideTransferredThisMonth: 200,
    };
    expect(openingPotSeed(baseline, '2026-05', [
      { id: 'l1', month: '2026-05', lockedAmount: 200, lockState: 'planned' },
    ])).toBe(400);
  });

  it('mergeAnchoredFreeBudget uses max of theoretical and checking anchor', () => {
    const baseline = {
      asOfMonth: '2026-05' as const,
      checkingBalance: 1500,
      potBalance: 0,
      freeSpentThisMonth: 200,
    };
    expect(anchoredFreeBudget(baseline)).toBe(1300);
    const merged = mergeAnchoredFreeBudget(800, baseline, '2026-05');
    expect(merged.freeBudget).toBe(1300);
    expect(merged.theoretical).toBe(800);
    expect(merged.anchored).toBe(1300);
  });

  it('runEngine seeds physical pot and raises free budget when baseline is set', () => {
    const budget = applyFinancialBaselineEffects(
      {
        ...base,
        financialBaseline: {
          asOfMonth: '2026-05',
          checkingBalance: 1200,
          potBalance: 500,
        },
      },
      {
        asOfMonth: '2026-05',
        checkingBalance: 1200,
        potBalance: 500,
      },
    );
    const engine = runEngine(budget, '2026-05');
    const may = engine.months.find(m => m.month === '2026-05');
    expect(may?.physicalPotAfter).toBe(500);
    expect(may?.freeBudgetAnchored).toBe(1200);
    expect(may?.freeBudget).toBeGreaterThanOrEqual(1200);
  });
});
