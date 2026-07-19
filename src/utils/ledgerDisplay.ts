import type { Month, MonthResult, PlannedExpense, PlannedExpensePayment } from '../engine/types';

/** Set-aside row: show actual locks for past months; plan rate for future. */
export function setAsideLedgerAmount(month: MonthResult, currentMonth: Month): number {
  const isPast = month.month < currentMonth;
  if (isPast) {
    return month.setAsideLocked;
  }
  if (month.month === currentMonth && month.setAsideLocked > month.setAsideRecommended) {
    return month.setAsideLocked;
  }
  return month.setAsideRecommended;
}

export type PlannedExpenseLedgerCell =
  | { kind: 'empty' }
  | { kind: 'early-payment'; amount: number; paymentId: string }
  | { kind: 'target'; amount: number }
  | { kind: 'target-paid'; amount: number };

/** Amount still owed on a planned expense after early payments. */
export function remainingPlannedExpenseAmount(
  expense: PlannedExpense,
  payments: PlannedExpensePayment[],
): number {
  const paid = payments
    .filter(p => p.plannedExpenseId === expense.id)
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, expense.amount - paid);
}

export function plannedExpenseLedgerCell(
  expense: PlannedExpense,
  ledgerMonth: Month,
  payments: PlannedExpensePayment[],
): PlannedExpenseLedgerCell {
  const early = payments.find(
    p => p.plannedExpenseId === expense.id && p.month === ledgerMonth,
  );
  if (early && early.amount > 0) {
    return { kind: 'early-payment', amount: early.amount, paymentId: early.id };
  }
  if (ledgerMonth === expense.targetMonth) {
    const remaining = remainingPlannedExpenseAmount(expense, payments);
    if (remaining > 0) {
      return { kind: 'target', amount: remaining };
    }
    return { kind: 'target-paid', amount: expense.amount };
  }
  return { kind: 'empty' };
}

/** Displayed amount for one planned-expense ledger cell (0 when empty or fully paid at target). */
export function plannedExpenseLedgerCellAmount(cell: PlannedExpenseLedgerCell): number {
  if (cell.kind === 'empty' || cell.kind === 'target-paid') return 0;
  return cell.amount;
}

/** Sum of remaining planned-expense obligations shown in one ledger month column. */
export function plannedExpenseLedgerColumnTotal(
  expenses: PlannedExpense[],
  ledgerMonth: Month,
  payments: PlannedExpensePayment[],
): number {
  return expenses.reduce((sum, expense) => {
    const cell = plannedExpenseLedgerCell(expense, ledgerMonth, payments);
    return sum + plannedExpenseLedgerCellAmount(cell);
  }, 0);
}
