import { monthRange } from './months';
import type { Cents, Envelope, Month } from './types';

// The set-aside plan: from the current month to the last deadline, how much to
// put aside each month and which envelopes it goes to.
//
// Three stages:
//   A. requiredByMonth — minimum running total that must be set aside by each month
//   B. smoothTotals    — the flattest monthly amounts that meet every minimum
//                        (binding-constraint smoothing, docs/algorithm.md steps 3–7)
//   C. allocate        — pour each month's amount into envelopes, closest deadline first

export interface MonthPlan {
  month: Month;
  totalCents: Cents;
  /** This month's amount per envelope id. Envelopes that get nothing are left out. */
  byEnvelope: Record<string, Cents>;
}

/** What still has to be put toward an envelope. Paying the bill does not change it. */
export function remainingCents(envelope: Envelope): Cents {
  return Math.max(0, envelope.targetCents - envelope.savedCents);
}

/**
 * For a paid envelope: the amount borrowed from savings to pay it, which the plan
 * repays by its due month. Zero for unpaid envelopes.
 */
export function loanCents(envelope: Envelope): Cents {
  return envelope.paidMonth === undefined ? 0 : remainingCents(envelope);
}

/** A deadline that has already passed means the money is needed now. */
function effectiveDeadline(envelope: Envelope, currentMonth: Month): Month {
  return envelope.dueMonth < currentMonth ? currentMonth : envelope.dueMonth;
}

export function planSetAside(envelopes: Envelope[], currentMonth: Month): MonthPlan[] {
  const open = envelopes.filter(
    (envelope) => remainingCents(envelope) > 0 || envelope.paidMonth === undefined,
  );
  if (open.length === 0) return [];

  const lastDeadline = open
    .map((envelope) => effectiveDeadline(envelope, currentMonth))
    .reduce((latest, month) => (month > latest ? month : latest));
  const months = monthRange(currentMonth, lastDeadline);

  const required = requiredByMonth(envelopes, months, currentMonth);
  const totals = smoothTotals(required);
  return allocate(envelopes, months, totals, currentMonth);
}

/**
 * Stage A. For each month, the running total that must have been set aside by its end.
 * Two rules, whichever demands more:
 *   1. every envelope has received its remaining amount by its deadline;
 *   2. in a month when an unpaid bill is due, the savings account is not negative
 *      after paying it — so money borrowed for an early payment is back in time.
 */
function requiredByMonth(envelopes: Envelope[], months: Month[], currentMonth: Month): Cents[] {
  // What is physically in the savings account now: everything put aside, minus
  // bills already paid out of it. Negative means money was borrowed from elsewhere.
  const savingsNow = envelopes.reduce(
    (sum, envelope) =>
      sum + envelope.savedCents - (envelope.paidMonth === undefined ? 0 : envelope.targetCents),
    0,
  );

  const required: Cents[] = [];
  let runningMax = 0;
  for (const month of months) {
    let contributionsDue = 0;
    let unpaidBillsDue = 0;
    let billDueThisMonth = false;
    for (const envelope of envelopes) {
      const deadline = effectiveDeadline(envelope, currentMonth);
      if (deadline > month) continue;
      contributionsDue += remainingCents(envelope);
      if (envelope.paidMonth === undefined) {
        unpaidBillsDue += envelope.targetCents;
        if (deadline === month) billDueThisMonth = true;
      }
    }
    const savingsRule = billDueThisMonth ? unpaidBillsDue - savingsNow : 0;
    // Money set aside never disappears, so the requirement can only grow.
    runningMax = Math.max(runningMax, contributionsDue, savingsRule);
    required.push(runningMax);
  }
  return required;
}

/**
 * Stage B. The flattest monthly amounts whose running total meets `required`.
 * Repeatedly finds the deadline needing the highest monthly rate (the binding
 * constraint), uses that rate up to it, and continues after it.
 */
function smoothTotals(required: Cents[]): Cents[] {
  const totals: Cents[] = [];
  let setAsideSoFar = 0;
  let segmentStart = 0;

  while (segmentStart < required.length) {
    let bindingEnd = segmentStart;
    let bindingNeed = required[segmentStart] - setAsideSoFar;

    for (let end = segmentStart + 1; end < required.length; end++) {
      const need = required[end] - setAsideSoFar;
      // Compare need/length against bindingNeed/bindingLength without dividing,
      // so no rounding creeps in. Ties go to the later deadline: a longer flat stretch.
      const length = end - segmentStart + 1;
      const bindingLength = bindingEnd - segmentStart + 1;
      if (need * bindingLength >= bindingNeed * length) {
        bindingEnd = end;
        bindingNeed = need;
      }
    }

    totals.push(...spreadEvenly(bindingNeed, bindingEnd - segmentStart + 1));
    setAsideSoFar += bindingNeed;
    segmentStart = bindingEnd + 1;
  }
  return totals;
}

/**
 * Splits whole cents as evenly as possible. Leftover cents go to the earliest
 * months, so the running total is never behind a deadline — not even by a cent.
 */
function spreadEvenly(totalCents: Cents, monthCount: number): Cents[] {
  const base = Math.floor(totalCents / monthCount);
  const leftover = totalCents - base * monthCount;
  return Array.from({ length: monthCount }, (_, index) => base + (index < leftover ? 1 : 0));
}

/** Stage C. Pours each month's amount into envelopes, closest deadline first. */
function allocate(
  envelopes: Envelope[],
  months: Month[],
  totals: Cents[],
  currentMonth: Month,
): MonthPlan[] {
  const queue = envelopes
    .filter((envelope) => remainingCents(envelope) > 0)
    .map((envelope) => ({
      id: envelope.id,
      deadline: effectiveDeadline(envelope, currentMonth),
      stillNeeded: remainingCents(envelope),
    }))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  return months.map((month, index) => {
    let toPour = totals[index];
    const byEnvelope: Record<string, Cents> = {};
    for (const item of queue) {
      if (toPour === 0) break;
      if (item.stillNeeded === 0) continue;
      const share = Math.min(item.stillNeeded, toPour);
      byEnvelope[item.id] = share;
      item.stillNeeded -= share;
      toPour -= share;
    }
    return { month, totalCents: totals[index], byEnvelope };
  });
}
