import type { PaymentPreview } from '../engine/paymentPreview';
import { formatEuros } from './format';

/**
 * Whose money a payment out of the pot was: the expense's own, money put aside
 * for your other expenses, or more than the pot held at all (it goes below zero).
 */
export function whoseMoney(preview: PaymentPreview, expenseName: string): string {
  const { ownMoneyCents, borrowedCents, potBeforeCents } = preview;
  if (borrowedCents === 0) return `All of it was already put aside for ${expenseName}.`;
  // What the pot held beyond this expense's own money: only that much can be borrowed.
  const othersInPot = Math.max(0, Math.max(0, potBeforeCents) - ownMoneyCents);
  const fromOthersCents = Math.min(borrowedCents, othersInPot);
  const beyondPotCents = borrowedCents - fromOthersCents;

  const sources = [
    ...(ownMoneyCents > 0 ? [`${formatEuros(ownMoneyCents)} was put aside for ${expenseName}`] : []),
    ...(fromOthersCents > 0 ? [`${formatEuros(fromOthersCents)} is borrowed from your other expenses`] : []),
    ...(beyondPotCents > 0 ? [`${formatEuros(beyondPotCents)} is more than the pot holds, so it goes below zero`] : []),
  ];
  const listed = sources.length === 1 ? sources[0] : `${sources.slice(0, -1).join(', ')} and ${sources[sources.length - 1]}`;
  const opening = ownMoneyCents === 0 ? `None of it was put aside for ${expenseName} yet: ` : 'Of this, ';
  return `${opening}${listed}. Your plan puts it back before your other expenses are due.`;
}
