import type { MonthPlan } from './plan';
import { planFromPot, sharePot } from './pot';
import { periodMovements, potAtPeriodStart, potCents, type PeriodMovements } from './savingsLog';
import type { Cents, Day, Expense, LogEntry, Month } from './types';

// Where you stand in the current savings period.

export interface PeriodStatus {
  /** The plan, made from the pot as it stood when the period started. */
  plan: MonthPlan[];
  /** This period's planned amount. */
  plannedCents: Cents;
  /** What happened in the pot during the period. */
  movements: PeriodMovements;
  /** What's still to put aside this period; zero when done. */
  openCents: Cents;
}

/**
 * The period's amount is fixed from where the pot stood at its start. Money
 * you take out during the period simply undoes progress, so it shows up as
 * more still to put aside — unless it came out of money no expense needed.
 *
 * @param expenses already in paycheck terms (planningView), like the main plan.
 */
export function periodStatus(expenses: Expense[], log: LogEntry[], month: Month, periodStart: Day): PeriodStatus {
  const startPot = potAtPeriodStart(expenses, log, month, periodStart);
  const plan = planFromPot(expenses, startPot, month);
  const plannedCents = plan[0]?.month === month ? plan[0].totalCents : 0;
  // Where the pot should stand at the end of the period. Extra no expense
  // needed doesn't have to be there, so taking it out doesn't need putting back.
  const extraAtStart = sharePot(startPot, expenses, month).extraCents;
  const targetCents = startPot + plannedCents - extraAtStart;
  const openCents = Math.max(0, targetCents - potCents(expenses, log));
  return { plan, plannedCents, movements: periodMovements(log, month, periodStart), openCents };
}
