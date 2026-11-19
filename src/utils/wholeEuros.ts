import type { Cents } from '../engine/types';

/**
 * Rounds shares to whole euros for display, keeping their total: each share is
 * rounded down, then the euros that are missing go to the shares with the
 * biggest leftover fraction. €160.72 · €117.86 · €21.42 → €161 · €118 · €21.
 * The engine keeps its exact cents; only what you read is rounded.
 */
export function wholeEuros(shares: Record<string, Cents>): Record<string, Cents> {
  const entries = Object.entries(shares);
  const totalEuros = Math.round(entries.reduce((sum, [, cents]) => sum + cents, 0) / 100);
  const rounded = entries.map(([id, cents]) => ({ id, euros: Math.floor(cents / 100), fraction: cents % 100 }));
  let missing = totalEuros - rounded.reduce((sum, share) => sum + share.euros, 0);
  for (const share of [...rounded].sort((a, b) => b.fraction - a.fraction)) {
    if (missing <= 0) break;
    share.euros += 1;
    missing -= 1;
  }
  return Object.fromEntries(rounded.map((share) => [share.id, share.euros * 100]));
}
