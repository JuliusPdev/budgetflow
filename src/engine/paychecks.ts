import { addMonths } from './months';
import { paycheckDates, paycheckMonthOf, paydayIn } from './timing';
import type { Day, LogEntry, Month, PaycheckEntry } from './types';

// Paychecks from when your pay really arrived. Until you record a
// paycheck, periods follow your usual payday. Once you do, a new period starts
// only when you record the next one: a late paycheck never starts a period
// early. The usual payday stays as the expected date for reminders and for
// planning the future.

/** The paychecks you recorded, oldest first. */
export function paychecksIn(log: LogEntry[]): PaycheckEntry[] {
  return log
    .filter((entry): entry is PaycheckEntry => entry.kind === 'paycheck')
    .sort((a, b) => a.date.localeCompare(b.date) || a.month.localeCompare(b.month));
}

/** The usual payday of a paycheck month, e.g. "2026-11" → "2026-11-21". */
function expectedPayday(month: Month, payday: number): Day {
  return `${month}-${String(paydayIn(month, payday)).padStart(2, '0')}`;
}

/** Whole days from one day to another (negative when `to` is earlier). */
function daysBetween(from: Day, to: Day): number {
  const toUtc = (day: Day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/**
 * Which paycheck arriving on `date` is: the one after the last you recorded,
 * so early or late pay is never mixed up with another month. The very first
 * goes to the usual payday closest to `date`.
 */
export function nextPaycheckMonth(log: LogEntry[], date: Day, payday: number): Month {
  const recorded = paychecksIn(log);
  if (recorded.length > 0) return addMonths(recorded[recorded.length - 1].month, 1);
  const month = date.slice(0, 7);
  return [addMonths(month, -1), month, addMonths(month, 1)].reduce((closest, candidate) =>
    Math.abs(daysBetween(date, expectedPayday(candidate, payday))) <
    Math.abs(daysBetween(date, expectedPayday(closest, payday)))
      ? candidate
      : closest,
  );
}

export interface CurrentPeriod {
  /** The paycheck you're living on: the month its payday belongs to. */
  month: Month;
  /** When it started. */
  start: Day;
  /** True when you recorded the start; false when it's only your usual payday. */
  startIsReal: boolean;
  /** When the next paycheck is expected. */
  nextExpected: Day;
  /** The next paycheck was expected by now but isn't recorded yet: time for a reminder. */
  nextIsDue: boolean;
}

/** The paycheck you're in on `today`. */
export function currentPeriod(log: LogEntry[], today: Day, payday: number): CurrentPeriod {
  const recorded = paychecksIn(log).filter((paycheck) => paycheck.date <= today);
  if (recorded.length === 0) {
    const month = paycheckMonthOf(today, payday);
    const { last, next } = paycheckDates(month, payday);
    return { month, start: last, startIsReal: false, nextExpected: next, nextIsDue: false };
  }
  const latest = recorded[recorded.length - 1];
  const nextExpected = expectedPayday(addMonths(latest.month, 1), payday);
  return { month: latest.month, start: latest.date, startIsReal: true, nextExpected, nextIsDue: today >= nextExpected };
}
