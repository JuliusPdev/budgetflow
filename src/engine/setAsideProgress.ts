import type { Cents, Day, Expense } from './types';

// What you've set aside this paycheck, poured into its planned lines: the
// closest deadline first, each line full before the next one gets anything.

export interface FilledLine {
  /** The plan's id for the line (an expense, or a paid part of one). */
  id: string;
  /** What the plan asks for this line this paycheck. */
  plannedCents: Cents;
  /** How much of it you've already set aside. */
  filledCents: Cents;
}

/** When a line's money must be ready: its day, or the 1st of a month-only deadline. */
function deadlineOf(expense: Expense | undefined): Day {
  if (expense === undefined) return '9999-12-31';
  return expense.dueDate ?? `${expense.dueMonth}-01`;
}

/**
 * The paycheck's lines in deadline order, each with how much of it is set
 * aside. Ties keep the plan's order.
 */
export function fillByDeadline(byEnvelope: Record<string, Cents>, expenses: Expense[], setAsideCents: Cents): FilledLine[] {
  const byId = new Map(expenses.map((expense) => [expense.id, expense]));
  const lines = Object.entries(byEnvelope)
    .map(([id, plannedCents], order) => ({ id, plannedCents, order, deadline: deadlineOf(byId.get(id)) }))
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.order - b.order);

  let leftCents = Math.max(0, setAsideCents);
  return lines.map(({ id, plannedCents }) => {
    const filledCents = Math.min(plannedCents, leftCents);
    leftCents -= filledCents;
    return { id, plannedCents, filledCents };
  });
}
