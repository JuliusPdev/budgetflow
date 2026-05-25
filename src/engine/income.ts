import type { BudgetState, Month } from './types';

/** Confirmed or planned income for a calendar month (falls back to budget.income). */
export function incomeForMonth(month: Month, budget: BudgetState): number {
  const override = budget.incomeByMonth?.[month];
  if (override !== undefined && override > 0) return override;
  return budget.income;
}

export function availableForMonth(
  month: Month,
  budget: BudgetState,
  fixedTotal: number,
  modeBSavingsTotal: number,
): number {
  return incomeForMonth(month, budget) - fixedTotal - modeBSavingsTotal;
}

/** Merge confirmed income totals into incomeByMonth (from CSV settlement). */
export function applyIncomeByMonth(
  budget: BudgetState,
  totals: Map<Month, number>,
): BudgetState {
  if (totals.size === 0) return budget;
  const incomeByMonth = { ...(budget.incomeByMonth ?? {}) };
  for (const [month, amount] of totals) {
    if (amount > 0) incomeByMonth[month] = amount;
  }
  const sorted = [...totals.keys()].sort();
  const latestMonth = sorted[sorted.length - 1];
  const latestIncome = totals.get(latestMonth);
  return {
    ...budget,
    incomeByMonth,
    income: latestIncome !== undefined && latestIncome > 0 ? latestIncome : budget.income,
  };
}
