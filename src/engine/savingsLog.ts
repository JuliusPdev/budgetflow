import type { Cents, Day, Expense, LogEntry, Month } from './types';

// What the log says about your pot: how much is in it, and what moved in and
// out of it during the current savings period.

/**
 * What is in the pot: everything set aside, plus corrections, minus money taken
 * out and bills already paid out of it. Below zero means more went out than came in.
 */
export function potCents(expenses: Expense[], log: LogEntry[]): Cents {
  const intoPot = log.reduce((sum, entry) => {
    // Paychecks don't go into the pot; only what you set aside from them does.
    if (entry.kind === 'paycheck') return sum;
    if (entry.kind === 'withdrawal') return sum - entry.amountCents;
    return sum + entry.amountCents;
  }, 0);
  const paidOut = expenses
    .filter((expense) => expense.paidMonth !== undefined)
    .reduce((sum, expense) => sum + expense.targetCents, 0);
  return intoPot - paidOut;
}

export interface PeriodMovements {
  setAsideCents: Cents;
  takenOutCents: Cents;
  /** Corrections, below zero when they took money away. */
  correctedCents: Cents;
  /** Everything together: what this period changed in the pot. */
  netCents: Cents;
}

/**
 * Money in and out of the pot during one savings period. Set-asides and
 * withdrawals carry their period; a correction counts when it was made on or
 * after the period's first day. The starting balance has no date, so it's always earlier.
 */
export function periodMovements(log: LogEntry[], month: Month, periodStart: Day): PeriodMovements {
  let setAsideCents = 0;
  let takenOutCents = 0;
  let correctedCents = 0;
  for (const entry of log) {
    if (entry.kind === 'set-aside' && entry.month === month) setAsideCents += entry.amountCents;
    if (entry.kind === 'withdrawal' && entry.month === month) takenOutCents += entry.amountCents;
    if (entry.kind === 'adjustment' && entry.date !== undefined && entry.date >= periodStart) {
      correctedCents += entry.amountCents;
    }
  }
  return { setAsideCents, takenOutCents, correctedCents, netCents: setAsideCents - takenOutCents + correctedCents };
}

/**
 * The pot as it stood when the period started, before anything you did in it.
 * Planning from it keeps the period's amount fixed: money you put in and take
 * out again during the period cancels out instead of looking like an old debt.
 */
export function potAtPeriodStart(expenses: Expense[], log: LogEntry[], month: Month, periodStart: Day): Cents {
  return potCents(expenses, log) - periodMovements(log, month, periodStart).netCents;
}

/**
 * Where "as if you had always followed your plan" starts: the paycheck of your
 * first set-aside, or the current one before you've logged any.
 */
export function planOrigin(log: LogEntry[], currentMonth: Month): Month {
  return log.reduce(
    (earliest, entry) => (entry.kind === 'set-aside' && entry.month < earliest ? entry.month : earliest),
    currentMonth,
  );
}
