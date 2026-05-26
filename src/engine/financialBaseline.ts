import type { BudgetState, FinancialBaseline, LockInRecord, Month } from './types';

const EPSILON = 0.001;

/** Whether baseline applies to engine calculations for this calendar month. */
export function isBaselineActiveForMonth(
  baseline: FinancialBaseline | undefined,
  month: Month,
): boolean {
  return baseline !== undefined && baseline.asOfMonth === month;
}

/**
 * Pot carry seed from user-stated pot balance.
 * potBalance is physical pot today; subtract this month's lock-ins so new locks are not double-counted.
 */
export function openingPotSeed(
  baseline: FinancialBaseline | undefined,
  currentMonth: Month,
  lockIns: LockInRecord[],
): number {
  if (!isBaselineActiveForMonth(baseline, currentMonth)) return 0;
  const lockedThisMonth = lockIns
    .filter(l => l.month === currentMonth)
    .reduce((sum, l) => sum + l.lockedAmount, 0);
  return Math.max(0, (baseline?.potBalance ?? 0) - lockedThisMonth);
}

/** Ground-truth free budget from checking balance minus bootstrap spend. */
export function anchoredFreeBudget(baseline: FinancialBaseline): number {
  const spent = baseline.freeSpentThisMonth ?? 0;
  return Math.max(0, baseline.checkingBalance - spent);
}

/**
 * Merge baseline into budget: persist fields + income override + bootstrap lock-in.
 */
export function applyFinancialBaselineEffects(
  budget: BudgetState,
  baseline: FinancialBaseline,
): BudgetState {
  let next: BudgetState = { ...budget, financialBaseline: baseline };

  const incomeReceived = baseline.incomeReceivedThisMonth;
  if (incomeReceived !== undefined && incomeReceived > EPSILON) {
    next = {
      ...next,
      incomeByMonth: {
        ...(next.incomeByMonth ?? {}),
        [baseline.asOfMonth]: incomeReceived,
      },
    };
  }

  const setAside = baseline.setAsideTransferredThisMonth ?? 0;
  if (setAside > EPSILON) {
    const existing = next.lockIns.find(l => l.month === baseline.asOfMonth);
    if (existing) {
      next = {
        ...next,
        lockIns: next.lockIns.map(l =>
          l.month === baseline.asOfMonth
            ? { ...l, lockedAmount: setAside, lockState: l.lockState ?? 'planned' }
            : l,
        ),
      };
    } else {
      next = {
        ...next,
        lockIns: [
          ...next.lockIns,
          {
            id: crypto.randomUUID(),
            month: baseline.asOfMonth,
            lockedAmount: setAside,
            lockState: 'planned',
          },
        ],
      };
    }
  }

  return next;
}

/** Fixed already paid reduces theoretical available (not anchored stock). */
export function baselineFixedPaidReduction(
  baseline: FinancialBaseline | undefined,
  month: Month,
): number {
  if (!isBaselineActiveForMonth(baseline, month)) return 0;
  return baseline?.fixedPaidThisMonth ?? 0;
}

export function mergeAnchoredFreeBudget(
  theoreticalFree: number,
  baseline: FinancialBaseline | undefined,
  month: Month,
): { freeBudget: number; theoretical: number; anchored: number | null } {
  if (!isBaselineActiveForMonth(baseline, month)) {
    return { freeBudget: theoreticalFree, theoretical: theoreticalFree, anchored: null };
  }
  const anchored = anchoredFreeBudget(baseline!);
  return {
    freeBudget: Math.max(theoreticalFree, anchored),
    theoretical: theoreticalFree,
    anchored,
  };
}
