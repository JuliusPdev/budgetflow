import { ownerOf } from './payments';
import { periodStatus } from './period';
import type { MonthPlan } from './plan';
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
 * @param expenses your expenses, already in paycheck terms and split by their
 *   payments (planningView, then withPayments).
 * @param draft the new or edited expense, the same way: one part, or several
 *   when the expense being edited has payments.
 * @param replaceId when editing: the expense the draft replaces, with all its parts.
 */
export function previewExpense(
  expenses: Expense[],
  log: LogEntry[],
  currentPaycheck: Month,
  periodStart: Day,
  draft: Expense[],
  replaceId?: string,
): ExpensePreview {
  const withDraft = [...expenses.filter((expense) => ownerOf(expense) !== replaceId), ...draft];
  const draftIds = draft.map((part) => part.id);
  const before = periodStatus(expenses, log, currentPaycheck, periodStart);
  const after = periodStatus(withDraft, log, currentPaycheck, periodStart);

  // The draft's own share: all its parts, in case it has payments already.
  const ownShares = after.plan.flatMap((monthPlan) => {
    const cents = draftIds.reduce((sum, id) => sum + (monthPlan.byEnvelope[id] ?? 0), 0);
    return cents === 0 ? [] : [{ month: monthPlan.month, cents }];
  });

  return {
    openBeforeCents: before.openCents,
    openAfterCents: after.openCents,
    laterChanges: laterChangesBetween(before.plan, after.plan, currentPaycheck),
    ownShares,
  };
}

/** The paychecks after the current one whose amount differs between two plans. */
export function laterChangesBetween(before: MonthPlan[], after: MonthPlan[], currentPaycheck: Month): PaycheckChange[] {
  const beforeByMonth = new Map(before.map((monthPlan) => [monthPlan.month, monthPlan.totalCents]));
  const afterByMonth = new Map(after.map((monthPlan) => [monthPlan.month, monthPlan.totalCents]));
  const laterMonths = [...new Set([...beforeByMonth.keys(), ...afterByMonth.keys()])]
    .filter((month) => month > currentPaycheck)
    .sort();
  return laterMonths.flatMap((month) => {
    const beforeCents = beforeByMonth.get(month) ?? 0;
    const afterCents = afterByMonth.get(month) ?? 0;
    return beforeCents === afterCents ? [] : [{ month, beforeCents, afterCents }];
  });
}
