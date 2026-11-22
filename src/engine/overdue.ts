import type { Day, Expense } from './types';

// An expense whose date has passed but that you haven't marked done. The plan
// keeps its money until you say what happened: it's over (Done), or it's
// still coming (a new date).

/** Has its date passed? A month-only expense is overdue once its month is over. */
export function isOverdue(expense: Expense, today: Day): boolean {
  if (expense.done !== undefined) return false;
  return expense.dueDate !== undefined ? expense.dueDate < today : expense.dueMonth < today.slice(0, 7);
}

/** Your overdue expenses, the longest overdue first. */
export function overdueExpenses(expenses: Expense[], today: Day): Expense[] {
  return expenses
    .filter((expense) => isOverdue(expense, today))
    .sort((a, b) => (a.dueDate ?? `${a.dueMonth}-01`).localeCompare(b.dueDate ?? `${b.dueMonth}-01`));
}
