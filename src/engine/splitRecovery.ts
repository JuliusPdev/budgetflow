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

/** Pot at the start of the first planning month, derived from current-month carry. */
export function potAtPlanningStart(
  planningMonths: Month[],
  currentMonth: Month,
  potAtCurrentStart: number,
  lockByMonth: Map<Month, number>,
  deductionByMonth: Map<Month, number>,
): number {
  let pot = potAtCurrentStart;
  for (let i = planningMonths.length - 1; i >= 0; i--) {
    const month = planningMonths[i];
    if (month >= currentMonth) continue;
    pot -= (lockByMonth.get(month) ?? 0) - (deductionByMonth.get(month) ?? 0);
  }
  return pot;
}

/**
 * Simulate the full planning window using actual past contributions (locks minus
 * deductions) and planned rates from the current month forward.
 */
export function simulatePlanFeasible(
  planningMonths: Month[],
  currentMonth: Month,
  startPot: number,
  rates: number[],
  expenseTotals: Map<Month, number>,
  lockByMonth: Map<Month, number>,
  deductionByMonth: Map<Month, number>,
): boolean {
  let pot = startPot;
  for (let i = 0; i < planningMonths.length; i++) {
    const month = planningMonths[i];
    const contribution = month < currentMonth
      ? (lockByMonth.get(month) ?? 0) - (deductionByMonth.get(month) ?? 0)
      : rates[i];
    pot += contribution;
    const monthExpense = expenseTotals.get(month) ?? 0;
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
    fullWindowLength: number;
    scheduleMonths: Month[];
  }

  const slots: RecoverySlot[] = [];

  for (const expense of plannedExpenses) {
    if (settlementMap.get(expense.id)) continue;

    const totalPaid = (paymentsByExpense.get(expense.id) ?? [])
      .reduce((sum, payment) => sum + payment.amount, 0);
    if (totalPaid + EPSILON < expense.amount) continue;

    for (const payment of paymentsByExpense.get(expense.id) ?? []) {
      const windowStart = payment.month;
      const windowEnd = expense.targetMonth >= windowStart
        ? expense.targetMonth
        : windowStart;
      const fullWindowLength = monthsThrough(windowStart, windowEnd).length;

      const scheduleMonths = algorithmMonths.filter(
        month => month >= windowStart && month <= windowEnd,
      );
      if (scheduleMonths.length === 0 || fullWindowLength === 0) continue;

      slots.push({
        debt: payment.potDeduction,
        fullWindowLength,
        scheduleMonths,
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
    const rate = debt / slot.fullWindowLength;
    for (const month of slot.scheduleMonths) {
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
  /** Full recovery schedule over planningMonths (includes past ledger months). */
  recoveryByMonth: Map<Month, number>;
}

/**
 * Split set-aside into funding (open expenses) and recovery (savings dip from fully-paid
 * early payments over each expense's original target month). Rates are planned over
 * planningMonths (may extend before current month) but only displayMonths are checked
 * for feasibility and returned.
 */
export function computeSplitSetAsideRates(
  planningMonths: Month[],
  displayMonths: Month[],
  currentMonth: Month,
  regularAlgorithmExpenses: Map<Month, number>,
  deferredAlgorithmExpenses: Map<Month, number>,
  expenseTotals: Map<Month, number>,
  potCarry: number,
  plannedExpenses: PlannedExpense[],
  paymentsByExpense: Map<string, PlannedExpensePayment[]>,
  settlementMap: Map<string, PlannedExpenseSettlement>,
  currentActualContribution: number,
  lockByMonth: Map<Month, number>,
  deductionByMonth: Map<Month, number>,
  smoothFn: SmoothFn,
): SplitSetAsideRates {
  // Past months: credit locks already in potCarry. Current month with payments:
  // include the current lock in the dip. Later months: potCarry only (stable target).
  const currentMonthDeductions = deductionByMonth.get(currentMonth) ?? 0;
  const physicalDip = currentMonthDeductions > EPSILON
    ? Math.max(0, -(potCarry + currentActualContribution))
    : (potCarry < -EPSILON ? -potCarry : 0);

  const planningFunding = computeFundingRates(
    planningMonths,
    currentMonth,
    regularAlgorithmExpenses,
    deferredAlgorithmExpenses,
    expenseTotals,
    potCarry,
    currentActualContribution,
    smoothFn,
  );

  const planningRecoveryByMonth = computeRecoveryRates(
    planningMonths,
    plannedExpenses,
    paymentsByExpense,
    settlementMap,
    physicalDip,
  );

  const planningTotal = planningMonths.map((month, index) =>
    planningFunding[index] + (planningRecoveryByMonth.get(month) ?? 0),
  );

  const pickFromPlanning = (values: number[]): number[] =>
    displayMonths.map(month => {
      const index = planningMonths.indexOf(month);
      return index >= 0 ? values[index] : 0;
    });

  let funding = pickFromPlanning(planningFunding);
  let recovery = displayMonths.map(
    month => planningRecoveryByMonth.get(month) ?? 0,
  );
  let total = displayMonths.map((_, index) => funding[index] + recovery[index]);

  const planningStartPot = potAtPlanningStart(
    planningMonths,
    currentMonth,
    potCarry,
    lockByMonth,
    deductionByMonth,
  );

  if (!simulatePlanFeasible(
    planningMonths,
    currentMonth,
    planningStartPot,
    planningTotal,
    expenseTotals,
    lockByMonth,
    deductionByMonth,
  )) {
    const flooredPlanning = smoothFn(planningMonths, expenseTotals, planningStartPot).map(
      rate => (rate < EPSILON ? 0 : rate),
    );
    const flooredRecovery = planningMonths.map(
      month => planningRecoveryByMonth.get(month) ?? 0,
    );
    const flooredFunding = flooredPlanning.map((combined, index) =>
      Math.max(0, combined - Math.min(flooredRecovery[index], combined)),
    );

    funding = pickFromPlanning(flooredFunding);
    recovery = displayMonths.map(
      month => planningRecoveryByMonth.get(month) ?? 0,
    );
    total = displayMonths.map((_, index) => funding[index] + recovery[index]);
  }

  return { total, funding, recovery, recoveryByMonth: planningRecoveryByMonth };
}

/** Pot after each month when simulating forecast set-asides from a starting balance. */
export function simulateForecastPot(
  months: Month[],
  startPot: number,
  ratesByMonth: Map<Month, number>,
  expenseTotals: Map<Month, number>,
): number[] {
  const pots: number[] = [];
  let pot = startPot;
  for (const month of months) {
    pot += ratesByMonth.get(month) ?? 0;
    pot -= expenseTotals.get(month) ?? 0;
    pots.push(pot);
  }
  return pots;
}

/** Latest month with a planned expense deduction in the forecast window. */
export function lastExpenseMonthInWindow(
  months: Month[],
  expenseTotals: Map<Month, number>,
): Month | null {
  let last: Month | null = null;
  for (const month of months) {
    if ((expenseTotals.get(month) ?? 0) > EPSILON) {
      last = month;
    }
  }
  return last;
}

/**
 * After the last expense, spread extra set-aside so the forecast pot reaches zero.
 * Clearance is added to funding (not recovery) — it repays accumulated pot debt.
 */
export function computeDebtClearanceRates(
  forecastMonths: Month[],
  startPot: number,
  ratesByMonth: Map<Month, number>,
  expenseTotals: Map<Month, number>,
): Map<Month, number> {
  const terminalPot = simulateForecastPot(
    forecastMonths,
    startPot,
    ratesByMonth,
    expenseTotals,
  ).at(-1) ?? startPot;

  if (terminalPot >= -EPSILON) {
    return new Map();
  }

  const lastExpense = lastExpenseMonthInWindow(forecastMonths, expenseTotals);
  if (lastExpense == null) {
    return new Map();
  }

  const clearanceMonths = forecastMonths.filter(month => month > lastExpense);
  if (clearanceMonths.length === 0) {
    return new Map();
  }

  const debtToClear = -terminalPot;
  const equalRate = debtToClear / clearanceMonths.length;
  const clearance = new Map<Month, number>();
  for (const month of clearanceMonths) {
    clearance.set(month, equalRate);
  }
  return clearance;
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
