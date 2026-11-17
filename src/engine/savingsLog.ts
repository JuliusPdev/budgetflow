import type { MonthPlan } from './plan';
import type { Cents, Expense, LogEntry, Month, SetAsideEntry } from './types';

// What the log says about your pot: how much is in it, and how much of this
// period's plan you've already set aside.

function setAsidesIn(log: LogEntry[], month: Month): SetAsideEntry[] {
  return log.filter((entry): entry is SetAsideEntry => entry.kind === 'set-aside' && entry.month === month);
}

/** Total set aside during `month` (a paycheck period). */
export function setAsideInMonth(log: LogEntry[], month: Month): Cents {
  return setAsidesIn(log, month).reduce((total, entry) => total + entry.amountCents, 0);
}

/** What's still open of this period's plan after what you've logged; never below zero. */
export function stillOpenThisMonth(monthPlan: MonthPlan | undefined, log: LogEntry[]): Cents {
  if (monthPlan === undefined) return 0;
  return Math.max(0, monthPlan.totalCents - setAsideInMonth(log, monthPlan.month));
}

/**
 * What's in the pot: everything set aside, plus corrections, minus bills
 * already paid out of it. Below zero means more went out than came in.
 */
export function potCents(expenses: Expense[], log: LogEntry[]): Cents {
  // Paychecks don't go into the pot; only what you set aside from them does.
  const intoPot = log.reduce(
    (sum, entry) => (entry.kind === 'paycheck' ? sum : sum + entry.amountCents),
    0,
  );
  const paidOut = expenses
    .filter((expense) => expense.paidMonth !== undefined)
    .reduce((sum, expense) => sum + expense.targetCents, 0);
  return intoPot - paidOut;
}

/**
 * The pot as it stood when `month` started, before this period's set-asides.
 * Planning from it keeps this period's amount fixed while you log against it,
 * instead of shrinking with every entry.
 */
export function potAtPeriodStart(expenses: Expense[], log: LogEntry[], month: Month): Cents {
  return potCents(expenses, log) - setAsideInMonth(log, month);
}
