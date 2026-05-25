import type { Month, MonthCarryAdjustments } from './types';
import { addMonths } from './smoothing';

export interface CarryForwardInput {
  fromMonth: Month;
  envelopeDecisions: { envelopeId: string; surplus: number; choice: 'carry' }[];
  leftoverFreeBudget: number;
  includeLeftoverCarry: boolean;
}

export function buildCarryAdjustments(input: CarryForwardInput): MonthCarryAdjustments {
  const toMonth = addMonths(input.fromMonth, 1);
  const envelopeBoosts: Record<string, number> = {};

  for (const d of input.envelopeDecisions) {
    envelopeBoosts[d.envelopeId] = (envelopeBoosts[d.envelopeId] ?? 0) + d.surplus;
  }

  return {
    month: toMonth,
    freeBudgetBoost: input.includeLeftoverCarry ? input.leftoverFreeBudget : 0,
    envelopeBoosts,
  };
}

export function mergeCarryAdjustments(
  existing: MonthCarryAdjustments[],
  incoming: MonthCarryAdjustments,
): MonthCarryAdjustments[] {
  const without = existing.filter(a => a.month !== incoming.month);
  const prev = existing.find(a => a.month === incoming.month);

  if (!prev) return [...without, incoming];

  const mergedEnvelopes = { ...prev.envelopeBoosts };
  for (const [id, amt] of Object.entries(incoming.envelopeBoosts)) {
    mergedEnvelopes[id] = (mergedEnvelopes[id] ?? 0) + amt;
  }

  return [
    ...without,
    {
      month: incoming.month,
      freeBudgetBoost: prev.freeBudgetBoost + incoming.freeBudgetBoost,
      envelopeBoosts: mergedEnvelopes,
    },
  ];
}

export function getCarryForMonth(
  adjustments: MonthCarryAdjustments[],
  month: Month,
): MonthCarryAdjustments | undefined {
  return adjustments.find(a => a.month === month);
}

export function getEnvelopePlannedWithCarry(
  basePlanned: number,
  envelopeId: string,
  month: Month,
  adjustments: MonthCarryAdjustments[],
): number {
  const carry = getCarryForMonth(adjustments, month);
  if (!carry) return basePlanned;
  return basePlanned + (carry.envelopeBoosts[envelopeId] ?? 0);
}
