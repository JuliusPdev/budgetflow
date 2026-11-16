import type { Day, Month } from './types';

// Months are stored as text ("2027-01") so they sort and save nicely, but text
// can't be subtracted. These helpers convert to a running count of months
// ("month number N since year 0"), do the arithmetic, and convert back.

function toIndex(month: Month): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return year * 12 + (monthNumber - 1);
}

function fromIndex(index: number): Month {
  const year = Math.floor(index / 12);
  const monthNumber = (index % 12) + 1;
  return `${year}-${String(monthNumber).padStart(2, '0')}`;
}

/** The calendar month a date falls in, e.g. 15 Nov 2026 → "2026-11". */
export function monthOfDate(date: Date): Month {
  return fromIndex(date.getFullYear() * 12 + date.getMonth());
}

/** The calendar day a date falls on, e.g. 16 Nov 2026 → "2026-11-16". */
export function dayOfDate(date: Date): Day {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The month `count` months after `month` ("2026-11" + 3 → "2027-02"). */
export function addMonths(month: Month, count: number): Month {
  return fromIndex(toIndex(month) + count);
}

/**
 * How many months from `from` to `to`, counting both ends:
 * "2026-11" → "2027-01" is 3 (Nov, Dec, Jan).
 */
export function monthsInclusive(from: Month, to: Month): number {
  return toIndex(to) - toIndex(from) + 1;
}

/** Every month from `from` to `to`, both included. Empty if `to` is before `from`. */
export function monthRange(from: Month, to: Month): Month[] {
  const count = monthsInclusive(from, to);
  const months: Month[] = [];
  for (let offset = 0; offset < count; offset++) {
    months.push(addMonths(from, offset));
  }
  return months;
}
