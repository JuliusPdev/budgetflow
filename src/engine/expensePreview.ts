import { periodStatus } from './period';
import type { PaycheckChange } from './takeOut';
import type { Cents, Day, Expense, LogEntry, Month } from './types';

// What adding (or changing) an expense would do to your plan, worked out
// before you save: the same plan as the main screen, once without the draft
// and once with it, and the difference between the two.

export interface ExpensePreview {
  /** Still to put aside in the current paycheck, without and with the draft. */
  openBeforeCents: Cents;
  openAfterCents: Cents;
  /** Later paychecks whose amount changes. */
  laterChanges: PaycheckChange[];
  /** The draft's own share of each paycheck, in order. */
  ownShares: { month: Month; cents: Cents }[];
}

/**
 * @param expenses your expenses, already in paycheck terms (planningView).
 * @param draft the new or edited expense, also in paycheck terms.
 * @param replaceId when editing: the expense the draft replaces.
 */
export function previewExpense(
  expenses: Expense[],
  log: LogEntry[],
  currentPaycheck: Month,
  periodStart: Day,
  draft: Expense,
  replaceId?: string,
): ExpensePreview {
  const withDraft = [...expenses.filter((expense) => expense.id !== replaceId), draft];
  const before = periodStatus(expenses, log, currentPaycheck, periodStart);
  const after = periodStatus(withDraft, log, currentPaycheck, periodStart);

  const beforeByMonth = new Map(before.plan.map((monthPlan) => [monthPlan.month, monthPlan.totalCents]));
  const afterByMonth = new Map(after.plan.map((monthPlan) => [monthPlan.month, monthPlan.totalCents]));
  const laterMonths = [...new Set([...beforeByMonth.keys(), ...afterByMonth.keys()])]
    .filter((month) => month > currentPaycheck)
    .sort();
  const laterChanges = laterMonths.flatMap((month) => {
    const beforeCents = beforeByMonth.get(month) ?? 0;
    const afterCents = afterByMonth.get(month) ?? 0;
    return beforeCents === afterCents ? [] : [{ month, beforeCents, afterCents }];
  });

  const ownShares = after.plan.flatMap((monthPlan) => {
    const cents = monthPlan.byEnvelope[draft.id];
    return cents === undefined || cents === 0 ? [] : [{ month: monthPlan.month, cents }];
  });

  return { openBeforeCents: before.openCents, openAfterCents: after.openCents, laterChanges, ownShares };
}
