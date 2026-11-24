import type { MonthPlan } from './plan';
import { paycheckDates, paycheckMonthOf, paycheckRange } from './timing';
import type { PastEvent } from './history';
import type { Cents, Day, Expense, Month } from './types';

// The plan as a diary: every set-aside and every bill on its real day, in date
// order. Months only mark where they begin; paychecks are bands alongside,
// because a paycheck period runs across a month line and no single month
// name fits it.

export type TimelineEvent =
  | {
      kind: 'set-aside';
      date: Day;
      /** The paycheck key, to look up the period's dates. */
      paycheck: Month;
      amountCents: Cents;
      byEnvelope: Record<string, Cents>;
      isCurrent: boolean;
    }
  | {
      kind: 'bill';
      /** Missing when only the month is known: "any day in December". */
      date: Day | undefined;
      envelopeId: string;
      amountCents: Cents;
      /** A payment: on the day you paid. */
      isPaid: boolean;
    }
  /** An expense you finished, on the day you finished it; its payments are part of it. */
  | { kind: 'done'; mark: DoneMark }
  /** Looking back: where a past paycheck began, with what you really put aside in it. */
  | { kind: 'past-paycheck'; date: Day; last: Day; paycheck: Month; putAsideCents: Cents }
  /** Looking back: something that really happened. */
  | { kind: 'past'; event: PastEvent }
  | { kind: 'today'; date: Day }
  /** The last day of the paycheck you're living on, so its band runs past today. */
  | { kind: 'paycheck-end'; date: Day; daysLeft: number }
  /** Where a calendar month begins. */
  | { kind: 'month-start'; month: Month };

/** A finished expense, for the ✓ in the timeline and the Columns view. */
export interface DoneMark {
  expenseId: string;
  name: string;
  date: Day;
  costCents: Cents;
  plannedCents: Cents;
}

