import { addMonths } from './months';
import type { Day, Envelope, Month } from './types';

// Paychecks, not calendar months. Each month's set-aside comes from that month's
// paycheck, so what matters for an expense is the last paycheck that arrives
// before the money is needed.
//
//   needed on or after payday → that month's paycheck
//   needed before payday      → the previous month's paycheck
//   a month on its own        → counts as its 1st ("ready when the month starts")

/** Payday on the 1st makes paychecks line up with plain calendar months. */
export const DEFAULT_PAYDAY = 1;

export function daysInMonth(month: Month): number {
  const [year, monthNumber] = month.split('-').map(Number);
  // Day 0 of the next month is the last day of this one.
  return new Date(year, monthNumber, 0).getDate();
}

/** Payday within a given month: the 31st becomes the 28th in February. */
export function paydayIn(month: Month, payday: number): number {
  return Math.min(payday, daysInMonth(month));
}

/** The paycheck a calendar day belongs to: the last one that arrived on or before it. */
export function paycheckMonthOf(day: Day, payday: number): Month {
  const month = day.slice(0, 7);
  const dayOfMonth = Number(day.slice(8, 10));
  return dayOfMonth >= paydayIn(month, payday) ? month : addMonths(month, -1);
}

/** The last paycheck that can still pay for an expense. */
export function fundingMonth(envelope: Envelope, payday: number): Month {
  return paycheckMonthOf(envelope.dueDate ?? `${envelope.dueMonth}-01`, payday);
}

/**
 * Your envelopes translated into paychecks for the engine: each due month (and
 * paid month) becomes the paycheck it belongs to. Your real dates are untouched;
 * this copy is only for calculating.
 */
export function planningView(envelopes: Envelope[], payday: number): Envelope[] {
  if (payday === DEFAULT_PAYDAY) return envelopes;
  return envelopes.map((envelope) => ({
    ...envelope,
    dueMonth: fundingMonth(envelope, payday),
    paidMonth: envelope.paidMonth === undefined ? undefined : paycheckMonthOf(`${envelope.paidMonth}-01`, payday),
  }));
}

/** The first and last day a paycheck has to last, e.g. 21 Nov – 20 Dec. */
export function paycheckRange(month: Month, payday: number): { from: Day; to: Day } {
  const next = addMonths(month, 1);
  const lastDay = paydayIn(next, payday) - 1;
  const to = lastDay === 0 ? `${month}-${String(daysInMonth(month)).padStart(2, '0')}` : `${next}-${String(lastDay).padStart(2, '0')}`;
  return { from: `${month}-${String(paydayIn(month, payday)).padStart(2, '0')}`, to };
}

/** The paydays that open and close a savings phase: e.g. 21 Oct and 21 Nov. */
export function paycheckDates(month: Month, payday: number): { last: Day; next: Day } {
  const next = addMonths(month, 1);
  return {
    last: `${month}-${String(paydayIn(month, payday)).padStart(2, '0')}`,
    next: `${next}-${String(paydayIn(next, payday)).padStart(2, '0')}`,
  };
}

/**
 * The calendar month a paycheck period mostly covers: with payday on the 21st,
 * "21 Oct – 20 Nov" is mostly November. People think in months, so the ledger
 * names each period this way. A tie goes to the month the period starts in.
 */
export function periodMonth(month: Month, payday: number): Month {
  const daysInStartMonth = daysInMonth(month) - paydayIn(month, payday) + 1;
  const daysInNextMonth = paydayIn(addMonths(month, 1), payday) - 1;
  return daysInNextMonth > daysInStartMonth ? addMonths(month, 1) : month;
}
