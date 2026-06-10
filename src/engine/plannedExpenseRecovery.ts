import type {
  PlannedExpense,
  PlannedExpensePayment,
} from './types';

export interface PlannedExpenseFundingProgress {
  plannedExpenseId: string;
  name: string;
  plannedAmount: number;
  totalPaid: number;
  fundedProgress: number;
}

export function fundingProgressForExpense(
  expense: PlannedExpense,
  payments: PlannedExpensePayment[],
): PlannedExpenseFundingProgress {
  const expensePayments = payments.filter(p => p.plannedExpenseId === expense.id);
  const totalPaid = expensePayments.reduce((s, p) => s + p.amount, 0);

  return {
    plannedExpenseId: expense.id,
    name: expense.name,
    plannedAmount: expense.amount,
    totalPaid,
    fundedProgress: totalPaid,
  };
}
