import { addMonths } from './months';
import { paychecksIn } from './paychecks';
import type { DoneMark, TimelineRow } from './timeline';
import { paycheckDates, paycheckMonthOf } from './timing';
import type { Cents, Day, Expense, LogEntry, Month } from './types';

// Looking back: the paychecks before the one you're living on, as they really
// happened. The plan of back then was never saved, and it doesn't matter now:
// the log holds every dated movement of money, so the past is rebuilt from it.

/** Something that really happened in a past paycheck. */
export type PastEvent =
  | { kind: 'payment'; date: Day; name: string; fromPotCents: Cents; fromSpendingCents: Cents; note?: string }
  | { kind: 'withdrawal'; date: Day; reason: string; amountCents: Cents }
  | { kind: 'correction'; date: Day; amountCents: Cents }
  | { kind: 'done'; date: Day; mark: DoneMark };

export interface PastPaycheck {
  /** The paycheck key: the month of its payday. */
  paycheck: Month;
  /** Its first day: when your pay arrived, or your usual payday if you didn't record it. */
  from: Day;
  /** The first day of the next paycheck. */
  next: Day;
  /** Its last day: the day before the next one. */
  last: Day;
  /** Everything you put aside in it. */
  putAsideCents: Cents;
  /** In date order. */
  events: PastEvent[];
}

/** "2026-11-01" → "2026-10-31". */
function dayBefore(day: Day): Day {
  const time = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  return new Date(time - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Every paycheck from the first one with anything in it up to (not including)
 * the current one, oldest first. Paychecks in between with nothing in them are
 * kept, so the bands have no gaps.
 */
export function buildHistory(
  log: LogEntry[],
  expenses: Expense[],
  payday: number,
  currentPaycheck: Month,
  currentStart: Day,
): PastPaycheck[] {
  const names = new Map(expenses.map((expense) => [expense.id, expense.name]));
  const recordedStart = new Map(paychecksIn(log).map((paycheck) => [paycheck.month, paycheck.date]));
  const startOf = (month: Month): Day =>
    month === currentPaycheck ? currentStart : (recordedStart.get(month) ?? paycheckDates(month, payday).last);

  const dated = log.filter((entry) => entry.date !== undefined && entry.date < currentStart);
  const doneBefore = expenses.filter((expense) => expense.done !== undefined && expense.done.date < currentStart);
  const firstDay = [...dated.map((entry) => entry.date ?? ''), ...doneBefore.map((expense) => expense.done?.date ?? '')].sort()[0];
  if (firstDay === undefined) return [];

  const past: PastPaycheck[] = [];
  for (let month = paycheckMonthOf(firstDay, payday); month < currentPaycheck; month = addMonths(month, 1)) {
    const next = startOf(addMonths(month, 1));
    past.push({ paycheck: month, from: startOf(month), next, last: dayBefore(next), putAsideCents: 0, events: [] });
  }
  if (past.length === 0) return [];

  /** The past paycheck a day falls in; days before the first count towards the first. */
  function paycheckOf(day: Day): PastPaycheck {
    for (let index = past.length - 1; index > 0; index -= 1) if (day >= past[index].from) return past[index];
    return past[0];
  }

  for (const entry of dated) {
    const date = entry.date ?? '';
    // Set-asides and withdrawals know their paycheck; the rest go by their day.
    const paycheck =
      (entry.kind === 'set-aside' || entry.kind === 'withdrawal' ? past.find((candidate) => candidate.paycheck === entry.month) : undefined) ??
      paycheckOf(date);
    if (entry.kind === 'set-aside') paycheck.putAsideCents += entry.amountCents;
    if (entry.kind === 'payment') {
      paycheck.events.push({
        kind: 'payment',
        date,
        name: names.get(entry.envelopeId) ?? 'a deleted expense',
        fromPotCents: entry.amountCents,
        fromSpendingCents: entry.fromSpendingCents ?? 0,
        ...(entry.note === undefined || entry.note === '' ? {} : { note: entry.note }),
      });
    }
    if (entry.kind === 'withdrawal') paycheck.events.push({ kind: 'withdrawal', date, reason: entry.reason, amountCents: entry.amountCents });
    if (entry.kind === 'adjustment') paycheck.events.push({ kind: 'correction', date, amountCents: entry.amountCents });
  }
  for (const expense of doneBefore) {
    const { done } = expense;
    if (done === undefined) continue;
    paycheckOf(done.date).events.push({
      kind: 'done',
      date: done.date,
      mark: { expenseId: expense.id, name: expense.name, date: done.date, costCents: done.costCents, plannedCents: expense.targetCents },
    });
  }
  for (const paycheck of past) paycheck.events.sort((a, b) => a.date.localeCompare(b.date));
  return past;
}

/**
 * The past as timeline rows, to go above the current paycheck: a line where
 * each month begins, then each paycheck's start and what happened in it.
 */
export function pastTimelineRows(past: PastPaycheck[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let lastMonth: Month | null = null;
  const firstStart = past[0]?.from;

  function monthLine(day: Day): void {
    const month = day.slice(0, 7);
    if (month === lastMonth) return;
    lastMonth = month;
    // Inside a band only when a paycheck shown covers the 1st.
    const first = `${month}-01`;
    const band = firstStart !== undefined && first >= firstStart ? past.find((paycheck) => first >= paycheck.from && first < paycheck.next) : undefined;
    rows.push({ event: { kind: 'month-start', month }, band: band?.paycheck });
  }

  for (const paycheck of past) {
    monthLine(paycheck.from);
    rows.push({
      event: { kind: 'past-paycheck', date: paycheck.from, last: paycheck.last, paycheck: paycheck.paycheck, putAsideCents: paycheck.putAsideCents },
      band: paycheck.paycheck,
    });
    for (const event of paycheck.events) {
      monthLine(event.date);
      rows.push({ event: { kind: 'past', event }, band: paycheck.paycheck });
    }
  }
  return rows;
}
