import type { Month, MonthResult, PlannedExpense } from '../engine/types';

/** Within a month column: plateau before expense, marker at hit, end-of-month balance. */
export const CHART_HIT_MARKER = 0.55;

export const CHART_PAD_TOP_BASE = 28;
/** Orange total label above the hit dot. */
export const CHART_TOTAL_ABOVE_DOT = 22;
/** Same gap: orange total ↔ grey list, grey groups ↔ each other, single name ↔ amount. */
export const CHART_ITEM_GAP = 8;
/** Name baseline to amount baseline within one expense. */
export const CHART_NAME_TO_AMOUNT = 11;

export interface ChartExpenseLabelPosition {
  nameY: number;
  amountY: number;
}

/** Stack grey labels upward from the orange total (bottom expense first). */
export function layoutExpenseLabels(
  totalY: number,
  expenseCount: number,
): ChartExpenseLabelPosition[] {
  const positions: ChartExpenseLabelPosition[] = [];
  let cursorY = totalY - CHART_ITEM_GAP;

  for (let index = expenseCount - 1; index >= 0; index--) {
    const amountY = cursorY;
    const nameY = amountY - CHART_NAME_TO_AMOUNT;
    positions.unshift({ nameY, amountY });
    cursorY = nameY - CHART_ITEM_GAP;
  }

  return positions;
}

/** Extra top padding for a multi-expense hit column. */
export function chartLabelStackHeight(expenseCount: number): number {
  if (expenseCount <= 1) return 0;
  return expenseCount * (CHART_NAME_TO_AMOUNT + CHART_ITEM_GAP);
}

export interface PlannedExpenseChartLine {
  name: string;
  amount: number;
}

export interface PlannedExpenseChartMarker {
  month: Month;
  x: number;
  y: number;
  expenses: PlannedExpenseChartLine[];
  totalAmount: number;
}

export function comparePlannedExpensesByTime(a: PlannedExpense, b: PlannedExpense): number {
  const monthOrder = a.targetMonth.localeCompare(b.targetMonth);
  if (monthOrder !== 0) return monthOrder;
  const nameOrder = a.name.localeCompare(b.name);
  if (nameOrder !== 0) return nameOrder;
  return a.id.localeCompare(b.id);
}

export function maxPlannedExpenseStackDepth(months: MonthResult[]): number {
  let max = 1;
  for (const month of months) {
    if (month.plannedExpenses.length > 0 && month.potDeduction > 0.001) {
      max = Math.max(max, month.plannedExpenses.length);
    }
  }
  return max;
}

export function chartPadTop(months: MonthResult[]): number {
  const maxCount = maxPlannedExpenseStackDepth(months);
  if (maxCount <= 1) return CHART_PAD_TOP_BASE;
  return CHART_PAD_TOP_BASE + chartLabelStackHeight(maxCount);
}

function chartX(padLeft: number, monthWidth: number, monthIndex: number, fraction: number): number {
  return padLeft + monthIndex * monthWidth + monthWidth * fraction;
}

export function buildPlannedExpenseMarkers(
  months: MonthResult[],
  padLeft: number,
  monthWidth: number,
  yForPotPositive: (amount: number) => number,
  yForDebt: (amount: number) => number,
): PlannedExpenseChartMarker[] {
  const markers: PlannedExpenseChartMarker[] = [];

  for (let monthIndex = 0; monthIndex < months.length; monthIndex++) {
    const month = months[monthIndex];
    if (month.plannedExpenses.length === 0 || month.potDeduction <= 0.001) continue;

    const sortedExpenses = [...month.plannedExpenses].sort(comparePlannedExpensesByTime);
    const plannedTotal = sortedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const totalAmount = month.potDeduction > 0 ? month.potDeduction : plannedTotal;

    const beforeSigned = Math.min(0, month.potBeforeExpenses);
    const y = beforeSigned < 0
      ? yForDebt(beforeSigned)
      : yForPotPositive(Math.max(0, month.potBeforeExpenses));

    markers.push({
      month: month.month,
      x: chartX(padLeft, monthWidth, monthIndex, CHART_HIT_MARKER),
      y,
      expenses: sortedExpenses.map(expense => ({
        name: expense.name,
        amount: expense.amount,
      })),
      totalAmount,
    });
  }

  return markers;
}
