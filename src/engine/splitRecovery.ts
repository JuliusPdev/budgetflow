import { addMonths } from './smoothing';
import type {
  Month,
  PlannedExpense,
  PlannedExpensePayment,
  PlannedExpenseSettlement,
} from './types';

const EPSILON = 0.001;

export type SmoothFn = (
  months: Month[],
  expenseTotals: Map<Month, number>,
  potCarry: number,
) => number[];

/** Simulate pot month-by-month; fail if an expense month leaves the pot negative. */
export function simulatePotFeasible(
  months: Month[],
  startPot: number,
  rates: number[],
  expenseTotals: Map<Month, number>,
): boolean {
  let pot = startPot;
  for (let i = 0; i < months.length; i++) {
    pot += rates[i];
    const monthExpense = expenseTotals.get(months[i]) ?? 0;
    pot -= monthExpense;
    if (monthExpense > EPSILON && pot < -EPSILON) {
      return false;
    }
  }
  return true;
}

/** Recovery rates for fully-paid expenses, spread to each expense's original target month. */
export function computeRecoveryRates(
  algorithmMonths: Month[],
  currentMonth: Month,
  plannedExpenses: PlannedExpense[],
  paymentsByExpense: Map<string, PlannedExpensePayment[]>,
  settlementMap: Map<string, PlannedExpenseSettlement>,
  physicalDip: number,
): Map<Month, number> {
  const recoveryByMonth = new Map<Month, number>();
  for (const month of algorithmMonths) {
    recoveryByMonth.set(month, 0);
  }

  if (physicalDip <= EPSILON) {
    return recoveryByMonth;
  }

  interface RecoverySlot {
    debt: number;
    windowMonths: Month[];
  }

  const slots: RecoverySlot[] = [];

  for (const expense of plannedExpenses) {
    if (settlementMap.get(expense.id)) continue;

    const totalPaid = (paymentsByExpense.get(expense.id) ?? [])
      .reduce((sum, payment) => sum + payment.amount, 0);
    if (totalPaid + EPSILON < expense.amount) continue;

    for (const payment of paymentsByExpense.get(expense.id) ?? []) {
      const windowStart = payment.month < currentMonth ? currentMonth : payment.month;
      let windowEnd = expense.targetMonth;
      if (windowEnd < windowStart) {
        windowEnd = windowStart;
      }

      const windowMonths = algorithmMonths.filter(
        month => month >= windowStart && month <= windowEnd,
      );
      if (windowMonths.length === 0) continue;

      slots.push({
        debt: payment.potDeduction,
        windowMonths,
      });
    }
  }

  const totalAssigned = slots.reduce((sum, slot) => sum + slot.debt, 0);
  if (totalAssigned <= EPSILON) {
    return recoveryByMonth;
  }

  const scale = totalAssigned > physicalDip ? physicalDip / totalAssigned : 1;

  for (const slot of slots) {
    const debt = slot.debt * scale;
    const rate = debt / slot.windowMonths.length;
    for (const month of slot.windowMonths) {
      recoveryByMonth.set(month, (recoveryByMonth.get(month) ?? 0) + rate);
    }
  }

  return recoveryByMonth;
}

/** Funding pass: remaining expenses, using positive past pot as carry (dip handled by recovery). */
export function computeFundingRates(
  algorithmMonths: Month[],
  currentMonth: Month,
  regularAlgorithmExpenses: Map<Month, number>,
  deferredAlgorithmExpenses: Map<Month, number>,
  expenseTotals: Map<Month, number>,
  potCarry: number,
  currentActualContribution: number,
  smoothFn: SmoothFn,
): number[] {
  const fundingCarry = potCarry > EPSILON ? potCarry : 0;
  const rates = smoothFn(algorithmMonths, regularAlgorithmExpenses, fundingCarry);
  const fundingByMonth = new Map<Month, number>();
  algorithmMonths.forEach((month, index) => {
    fundingByMonth.set(month, rates[index] < EPSILON ? 0 : rates[index]);
  });

  if (deferredAlgorithmExpenses.size === 0) {
    return algorithmMonths.map(month => fundingByMonth.get(month) ?? 0);
  }

  const currentRate = fundingByMonth.get(currentMonth) ?? 0;
  const effectiveCurrentContribution = Math.max(currentActualContribution, currentRate);
  const currentExpenseTotal = expenseTotals.get(currentMonth) ?? 0;
  const potAfterCurrent = fundingCarry + effectiveCurrentContribution - currentExpenseTotal;

  const futureMonths = algorithmMonths.slice(1);
  const mergedExpenses = new Map<Month, number>();
  for (const [month, amount] of regularAlgorithmExpenses) {
    if (month > currentMonth) mergedExpenses.set(month, amount);
  }
  for (const [month, amount] of deferredAlgorithmExpenses) {
    mergedExpenses.set(month, (mergedExpenses.get(month) ?? 0) + amount);
  }

  const pass2Rates = smoothFn(futureMonths, mergedExpenses, potAfterCurrent);
  futureMonths.forEach((month, index) => {
    const raw = pass2Rates[index] < EPSILON ? 0 : pass2Rates[index];
    fundingByMonth.set(month, raw);
  });

  return algorithmMonths.map(month => fundingByMonth.get(month) ?? 0);
}

export interface SplitSetAsideRates {
  total: number[];
  funding: number[];
  recovery: number[];
}

/**
 * Split set-aside into funding (open expenses) and recovery (savings dip from fully-paid
 * early payments over each expense's original target month). Combined schedule must still
 * meet all expense deadlines starting from the physical pot.
 */
export function computeSplitSetAsideRates(
  algorithmMonths: Month[],
  currentMonth: Month,
  regularAlgorithmExpenses: Map<Month, number>,
  deferredAlgorithmExpenses: Map<Month, number>,
  expenseTotals: Map<Month, number>,
  potActualNow: number,
  potCarry: number,
  plannedExpenses: PlannedExpense[],
  paymentsByExpense: Map<string, PlannedExpensePayment[]>,
  settlementMap: Map<string, PlannedExpenseSettlement>,
  currentActualContribution: number,
  smoothFn: SmoothFn,
): SplitSetAsideRates {
  const physicalDip = potActualNow < -EPSILON ? -potActualNow : 0;

  const funding = computeFundingRates(
    algorithmMonths,
    currentMonth,
    regularAlgorithmExpenses,
    deferredAlgorithmExpenses,
    expenseTotals,
    potCarry,
    currentActualContribution,
    smoothFn,
  );

  const recoveryByMonth = computeRecoveryRates(
    algorithmMonths,
    currentMonth,
    plannedExpenses,
    paymentsByExpense,
    settlementMap,
    physicalDip,
  );
  const recovery = algorithmMonths.map(month => recoveryByMonth.get(month) ?? 0);

  let total = algorithmMonths.map((_, index) => funding[index] + recovery[index]);

  if (!simulatePotFeasible(algorithmMonths, potActualNow, total, expenseTotals)) {
    total = smoothFn(algorithmMonths, expenseTotals, potActualNow).map(
      rate => (rate < EPSILON ? 0 : rate),
    );
    const adjustedFunding = total.map((combined, index) =>
      Math.max(0, combined - Math.min(recovery[index], combined)),
    );
    const adjustedRecovery = total.map((combined, index) => combined - adjustedFunding[index]);
    return {
      total,
      funding: adjustedFunding,
      recovery: adjustedRecovery,
    };
  }

  return { total, funding, recovery };
}

/** Months from start through end inclusive. */
export function monthsThrough(start: Month, end: Month): Month[] {
  const months: Month[] = [];
  let cursor = start;
  while (cursor <= end) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}
