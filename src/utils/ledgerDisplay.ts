import type { Month, MonthResult, PlannedExpense, PlannedExpensePayment } from '../engine/types';

/** Set-aside row: show actual locks for past/reconciled months; plan rate for future. */
export function setAsideLedgerAmount(
  month: MonthResult,
  currentMonth: Month,
  isMonthReconciled: (m: Month) => boolean,
): number {
  const isPast = month.month < currentMonth;
  if (isPast || isMonthReconciled(month.month)) {
    return month.setAsideLocked;
  }
  if (month.month === currentMonth && month.setAsideLocked > month.setAsideRecommended) {
    return month.setAsideLocked;
  }
  return month.setAsideRecommended;
}

export type PlannedExpenseLedgerCell =
  | { kind: 'empty' }
  | { kind: 'early-payment'; amount: number }
  | { kind: 'target'; amount: number };

export function plannedExpenseLedgerCell(
  expense: PlannedExpense,
  ledgerMonth: Month,
  payments: PlannedExpensePayment[],
): PlannedExpenseLedgerCell {
  const early = payments.find(
    p => p.plannedExpenseId === expense.id && p.month === ledgerMonth,
  );
  if (early && early.amount > 0) {
    return { kind: 'early-payment', amount: early.amount };
  }
  if (ledgerMonth === expense.targetMonth) {
    return { kind: 'target', amount: expense.amount };
  }
  return { kind: 'empty' };
}
