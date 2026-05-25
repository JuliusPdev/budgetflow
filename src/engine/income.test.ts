import { describe, expect, it } from 'vitest';
import { runEngine } from './smoothing';
import { incomeForMonth, applyIncomeByMonth } from './income';
import type { BudgetState } from './types';

const base: BudgetState = {
  income: 3000,
  incomeByMonth: {},
  fixedExpenses: [{ id: 'rent', name: 'Rent', amount: 900, category: 'housing', isEnvelope: false, actualAmount: null }],
  plannedExpenses: [],
  savingsGoals: [],
  lockIns: [],
  unplannedExpenses: [],
  envelopeActualizations: [],
  plannedExpensePayments: [],
  plannedExpenseSettlements: [],
};

describe('income', () => {
  it('uses incomeByMonth when set', () => {
    const budget: BudgetState = {
      ...base,
      incomeByMonth: { '2026-04': 2800, '2026-05': 3247 },
    };
    expect(incomeForMonth('2026-04', budget)).toBe(2800);
    expect(incomeForMonth('2026-05', budget)).toBe(3247);
    expect(incomeForMonth('2026-06', budget)).toBe(3000);
  });

  it('engine free budget differs by month when income differs', () => {
    const budget: BudgetState = {
      ...base,
      incomeByMonth: { '2026-05': 3500, '2026-06': 2800 },
    };
    const engine = runEngine(budget, '2026-05');
    const may = engine.months.find(m => m.month === '2026-05');
    const june = engine.months.find(m => m.month === '2026-06');
    expect(may?.monthlyIncome).toBe(3500);
    expect(june?.monthlyIncome).toBe(2800);
    expect(may!.freeBudget).toBeGreaterThan(june!.freeBudget);
  });

  it('applyIncomeByMonth merges totals', () => {
    const next = applyIncomeByMonth(base, new Map([['2026-05', 3100]]));
    expect(next.incomeByMonth?.['2026-05']).toBe(3100);
    expect(next.income).toBe(3100);
  });
});
