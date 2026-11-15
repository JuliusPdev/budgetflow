import { monthRange } from './months';
import type { Cents, Envelope, Month } from './types';

// The set-aside plan: from the current month to the last deadline, how much to
// put aside each month and which envelopes it goes to.
//
// Three stages:
//   A. requiredByMonth — minimum running total that must be set aside by each month
//   B. smoothTotals    — the flattest monthly amounts that meet every minimum
//                        (binding-constraint smoothing, docs/algorithm.md steps 3–7)
//   C. allocate        — split each month's amount so every envelope gets a steady share

export interface MonthPlan {
  month: Month;
  totalCents: Cents;
  /** This month's amount per envelope id. Envelopes that get nothing are left out. */
  byEnvelope: Record<string, Cents>;
  /** Bills leaving savings this month, per envelope id. */
  billsOut: Record<string, Cents>;
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
  return allocate(envelopes, months, totals, currentMonth).map((monthPlan) => ({
    ...monthPlan,
    billsOut: billsGoingOut(envelopes, monthPlan.month, currentMonth),
  }));
}

/**
 * Bills leaving savings in `month`: an unpaid envelope's bill at its deadline,
 * a paid one's in the month it was actually paid.
 */
function billsGoingOut(envelopes: Envelope[], month: Month, currentMonth: Month): Record<string, Cents> {
  const bills: Record<string, Cents> = {};
  for (const envelope of envelopes) {
    const billMonth = envelope.paidMonth ?? effectiveDeadline(envelope, currentMonth);
    if (billMonth === month) bills[envelope.id] = envelope.targetCents;
  }
  return bills;
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

/**
 * Stage C. Splits each month's amount across envelopes so that every envelope gets
 * as steady a share as possible, in every month up to its deadline. Envelopes take
 * turns, closest deadline first; each spreads what it still needs evenly over the
 * room the earlier ones left. The smoothing in stage B guarantees there is always
 * enough room before each deadline.
 */
function allocate(
  envelopes: Envelope[],
  months: Month[],
  totals: Cents[],
  currentMonth: Month,
): Omit<MonthPlan, 'billsOut'>[] {
  const roomLeft = [...totals];
  const sharesByMonth: Record<string, Cents>[] = months.map(() => ({}));

  const inTurnOrder = envelopes
    .filter((envelope) => remainingCents(envelope) > 0)
    .sort(
      (a, b) =>
        effectiveDeadline(a, currentMonth).localeCompare(effectiveDeadline(b, currentMonth)) ||
        a.id.localeCompare(b.id),
    );

  for (const envelope of inTurnOrder) {
    const deadlineIndex = months.indexOf(effectiveDeadline(envelope, currentMonth));
    const shares = waterFill(remainingCents(envelope), roomLeft.slice(0, deadlineIndex + 1));
    shares.forEach((share, index) => {
      if (share === 0) return;
      sharesByMonth[index][envelope.id] = share;
      roomLeft[index] -= share;
    });
  }

  return months.map((month, index) => ({
    month,
    totalCents: totals[index],
    byEnvelope: sharesByMonth[index],
  }));
}

/**
 * Spreads `amountCents` over months as evenly as possible without exceeding any
 * month's room: like water poured into containers, it settles at one level
 * everywhere except where a container is too small to reach it.
 */
function waterFill(amountCents: Cents, room: Cents[]): Cents[] {
  const sharesAtLevel = (level: number) => room.map((space) => Math.min(space, level));
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

  // Find the lowest whole-cent level that holds the full amount. Binary search:
  // try the middle of the possible range, then keep only the half the answer is in.
  let low = 0;
  let high = Math.max(0, ...room);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sum(sharesAtLevel(middle)) >= amountCents) high = middle;
    else low = middle + 1;
  }

  // At that level the shares can add up to a few cents too many. Take them back
  // from the latest months, so any extra cent stays early rather than late.
  const shares = sharesAtLevel(low);
  let excess = sum(shares) - amountCents;
  for (let index = shares.length - 1; index >= 0 && excess > 0; index--) {
    if (shares[index] === low) {
      shares[index] -= 1;
      excess -= 1;
    }
  }
  return shares;
}
