import { DEFAULT_PAYDAY, paycheckRange } from '../engine/timing';
import type { Cents, Day, Envelope, Month } from '../engine/types';

// Turns engine values (whole cents, "2026-11") into text people read.
// Done only at display time, so the engine never deals with rounding or wording.

const euroFormat = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const shortMonthFormat = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const longMonthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const shortDayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const longDayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const dayWithYearFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** 24546 → "€245.46" */
export function formatEuros(cents: Cents): string {
  return euroFormat.format(cents / 100);
}

function toDate(month: Month): Date {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1);
}

/** "2026-11" → "Nov 2026" */
export function formatMonthShort(month: Month): string {
  return shortMonthFormat.format(toDate(month));
}

/** "2026-11" → "November 2026" */
export function formatMonthLong(month: Month): string {
  return longMonthFormat.format(toDate(month));
}

function dayToDate(day: Day): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

/** "2026-12-05" → "5 Dec" */
export function formatDayShort(day: Day): string {
  return shortDayFormat.format(dayToDate(day));
}

/** When an expense is due, as precisely as it was entered: "5 Dec 2026" or "Dec 2026". */
export function formatDue(envelope: Envelope): string {
  return envelope.dueDate === undefined
    ? formatMonthShort(envelope.dueMonth)
    : dayWithYearFormat.format(dayToDate(envelope.dueDate));
}

/** 21 → "21st", 2 → "2nd", 13 → "13th" */
export function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
  return `${day}${suffix}`;
}

/** "2026-11-17" → "17 November 2026" */
export function formatDayLong(day: Day): string {
  return longDayFormat.format(dayToDate(day));
}

/**
 * A paycheck period by its real dates, "21 Oct – 20 Nov". Null with payday on
 * the 1st: periods are then plain calendar months and need no dates.
 */
export function formatPeriod(month: Month, payday: number): string | null {
  if (payday === DEFAULT_PAYDAY) return null;
  const { from, to } = paycheckRange(month, payday);
  return `${formatDayShort(from)} – ${formatDayShort(to)}`;
}
