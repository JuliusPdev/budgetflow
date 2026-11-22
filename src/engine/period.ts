import { addMonths } from './months';
import { planSetAside, type MonthPlan } from './plan';
import { planFromPot, sharePot, sharePotByPlan, withShares, type PotShares } from './pot';
import { periodMovements, planOrigin, potAtPeriodStart, potCents, type PeriodMovements } from './savingsLog';
import type { Cents, Day, Expense, LogEntry, Month } from './types';

// Where you stand in the current paycheck.

/**
 * How the pot is shared between expenses:
 *   plan    — as if you had always followed your plan, so the bars grow like the ledger
 *   closest — closest deadline first, when following the plan would ask more of you
 */
export type SharingRule = 'plan' | 'closest';

export interface PeriodStatus {
  /** The plan: this period from the pot at its start, later ones from the pot once this period is done. */
  plan: MonthPlan[];
  /** This period's planned amount. */
  plannedCents: Cents;
  /** What happened in the pot during the period. */
  movements: PeriodMovements;
  /** What's still to put aside this period; zero when done. */
  openCents: Cents;
  /** How much more than this period asks is in the pot: it lowers the later paychecks. */
  aheadCents: Cents;
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
 * Plans from a pot: following your plan, unless that would make you save more
 * per paycheck than covering the closest deadlines first. Then the closest come first.
 */
function planByRule(expenses: Expense[], potCents: Cents, origin: Month, month: Month): { plan: MonthPlan[]; rule: SharingRule } {
  const closestPlan = planFromPot(expenses, potCents, month);
  const followingPlan = planSetAside(withShares(expenses, sharePotByPlan(potCents, expenses, origin, month), month), month);
  return sameAmounts(followingPlan, closestPlan) ? { plan: followingPlan, rule: 'plan' } : { plan: closestPlan, rule: 'closest' };
}

/**
 * Planned from next paycheck on, this period's bills count as overdue and show
 * up again in the first later month. Their money is rightly kept, but they leave
 * the pot only once: in this period.
 */
function laterWithoutThisPeriodsBills(later: MonthPlan[], thisPeriod: MonthPlan): MonthPlan[] {
  return later.map((monthPlan) => ({
    ...monthPlan,
    billsOut: Object.fromEntries(Object.entries(monthPlan.billsOut).filter(([id]) => !(id in thisPeriod.billsOut))),
  }));
}

/**
 * The period's amount is fixed from where the pot stood at its start. Money
 * you take out during the period simply undoes progress, so it shows up as
 * more still to put aside — unless it came out of money no expense needed.
 *
 * Later paychecks are planned from what the pot will hold once this period is
 * done, so putting in more than it asks lowers them right away instead of
 * waiting for your next payday.
 *
 * @param expenses already in paycheck terms (planningView), like the main plan.
 */
export function periodStatus(expenses: Expense[], log: LogEntry[], month: Month, periodStart: Day): PeriodStatus {
  const startPot = potAtPeriodStart(log, month, periodStart);
  const origin = planOrigin(log, month);
  const { plan: startPlan, rule } = planByRule(expenses, startPot, origin, month);

  const thisPeriod = startPlan[0]?.month === month ? startPlan[0] : undefined;
  const plannedCents = thisPeriod?.totalCents ?? 0;
  // Where the pot should stand at the end of the period. Extra no expense
  // needed doesn't have to be there, so taking it out doesn't need putting back.
  const extraAtStart = sharePot(startPot, expenses, month).extraCents;
  const targetCents = startPot + plannedCents - extraAtStart;
  const potNowCents = potCents(log);
  const openCents = Math.max(0, targetCents - potNowCents);

  // Once this period is done, the pot holds what's in it now plus what's still
  // open. When that isn't what the plan counted on, the later paychecks follow it.
  const endPotCents = potNowCents + openCents;
  const plan =
    endPotCents === startPot + plannedCents || thisPeriod === undefined
      ? startPlan
      : [thisPeriod, ...laterWithoutThisPeriodsBills(planByRule(expenses, endPotCents, origin, addMonths(month, 1)).plan, thisPeriod)];
  const aheadCents = Math.max(0, potNowCents - targetCents);
  return { plan, plannedCents, movements: periodMovements(log, month, periodStart), openCents, aheadCents, rule, origin };
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
