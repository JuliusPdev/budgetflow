import type { BudgetState, Month } from './types';

/** Extra income on top of the default monthly income for one calendar month. */
export function additionalIncomeForMonth(month: Month, budget: BudgetState): number {
  return budget.additionalIncomeByMonth?.[month] ?? 0;
}

/** Total planned income for a calendar month. */
export function incomeForMonth(month: Month, budget: BudgetState): number {
  const additional = additionalIncomeForMonth(month, budget);
  if (additional > 0) return budget.income + additional;

  // Legacy full-month override from older planner saves or CSV settlement.
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
