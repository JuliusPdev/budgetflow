import { addMonths } from './months';
import { periodStatus } from './period';
import { planFromPot, sharePot } from './pot';
import { potCents } from './savingsLog';
import type { Cents, Day, Expense, LogEntry, Month } from './types';

// What taking money out of the pot would cost, worked out before you decide.
// This period's amount is fixed, so taking money out shows up first as more
// still to put aside now. Only if it isn't back by the next paycheck do the
// following paychecks rise.

export interface PaycheckChange {
  month: Month;
  beforeCents: Cents;
  afterCents: Cents;
}

export interface TakeOutPreview {
  /** Still to put aside this period, without and with taking the money out. */
  openBeforeCents: Cents;
  openAfterCents: Cents;
  /** All the money no expense needs yet, before taking anything out. */
  extraCents: Cents;
  /** The part that comes out of that extra: it costs nothing. */
  fromExtraCents: Cents;
  /**
   * If it isn't put back this period: the later paychecks whose amount would
   * change (you still set aside what was already open, just not the rest).
   */
  laterChanges: PaycheckChange[];
  /** The first later paycheck back at its usual amount; null if nothing is planned after the changes. */
  backToNormal: { month: Month; cents: Cents } | null;
  /** What's in the pot now, to warn when taking more than that. */
  potCents: Cents;
}

/**
 * @param expenses already in paycheck terms (planningView), like the main plan.
 */
export function previewTakeOut(
  expenses: Expense[],
  log: LogEntry[],
  currentPaycheck: Month,
  periodStart: Day,
  amountCents: Cents,
  today: Day,
): TakeOutPreview {
  const withdrawal: LogEntry = {
    id: 'preview',
    kind: 'withdrawal',
    date: today,
    month: currentPaycheck,
    amountCents,
    reason: '',
  };
  const logAfter = [...log, withdrawal];
  const before = periodStatus(expenses, log, currentPaycheck, periodStart);
  const after = periodStatus(expenses, logAfter, currentPaycheck, periodStart);

  // Next period onwards: the usual plan, against the plan if only what was
  // already open gets set aside and the withdrawal stays missing.
  const nextMonth = addMonths(currentPaycheck, 1);
  const usual = planFromPot(expenses, potCents(expenses, log) + before.openCents, nextMonth);
  const notPutBack = planFromPot(expenses, potCents(expenses, logAfter) + before.openCents, nextMonth);
  const usualByMonth = new Map(usual.map((monthPlan) => [monthPlan.month, monthPlan.totalCents]));
  const notPutBackByMonth = new Map(notPutBack.map((monthPlan) => [monthPlan.month, monthPlan.totalCents]));
  const lastMonth = [...usual, ...notPutBack].reduce(
    (latest, monthPlan) => (monthPlan.month > latest ? monthPlan.month : latest),
    nextMonth,
  );
  const laterChanges: PaycheckChange[] = [];
  for (let month = nextMonth; month <= lastMonth; month = addMonths(month, 1)) {
    const beforeCents = usualByMonth.get(month) ?? 0;
    const afterCents = notPutBackByMonth.get(month) ?? 0;
    if (beforeCents !== afterCents) laterChanges.push({ month, beforeCents, afterCents });
  }
  const lastChange = laterChanges.length === 0 ? null : laterChanges[laterChanges.length - 1].month;
  const normalMonth = lastChange === null ? null : addMonths(lastChange, 1);
  const normalCents = normalMonth === null ? undefined : notPutBackByMonth.get(normalMonth);

  const potNow = potCents(expenses, log);
  const extraCents = sharePot(potNow, expenses, currentPaycheck).extraCents;
  return {
    openBeforeCents: before.openCents,
    openAfterCents: after.openCents,
    extraCents,
    fromExtraCents: Math.min(amountCents, extraCents),
    laterChanges,
    backToNormal: normalMonth === null || normalCents === undefined ? null : { month: normalMonth, cents: normalCents },
    potCents: potNow,
  };
}

export interface ChangeRun {
  from: Month;
  to: Month;
  beforeCents: Cents;
  afterCents: Cents;
}

/**
 * Neighbouring paychecks with the same change, joined into one line:
 * "Nov – Dec: €300 → €350". Amounts a cent apart count as the same, since
 * spreading whole cents evenly gives the earliest months an extra cent.
 */
export function groupChanges(changes: PaycheckChange[]): ChangeRun[] {
  const runs: ChangeRun[] = [];
  for (const change of changes) {
    const last = runs[runs.length - 1];
    const continues =
      last !== undefined &&
      addMonths(last.to, 1) === change.month &&
      Math.abs(last.beforeCents - change.beforeCents) <= 1 &&
      Math.abs(last.afterCents - change.afterCents) <= 1;
    if (continues) last.to = change.month;
    else runs.push({ from: change.month, to: change.month, beforeCents: change.beforeCents, afterCents: change.afterCents });
  }
  return runs;
}
