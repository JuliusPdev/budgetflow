import type {
  Month,
  PlannedExpense,
  PlannedExpensePayment,
  PlannedExpenseSettlement,
} from '../engine/types';
import type { PlannedExpenseLedgerCell } from './ledgerDisplay';

export const PLANNED_EXPENSE_DRAG_MIME = 'application/x-budgetflow-planned-expense';

export type PlannedExpenseDragPayload = {
  expenseId: string;
  kind: 'target' | 'early-payment';
  fromMonth: Month;
  paymentId?: string;
};

export function isExpenseSettled(
  expenseId: string,
  settlements: PlannedExpenseSettlement[],
): boolean {
  return settlements.some(s => s.plannedExpenseId === expenseId);
}

/** Same rule as the edit-expense modal: past targets may stay in the past. */
export function minTargetMonthForExpense(
  expense: PlannedExpense,
  currentMonth: Month,
): Month {
  return expense.targetMonth < currentMonth ? expense.targetMonth : currentMonth;
}

export function canDragLedgerCell(
  cell: PlannedExpenseLedgerCell,
  expenseId: string,
  settlements: PlannedExpenseSettlement[],
): boolean {
  if (isExpenseSettled(expenseId, settlements)) return false;
  return cell.kind === 'target' || cell.kind === 'early-payment';
}

export function canDropTargetMonth(
  expense: PlannedExpense,
  fromMonth: Month,
  dropMonth: Month,
  currentMonth: Month,
  payments: PlannedExpensePayment[],
  settlements: PlannedExpenseSettlement[],
): boolean {
  if (fromMonth === dropMonth) return false;
  if (isExpenseSettled(expense.id, settlements)) return false;
  if (dropMonth < minTargetMonthForExpense(expense, currentMonth)) return false;
  const hasEarlyPayment = payments.some(
    p => p.plannedExpenseId === expense.id && p.month === dropMonth && p.amount > 0,
  );
  if (hasEarlyPayment) return false;
  return true;
}

export function canDropEarlyPaymentMonth(
  expense: PlannedExpense,
  fromMonth: Month,
  dropMonth: Month,
  currentMonth: Month,
  payments: PlannedExpensePayment[],
  settlements: PlannedExpenseSettlement[],
): boolean {
  if (fromMonth === dropMonth) return false;
  if (isExpenseSettled(expense.id, settlements)) return false;
  if (dropMonth > currentMonth) return false;
  if (dropMonth >= expense.targetMonth) return false;
  const duplicate = payments.some(
    p => p.plannedExpenseId === expense.id && p.month === dropMonth && p.amount > 0,
  );
  if (duplicate) return false;
  return true;
}

export function canDropPlannedExpense(
  payload: PlannedExpenseDragPayload,
  expense: PlannedExpense,
  dropMonth: Month,
  currentMonth: Month,
  payments: PlannedExpensePayment[],
  settlements: PlannedExpenseSettlement[],
): boolean {
  if (payload.kind === 'target') {
    return canDropTargetMonth(
      expense,
      payload.fromMonth,
      dropMonth,
      currentMonth,
      payments,
      settlements,
    );
  }
  if (!payload.paymentId) return false;
  return canDropEarlyPaymentMonth(
    expense,
    payload.fromMonth,
    dropMonth,
    currentMonth,
    payments,
    settlements,
  );
}

export function encodePlannedExpenseDragPayload(payload: PlannedExpenseDragPayload): string {
  return JSON.stringify(payload);
}

export function decodePlannedExpenseDragPayload(raw: string): PlannedExpenseDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as PlannedExpenseDragPayload;
    if (
      typeof parsed.expenseId !== 'string'
      || (parsed.kind !== 'target' && parsed.kind !== 'early-payment')
      || typeof parsed.fromMonth !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
