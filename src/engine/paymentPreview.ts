import { laterChangesBetween } from './expensePreview';
import { paidCentsById, withPayments } from './payments';
import { periodStatus, shareByRule } from './period';
import { potCents } from './savingsLog';
import type { PaycheckChange } from './takeOut';
import type { Cents, Day, DoneStamp, Expense, LogEntry, Month, PaymentEntry } from './types';

// What paying towards an expense, or finishing it, would change, worked out
// before you confirm: the same plan as the main screen, once without and once with it.

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
 * @param targetAfterCents the expense's new planned amount, when paying more
 *   than planned out of the pot raises it.
 */
export function previewPayment(
  expenses: Expense[],
  log: LogEntry[],
  payday: number,
  currentPaycheck: Month,
  periodStart: Day,
  payment: PaymentEntry,
  targetAfterCents?: Cents,
): PaymentPreview {
  const expensesAfter =
    targetAfterCents === undefined
      ? expenses
      : expenses.map((expense) => (expense.id === payment.envelopeId ? { ...expense, targetCents: targetAfterCents } : expense));
  return compare(expenses, expensesAfter, log, [...log, payment], payday, currentPaycheck, periodStart, payment.envelopeId);
}

/**
 * What finishing an expense would change: the done stamp, plus the last
 * payment out of the pot if there is one.
 */
export function previewDone(
  expenses: Expense[],
  log: LogEntry[],
  payday: number,
  currentPaycheck: Month,
  periodStart: Day,
  envelopeId: string,
  done: DoneStamp,
  payment: PaymentEntry | null,
): PaymentPreview {
  const expensesAfter = expenses.map((expense) => (expense.id === envelopeId ? { ...expense, done } : expense));
  const logAfter = payment === null ? log : [...log, payment];
  return compare(expenses, expensesAfter, log, logAfter, payday, currentPaycheck, periodStart, envelopeId);
}

/** The same plan as the main screen, once as it is and once with the change. */
function compare(
  expensesBefore: Expense[],
  expensesAfter: Expense[],
  log: LogEntry[],
  logAfter: LogEntry[],
  payday: number,
  currentPaycheck: Month,
  periodStart: Day,
  envelopeId: string,
): PaymentPreview {
  const partsBefore = withPayments(expensesBefore, log, payday);
  const partsAfter = withPayments(expensesAfter, logAfter, payday);
  const before = periodStatus(partsBefore, log, currentPaycheck, periodStart);
  const after = periodStatus(partsAfter, logAfter, currentPaycheck, periodStart);

  const potBeforeCents = potCents(log);
  const potAfterCents = potCents(logAfter);
  const paidNowCents = potBeforeCents - potAfterCents;
  // The part still to pay carries the expense's own id, so its share is the
  // money the pot holds for it right now.
  const ownShare = shareByRule(before, potBeforeCents, partsBefore, currentPaycheck).shares[envelopeId] ?? 0;
  // In whole euros, like the shares on the main screen.
  const ownMoneyCents = Math.min(Math.round(ownShare / 100) * 100, paidNowCents);

  const expense = expensesAfter.find((candidate) => candidate.id === envelopeId);
  const paidAfter = paidCentsById(logAfter)[envelopeId] ?? 0;

  return {
    potBeforeCents,
    potAfterCents,
    openBeforeCents: before.openCents,
    openAfterCents: after.openCents,
    laterChanges: laterChangesBetween(before.plan, after.plan, currentPaycheck),
    ownMoneyCents,
    borrowedCents: paidNowCents - ownMoneyCents,
    leftAfterCents: expense === undefined || expense.done !== undefined ? 0 : Math.max(0, expense.targetCents - paidAfter),
  };
}
