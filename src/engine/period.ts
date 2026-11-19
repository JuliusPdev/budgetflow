import { planSetAside, type MonthPlan } from './plan';
import { planFromPot, sharePot, sharePotByPlan, withShares, type PotShares } from './pot';
import { periodMovements, planOrigin, potAtPeriodStart, potCents, type PeriodMovements } from './savingsLog';
import type { Cents, Day, Expense, LogEntry, Month } from './types';

// Where you stand in the current savings period.

/**
 * How the pot is shared between expenses:
 *   plan    — as if you had always followed your plan, so the bars grow like the ledger
 *   closest — closest deadline first, when following the plan would ask more of you
 */
export type SharingRule = 'plan' | 'closest';

export interface PeriodStatus {
  /** The plan, made from the pot as it stood when the period started. */
  plan: MonthPlan[];
  /** This period's planned amount. */
  plannedCents: Cents;
  /** What happened in the pot during the period. */
  movements: PeriodMovements;
  /** What's still to put aside this period; zero when done. */
  openCents: Cents;
  /** How the pot is shared this period. */
  rule: SharingRule;
  /** Where plan-following sharing starts counting from. */
  origin: Month;
}

/** Plans asking the same per paycheck, allowing a cent of rounding. */
function sameAmounts(a: MonthPlan[], b: MonthPlan[]): boolean {
  return a.length === b.length && a.every((monthPlan, index) => Math.abs(monthPlan.totalCents - b[index].totalCents) <= 1);
}

/**
 * The period's amount is fixed from where the pot stood at its start. Money
 * you take out during the period simply undoes progress, so it shows up as
 * more still to put aside — unless it came out of money no expense needed.
 *
 * The pot follows your plan, unless that would make you save more per paycheck
 * than covering the closest deadlines first. Then the closest come first.
 *
 * @param expenses already in paycheck terms (planningView), like the main plan.
 */
export function periodStatus(expenses: Expense[], log: LogEntry[], month: Month, periodStart: Day): PeriodStatus {
  const startPot = potAtPeriodStart(expenses, log, month, periodStart);
  const origin = planOrigin(log, month);
  const closestPlan = planFromPot(expenses, startPot, month);
  const followingPlan = planSetAside(
    withShares(expenses, sharePotByPlan(startPot, expenses, origin, month), month),
    month,
  );
  const rule: SharingRule = sameAmounts(followingPlan, closestPlan) ? 'plan' : 'closest';
  const plan = rule === 'plan' ? followingPlan : closestPlan;

  const plannedCents = plan[0]?.month === month ? plan[0].totalCents : 0;
  // Where the pot should stand at the end of the period. Extra no expense
  // needed doesn't have to be there, so taking it out doesn't need putting back.
  const extraAtStart = sharePot(startPot, expenses, month).extraCents;
  const targetCents = startPot + plannedCents - extraAtStart;
  const openCents = Math.max(0, targetCents - potCents(expenses, log));
  return { plan, plannedCents, movements: periodMovements(log, month, periodStart), openCents, rule, origin };
}

/** The pot shared by this period's rule — what the bars and "in the pot" show. */
export function shareByRule(
  status: Pick<PeriodStatus, 'rule' | 'origin'>,
  potNowCents: Cents,
  expenses: Expense[],
  month: Month,
): PotShares {
  return status.rule === 'plan'
    ? sharePotByPlan(potNowCents, expenses, status.origin, month)
    : sharePot(potNowCents, expenses, month);
}
