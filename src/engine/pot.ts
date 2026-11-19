import { addMonths } from './months';
import { planSetAside, type MonthPlan } from './plan';
import type { Cents, Envelope, Expense, Month } from './types';

// One savings pot instead of money sealed inside each expense.
//
// Stored: how much went into and out of the pot. Calculated fresh every time:
// which expense that money is for. So deleting an expense frees its money,
// a new expense gets its share of what's already there, and money no expense
// needs is still counted as extra.

/** The id of the made-up expense that refills a pot that went below zero. */
export const REFILL_ID = 'refill-pot';

/** Taking part in the sharing: unpaid expenses, and expenses paid before their due month. */
function takesPart(envelope: Expense, currentMonth: Month): boolean {
  return envelope.paidMonth === undefined || envelope.dueMonth >= currentMonth;
}

export interface PotShares {
  /** How much of the pot is for each expense taking part, by id (zero included). */
  shares: Record<string, Cents>;
  /** Money no expense needs right now. */
  extraCents: Cents;
  /** How far the pot is below zero after bills already paid and due: to refill now. */
  shortfallCents: Cents;
}

/**
 * Shares the pot out, closest deadline first: the next bill is filled completely
 * before a later one gets anything. That keeps the nearest bills safest and the
 * set-aside rates as low and flat as possible.
 *
 * An expense paid early still takes part until its due month: its bill already
 * left the pot, so it is added back here and the expense claims it like any
 * other. Whatever it doesn't get is the loan the plan repays by its due month.
 */
export function sharePot(potCents: Cents, envelopes: Expense[], currentMonth: Month): PotShares {
  const sharing = envelopes
    .filter((envelope) => takesPart(envelope, currentMonth))
    .sort(
      (a, b) =>
        a.dueMonth.localeCompare(b.dueMonth) ||
        (a.dueDate ?? '').localeCompare(b.dueDate ?? '') ||
        a.id.localeCompare(b.id),
    );
  const paidEarlyCents = sharing
    .filter((envelope) => envelope.paidMonth !== undefined)
    .reduce((sum, envelope) => sum + envelope.targetCents, 0);

  let left = potCents + paidEarlyCents;
  const shortfallCents = Math.max(0, -left);
  const shares: Record<string, Cents> = {};
  for (const envelope of sharing) {
    const share = Math.max(0, Math.min(envelope.targetCents, left));
    shares[envelope.id] = share;
    left -= share;
  }
  return { shares, extraCents: Math.max(0, left), shortfallCents };
}

/**
 * The expenses as the plan needs them, with each one's share of the pot as its
 * "saved" amount. Expenses paid and past their due month are settled. A pot
 * below zero becomes a refill that the plan repays straight away.
 */
export function withShares(envelopes: Expense[], potShares: PotShares, currentMonth: Month): Envelope[] {
  const shared = envelopes.map((envelope) => ({
    ...envelope,
    savedCents: potShares.shares[envelope.id] ?? envelope.targetCents,
  }));
  if (potShares.shortfallCents === 0) return shared;
  const refill: Envelope = {
    id: REFILL_ID,
    name: 'Refill your pot',
    targetCents: potShares.shortfallCents,
    savedCents: 0,
    dueMonth: currentMonth,
    // Paid before the plan starts, so it shows as money to repay, not a bill going out.
    paidMonth: addMonths(currentMonth, -1),
  };
  return [...shared, refill];
}

/**
 * Shares the pot out as if you had always followed your plan: a reference plan
 * made from `origin` (your first set-aside's paycheck) with an empty pot says
 * how each paycheck would be split, and the pot is poured into it paycheck by
 * paycheck. A paycheck only partly covered is split in its own proportions.
 *
 * The reference starts at a fixed point, so shares keep growing in the same
 * pattern from one paycheck to the next instead of jumping. Expenses paid
 * early take part until their due month, like in `sharePot`.
 */
export function sharePotByPlan(
  potCents: Cents,
  envelopes: Expense[],
  origin: Month,
  currentMonth: Month,
): PotShares {
  const sharing = envelopes.filter((envelope) => takesPart(envelope, currentMonth));
  const paidEarlyCents = sharing
    .filter((envelope) => envelope.paidMonth !== undefined)
    .reduce((sum, envelope) => sum + envelope.targetCents, 0);
  let left = potCents + paidEarlyCents;
  const shares: Record<string, Cents> = Object.fromEntries(sharing.map((envelope) => [envelope.id, 0]));
  if (left <= 0) return { shares, extraCents: 0, shortfallCents: Math.max(0, -left) };

  // Every expense as if nothing were saved or paid yet, planned from the origin.
  const reference = planSetAside(
    sharing.map((envelope) => ({ ...envelope, paidMonth: undefined, savedCents: 0 })),
    origin,
  );
  for (const monthPlan of reference) {
    if (left <= 0) break;
    // byEnvelope lists the closest deadline first, so spare cents go there.
    const parts = Object.entries(monthPlan.byEnvelope);
    const monthTotal = parts.reduce((sum, [, cents]) => sum + cents, 0);
    if (monthTotal === 0) continue;
    const pour = Math.min(left, monthTotal);
    let poured = 0;
    const amounts = parts.map(([id, cents]) => {
      const amount = Math.floor((pour * cents) / monthTotal);
      poured += amount;
      return [id, amount] as const;
    });
    let spare = pour - poured;
    for (const [id, amount] of amounts) {
      const extraCent = spare > 0 ? 1 : 0;
      spare -= extraCent;
      shares[id] += amount + extraCent;
    }
    left -= pour;
  }
  return { shares, extraCents: Math.max(0, left), shortfallCents: 0 };
}

/** The set-aside plan for a pot holding `potCents`. */
export function planFromPot(envelopes: Expense[], potCents: Cents, currentMonth: Month): MonthPlan[] {
  return planSetAside(withShares(envelopes, sharePot(potCents, envelopes, currentMonth), currentMonth), currentMonth);
}