/** Every done expense as a mark, in date order. */
export function doneMarks(expenses: Expense[]): DoneMark[] {
  return expenses
    .flatMap((expense) =>
      expense.done === undefined
        ? []
        : [{ expenseId: expense.id, name: expense.name, date: expense.done.date, costCents: expense.done.costCents, plannedCents: expense.targetCents }],
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * When a bill leaves the pot, or null when it isn't shown on its own:
 *   - a payment towards a finished expense is part of its ✓ Done line;
 *   - a payment is on the day you paid;
 *   - a bill not paid yet is on its due day, or "any day" in its month. A bill
 *     whose month has passed unpaid is due now, so it moves to today's month.
 */
export function whenBillLeaves(part: Expense, thisMonth: Month): { month: Month; date: Day | undefined } | null {
  if (part.paidMonth !== undefined) {
    if (part.done !== undefined) return null;
    return part.paidOn === undefined ? { month: part.paidMonth, date: undefined } : { month: part.paidOn.slice(0, 7), date: part.paidOn };
  }
  const month = part.dueMonth < thisMonth ? thisMonth : part.dueMonth;
  // The exact day only while it's still in the month shown (not for overdue bills).
  return { month, date: part.dueDate?.slice(0, 7) === month ? part.dueDate : undefined };
}

export interface TimelineRow {
  event: TimelineEvent;
  /** The paycheck this row falls under; missing before the first paycheck shown. */
  band: Month | undefined;
}

interface Placed extends TimelineRow {
  month: Month;
  /** Day of the month used for sorting: "00" for a month line, "01" for month-only bills. */
  sortDay: string;
  /** On the same day, money arrives before it goes out. */
  rank: number;
}

/** Whole days from one day to a later one: 20 Nov → 29 Nov is 9. */
function daysBetween(from: Day, to: Day): number {
  const toTime = (day: Day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  return Math.round((toTime(to) - toTime(from)) / 86_400_000);
}

const RANK = { 'month-start': 0, 'set-aside': 1, 'past-paycheck': 1, today: 2, bill: 3, done: 3, past: 3, 'paycheck-end': 4 } as const;

/**
 * Turns the plan (one entry per paycheck) into diary rows in date order, each
 * tagged with the paycheck band it belongs to. `envelopes` carry the real
 * dates; the plan only says which bills belong to it. A bill whose month has
 * passed unpaid is due now, so it moves to today's month.
 */
export function buildTimeline(
  plan: MonthPlan[],
  envelopes: Expense[],
  payday: number,
  today: Day,
  currentStart?: Day,
  done: DoneMark[] = [],
): TimelineRow[] {
  if (plan.length === 0) return [];
  const byId = new Map(envelopes.map((envelope) => [envelope.id, envelope]));
  const thisMonth = today.slice(0, 7);
  const firstPaycheck = plan[0].month;
  const lastPaycheck = plan[plan.length - 1].month;
  // Where the paychecks shown begin: older payments are in "earlier paychecks".
  const shownFrom = currentStart ?? paycheckDates(firstPaycheck, payday).last;
  const placed: Placed[] = [];

  /** The band a day falls in, kept within the paychecks shown. */
  function bandOf(day: Day): Month {
    const paycheck = paycheckMonthOf(day, payday);
    if (paycheck < firstPaycheck) return firstPaycheck;
    return paycheck > lastPaycheck ? lastPaycheck : paycheck;
  }

  function place(month: Month, sortDay: string, event: TimelineEvent, band: Month | undefined): void {
    placed.push({ month, sortDay, rank: RANK[event.kind], event, band });
  }

  plan.forEach((monthPlan, index) => {
    const isCurrent = index === 0;
    const date = isCurrent && currentStart !== undefined ? currentStart : paycheckDates(monthPlan.month, payday).last;
    place(date.slice(0, 7), date.slice(8, 10), {
      kind: 'set-aside',
      date,
      paycheck: monthPlan.month,
      amountCents: monthPlan.totalCents,
      byEnvelope: monthPlan.byEnvelope,
      isCurrent,
    }, monthPlan.month);

    for (const [envelopeId, amountCents] of Object.entries(monthPlan.billsOut)) {
      const envelope = byId.get(envelopeId);
      if (envelope === undefined) continue;
      const when = whenBillLeaves(envelope, thisMonth);
      if (when === null) continue;
      const isPaid = envelope.paidMonth !== undefined;
      if (isPaid && when.date !== undefined && when.date < shownFrom) continue;
      const { month, date: day } = when;
      // A month-only bill counts from the 1st: the money must be ready by then.
      const counted = day ?? `${month}-01`;
      place(month, counted.slice(8, 10), { kind: 'bill', date: day, envelopeId, amountCents, isPaid }, bandOf(counted));
    }
  });

  // Finished in the paycheck shown at the top: older ones need looking back.
  for (const mark of done) {
    if (mark.date < shownFrom || mark.date > today) continue;
    place(mark.date.slice(0, 7), mark.date.slice(8, 10), { kind: 'done', mark }, firstPaycheck);
  }

  // Today always falls in the paycheck you're living on, even if the next one is late.
  place(thisMonth, today.slice(8, 10), { kind: 'today', date: today }, firstPaycheck);

  // The rest of the current paycheck: without it the band would stop at today,
  // as if the money had to last only until now.
  const lastDay = paycheckRange(firstPaycheck, payday).to;
  const daysLeft = daysBetween(today, lastDay);
  if (daysLeft > 0) {
    place(lastDay.slice(0, 7), lastDay.slice(8, 10), { kind: 'paycheck-end', date: lastDay, daysLeft }, firstPaycheck);
  }

  // A line where each month begins; inside a band when a paycheck shown covers its 1st.
  for (const month of new Set(placed.map((row) => row.month))) {
    const paycheck = paycheckMonthOf(`${month}-01`, payday);
    const firstStart = currentStart ?? paycheckDates(firstPaycheck, payday).last;
    const covered = `${month}-01` >= firstStart && paycheck <= lastPaycheck;
    place(month, '00', { kind: 'month-start', month }, covered ? bandOf(`${month}-01`) : undefined);
  }

  placed.sort(
    (a, b) => a.month.localeCompare(b.month) || a.sortDay.localeCompare(b.sortDay) || a.rank - b.rank,
  );
  return placed.map(({ event, band }) => ({ event, band }));
}
