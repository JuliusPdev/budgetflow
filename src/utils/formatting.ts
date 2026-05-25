import type { Month } from '../engine/types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// "2026-05" → "May 2026"
export function formatMonth(month: Month): string {
  const [yearStr, monStr] = month.split('-');
  const name = MONTH_NAMES[parseInt(monStr, 10) - 1];
  return `${name} ${yearStr}`;
}

// Whole-euro amounts for headlines and free-budget displays: 675 → "€675"
export function formatCurrency(amount: number): string {
  const rounded = Math.round(amount);
  return `€${rounded.toLocaleString('en-GB')}`;
}

// Two-decimal amounts for precise algorithm outputs: 133.33 → "€133.33"
export function formatCurrencyExact(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

// Returns today's month as a "YYYY-MM" string, e.g. "2026-05".
// Single source of truth for "what month is it right now."
export function getCurrentMonth(): Month {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}
