import { laterChangesBetween } from './expensePreview';
import { paidCentsById, withPayments } from './payments';
import { periodStatus, shareByRule } from './period';
import { potCents } from './savingsLog';
import type { PaycheckChange } from './takeOut';
import type { Cents, Day, Expense, LogEntry, Month, PaymentEntry } from './types';

// What paying towards an expense would change, worked out before you confirm:
// the same plan as the main screen, once without the payment and once with it.

export interface PaymentPreview {
  /** What's in the pot, without and with the payment. */
  potBeforeCents: Cents;
  potAfterCents: Cents;
  /** Still to put aside in the current paycheck, without and with it. */
  openBeforeCents: Cents;
  openAfterCents: Cents;
  /** Later paychecks whose amount changes. */
  laterChanges: PaycheckChange[];
  /** The part of the payment the pot held for this expense. */
  ownMoneyCents: Cents;
  /** The rest, borrowed from what's put aside for your other expenses. */
  borrowedCents: Cents;
  /** Still to pay for the expense afterwards. */
  leftAfterCents: Cents;
}

/**
 * @param expenses your expenses in paycheck terms (planningView), not yet split
 *   by their payments: the payment changes how they split.
 * @param payment the payment to try; it is never saved from here.
 */
export function previewPayment(
  expenses: Expense[],
  log: LogEntry[],
  payday: number,
  currentPaycheck: Month,
  periodStart: Day,
  payment: PaymentEntry,
): PaymentPreview {
  const logAfter = [...log, payment];
  const partsBefore = withPayments(expenses, log, payday);
  const partsAfter = withPayments(expenses, logAfter, payday);
  const before = periodStatus(partsBefore, log, currentPaycheck, periodStart);
  const after = periodStatus(partsAfter, logAfter, currentPaycheck, periodStart);

  // The part still to pay carries the expense's own id, so its share is the
  // money the pot holds for it right now.
  const potBeforeCents = potCents(log);
  const ownShare = shareByRule(before, potBeforeCents, partsBefore, currentPaycheck).shares[payment.envelopeId] ?? 0;
  // In whole euros, like the shares on the main screen.
  const ownMoneyCents = Math.min(Math.round(ownShare / 100) * 100, payment.amountCents);

  const expense = expenses.find((candidate) => candidate.id === payment.envelopeId);
  const paidAfter = paidCentsById(logAfter)[payment.envelopeId] ?? 0;

  return {
    potBeforeCents,
    potAfterCents: potCents(logAfter),
    openBeforeCents: before.openCents,
    openAfterCents: after.openCents,
    laterChanges: laterChangesBetween(before.plan, after.plan, currentPaycheck),
    ownMoneyCents,
    borrowedCents: payment.amountCents - ownMoneyCents,
    leftAfterCents: Math.max(0, (expense?.targetCents ?? 0) - paidAfter),
  };
}
