import { paycheckMonthOf } from './timing';
import type { Cents, Envelope, Expense, LogEntry, PaymentEntry } from './types';

// Payments towards an expense, and how the plan sees them.
//
// The plan already knows two kinds of expense: one still to be paid, and one
// paid (early or on time). An expense you paid part of is simply both: its
// payments become paid parts, and what's left becomes a part still to pay.
// Like tearing an envelope in two. The planning code doesn't change at all.

/** All payments in the log, oldest first. */
export function paymentsIn(log: LogEntry[]): PaymentEntry[] {
  return log
    .filter((entry): entry is PaymentEntry => entry.kind === 'payment')
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Everything a payment paid: out of the pot plus from spending money. */
export function paymentTotal(payment: PaymentEntry): Cents {
  return payment.amountCents + (payment.fromSpendingCents ?? 0);
}

/** How much has been paid towards each expense, by its id: from the pot and from spending money. */
export function paidCentsById(log: LogEntry[]): Record<string, Cents> {
  const paid: Record<string, Cents> = {};
  for (const payment of paymentsIn(log)) {
    paid[payment.envelopeId] = (paid[payment.envelopeId] ?? 0) + paymentTotal(payment);
  }
  return paid;
}

/** How much of each expense was paid from spending money, by its id. */
export function fromSpendingById(log: LogEntry[]): Record<string, Cents> {
  const spent: Record<string, Cents> = {};
  for (const payment of paymentsIn(log)) {
    if ((payment.fromSpendingCents ?? 0) > 0) {
      spent[payment.envelopeId] = (spent[payment.envelopeId] ?? 0) + (payment.fromSpendingCents ?? 0);
    }
  }
  return spent;
}

/** The expense a part belongs to: its own id for a whole expense. */
export function ownerOf(expense: Expense): string {
  return expense.partOf ?? expense.id;
}

/**
 * Your expenses as the plan needs them: one paid part per payment, plus the part
 * still to pay (with the expense's own id, so its bar and share stay where they
 * were). A fully paid or done expense has only paid parts.
 *
 * @param payday decides which paycheck a payment belongs to. Pass 1 (plain
 *   calendar months) for the screens, your payday for planning.
 */
export function withPayments<T extends Expense>(expenses: T[], log: LogEntry[], payday: number): T[] {
  const payments = paymentsIn(log);
  return expenses.flatMap((expense) => {
    const own = payments.filter((payment) => payment.envelopeId === expense.id);
    // A done expense needs nothing more: only its payments may still be put back.
    const isDone = expense.done !== undefined;
    if (own.length === 0) return isDone ? [] : [expense];
    // Money from spending counts as paid, but only pot money becomes a paid part to put back.
    const paidCents = own.reduce((sum, payment) => sum + paymentTotal(payment), 0);
    const leftCents = expense.targetCents - paidCents;
    const stillToPay: T[] = leftCents > 0 && !isDone ? [{ ...expense, targetCents: leftCents }] : [];
    const paidParts = own.filter((payment) => payment.amountCents > 0).map(
      (payment): T => ({
        ...expense,
        id: `${expense.id}~${payment.id}`,
        partOf: expense.id,
        targetCents: payment.amountCents,
        paidMonth: paycheckMonthOf(payment.date, payday),
        paidOn: payment.date,
      }),
    );
    return [...stillToPay, ...paidParts];
  });
}

export interface ExpenseProgress {
  /** Paid so far. */
  paidCents: Cents;
  /** How much of the expense is taken care of: in the pot, or paid and put back. */
  coveredCents: Cents;
  /** Of what's paid, the part that came from spending money. */
  fromSpendingCents?: Cents;
}

/**
 * Each expense's parts added back together, by the expense's id. `shown` are
 * the parts with their share of the pot as `savedCents` (withShares).
 */
export function progressById(shown: Envelope[]): Record<string, ExpenseProgress> {
  const progress: Record<string, ExpenseProgress> = {};
  for (const part of shown) {
    const owner = ownerOf(part);
    const entry = (progress[owner] ??= { paidCents: 0, coveredCents: 0 });
    if (part.paidMonth !== undefined) entry.paidCents += part.targetCents;
    entry.coveredCents += Math.min(part.savedCents, part.targetCents);
  }
  return progress;
}

/**
 * Before version 7 an expense could only be ticked "Already paid" in a month.
 * Each tick becomes one payment of the full amount on the 1st of that month,
 * which the plan reads exactly as it read the tick. Fixed ids and dates, so
 * every device converts to the same budget and sync agrees.
 */
export function ticksToPayments<T extends Expense>(expenses: T[]): { expenses: T[]; payments: PaymentEntry[] } {
  const payments: PaymentEntry[] = [];
  const untouched = expenses.map((expense) => {
    if (expense.paidMonth === undefined) return expense;
    payments.push({
      id: `paid-${expense.id}`,
      kind: 'payment',
      date: `${expense.paidMonth}-01`,
      envelopeId: expense.id,
      amountCents: expense.targetCents,
    });
    const unticked = { ...expense };
    delete unticked.paidMonth;
    return unticked;
  });
  return { expenses: untouched, payments };
}

/**
 * Amounts per part, added up per expense: "€80 + €55 for the trip" becomes
 * "€135 for the trip". Ids that aren't parts are kept as they are.
 */
export function addUpParts(amounts: Record<string, Cents>, parts: Expense[]): Record<string, Cents> {
  const owners = new Map(parts.map((part) => [part.id, ownerOf(part)]));
  const added: Record<string, Cents> = {};
  for (const [id, cents] of Object.entries(amounts)) {
    const owner = owners.get(id) ?? id;
    added[owner] = (added[owner] ?? 0) + cents;
  }
  return added;
}

/**
 * Within each expense, what the pot holds for it goes to the paid parts first.
 * A payment uses the expense's own money before borrowing, so what's left in
 * the pot is for the part still to pay only once the payments are covered.
 * Only moves money between parts of the same expense; totals stay the same.
 */
export function coverPaidFirst(parts: Envelope[]): Envelope[] {
  const coveredByOwner = new Map<string, Cents>();
  for (const part of parts) {
    const owner = ownerOf(part);
    coveredByOwner.set(owner, (coveredByOwner.get(owner) ?? 0) + Math.min(part.savedCents, part.targetCents));
  }
  // Paid parts first, then the part still to pay.
  const order = [...parts].sort((a, b) => Number(a.paidMonth === undefined) - Number(b.paidMonth === undefined));
  const covered = new Map<string, Cents>();
  for (const part of order) {
    const owner = ownerOf(part);
    if (!parts.some((other) => other !== part && ownerOf(other) === owner)) continue;
    const left = coveredByOwner.get(owner) ?? 0;
    const share = Math.min(left, part.targetCents);
    covered.set(part.id, share);
    coveredByOwner.set(owner, left - share);
  }
  return parts.map((part) => (covered.has(part.id) ? { ...part, savedCents: covered.get(part.id) ?? 0 } : part));
}

/** Where the money above the planned amount came from, when something cost more. */
export type ExtraFrom = 'pot' | 'spending';

/**
 * How much the pot pays when you finish an expense: what it really cost, minus
 * what's paid already. When it cost more than planned and the extra came from
 * your spending money, the pot pays only up to the planned amount.
 * Never below zero: a total under what's paid is caught before this.
 */
export function lastPaymentCents(targetCents: Cents, paidCents: Cents, costCents: Cents, extraFrom: ExtraFrom): Cents {
  const potPaysUpTo = costCents > targetCents && extraFrom === 'spending' ? targetCents : costCents;
  return Math.max(0, potPaysUpTo - paidCents);
}

/** How a payment splits between the pot and your spending money. */
export interface PaymentSplit {
  /** Out of the pot. */
  fromPotCents: Cents;
  /** From your spending money: an extra you chose to pay yourself, plus anything the pot didn't hold. */
  fromSpendingCents: Cents;
  /** The part above what's planned for the expense. */
  extraCents: Cents;
  /** Of that, the part the pot couldn't pay because it didn't hold enough. */
  shortCents: Cents;
}

/**
 * Who pays a payment of `amountCents` when `leftCents` is still planned for the
 * expense and the pot holds `potCents`. Above the plan, `extraFrom` decides;
 * the pot never pays more than it holds, so it can't go below zero.
 */
export function splitPayment(amountCents: Cents, leftCents: Cents, potCents: Cents, extraFrom: ExtraFrom): PaymentSplit {
  const extraCents = Math.max(0, amountCents - Math.max(0, leftCents));
  const potShouldPay = extraFrom === 'spending' ? amountCents - extraCents : amountCents;
  const fromPotCents = Math.min(potShouldPay, Math.max(0, potCents));
  return {
    fromPotCents,
    fromSpendingCents: amountCents - fromPotCents,
    extraCents,
    shortCents: potShouldPay - fromPotCents,
  };
}

/**
 * Finishing an expense: the last payment, split between the pot (never more
 * than it holds) and your spending money.
 */
export function finishSplit(
  targetCents: Cents,
  paidCents: Cents,
  costCents: Cents,
  extraFrom: ExtraFrom,
  potCents: Cents,
): { fromPotCents: Cents; fromSpendingCents: Cents } {
  const lastCents = lastPaymentCents(targetCents, paidCents, costCents, extraFrom);
  const fromPotCents = Math.min(lastCents, Math.max(0, potCents));
  return { fromPotCents, fromSpendingCents: lastCents - fromPotCents };
}
