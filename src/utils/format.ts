import type { Cents, Month } from '../engine/types';

// Turns engine values (whole cents, "2026-11") into text people read.
// Done only at display time, so the engine never deals with rounding or wording.

const euroFormat = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const shortMonthFormat = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const longMonthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

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
