import { remainingCents, type MonthPlan } from './plan';
import type { Cents, Envelope, LogEntry, Month, SetAsideEntry } from './types';

// Turning what you actually set aside into progress on each envelope.

function setAsidesIn(log: LogEntry[], month: Month): SetAsideEntry[] {
  return log.filter((entry): entry is SetAsideEntry => entry.kind === 'set-aside' && entry.month === month);
}

/** Total set aside during `month`. */
export function setAsideInMonth(log: LogEntry[], month: Month): Cents {
  return setAsidesIn(log, month).reduce((total, entry) => total + entry.amountCents, 0);
}

/** What's still open of this month's plan after what you've logged; never below zero. */
export function stillOpenThisMonth(monthPlan: MonthPlan | undefined, log: LogEntry[]): Cents {
  if (monthPlan === undefined) return 0;
  return Math.max(0, monthPlan.totalCents - setAsideInMonth(log, monthPlan.month));
}

/** Cents each envelope received during `month`, by envelope id. */
function receivedIn(log: LogEntry[], month: Month): Map<string, Cents> {
  const received = new Map<string, Cents>();
  for (const entry of setAsidesIn(log, month)) {
    for (const [id, cents] of Object.entries(entry.split)) {
      received.set(id, (received.get(id) ?? 0) + cents);
    }
  }
  return received;
}

/**
 * The envelopes as they stood at the start of `month`, before this month's
 * set-asides. Planning from these keeps this month's amount fixed while you
 * log against it, instead of shrinking with every entry.
 */
export function envelopesAtMonthStart(envelopes: Envelope[], log: LogEntry[], month: Month): Envelope[] {
  const received = receivedIn(log, month);
  if (received.size === 0) return envelopes;
  return envelopes.map((envelope) => {
    const thisMonth = received.get(envelope.id) ?? 0;
    return thisMonth === 0 ? envelope : { ...envelope, savedCents: Math.max(0, envelope.savedCents - thisMonth) };
  });
}

export interface SplitResult {
  /** Cents for each envelope, by id. */
  split: Record<string, Cents>;
  /** What no envelope needs any more: stays in the pot as extra. */
  extraCents: Cents;
}

/**
 * Splits money you set aside across envelopes:
 *   1. each envelope's share of this month's plan that isn't covered yet,
 *      closest deadline first (the plan's own order);
 *   2. anything more towards the next deadlines — you're getting ahead.
 * Never gives an envelope more than it still needs.
 */
export function splitSetAside(
  amountCents: Cents,
  monthPlan: MonthPlan | undefined,
  envelopes: Envelope[],
  log: LogEntry[],
): SplitResult {
  const stillNeeded = new Map(envelopes.map((envelope) => [envelope.id, remainingCents(envelope)]));
  const alreadyThisMonth = monthPlan === undefined ? new Map<string, Cents>() : receivedIn(log, monthPlan.month);
  const split: Record<string, Cents> = {};
  let left = amountCents;

  function give(id: string, wanted: Cents): void {
    const share = Math.min(wanted, stillNeeded.get(id) ?? 0, left);
    if (share <= 0) return;
    split[id] = (split[id] ?? 0) + share;
    stillNeeded.set(id, (stillNeeded.get(id) ?? 0) - share);
    left -= share;
  }

  for (const [id, planned] of Object.entries(monthPlan?.byEnvelope ?? {})) {
    give(id, planned - (alreadyThisMonth.get(id) ?? 0));
  }
  const byDeadline = [...envelopes].sort((a, b) => a.dueMonth.localeCompare(b.dueMonth) || a.id.localeCompare(b.id));
  for (const envelope of byDeadline) give(envelope.id, Number.POSITIVE_INFINITY);

  return { split, extraCents: left };
}

/** Adds a split to the envelopes (direction 1), or takes it back off (direction -1). */
export function applySplit(envelopes: Envelope[], split: Record<string, Cents>, direction: 1 | -1): Envelope[] {
  return envelopes.map((envelope) => {
    const cents = split[envelope.id];
    if (cents === undefined) return envelope;
    return { ...envelope, savedCents: Math.max(0, envelope.savedCents + direction * cents) };
  });
}
