import type {
  BudgetState,
  Month,
  PlannedExpense,
  PlannedExpensePayment,
  PlannedExpenseRecovery,
} from './types';

const EPSILON = 0.001;

/** Free-budget portion of an early planned-expense payment (not taken from pot). */
export function freeBudgetPortionOfPayment(payment: PlannedExpensePayment): number {
  return Math.max(0, payment.amount - payment.potDeduction);
}

export function recoveryRepaidForExpense(
  expenseId: string,
  recoveries: PlannedExpenseRecovery[],
): number {
  return recoveries
    .filter(r => r.plannedExpenseId === expenseId)
    .reduce((sum, r) => sum + r.amount, 0);
}

export function recoveryOwedForExpense(
  expenseId: string,
  payments: PlannedExpensePayment[],
  recoveries: PlannedExpenseRecovery[],
): number {
  const owed = payments
    .filter(p => p.plannedExpenseId === expenseId)
    .reduce((sum, p) => sum + freeBudgetPortionOfPayment(p), 0);
  return Math.max(0, owed - recoveryRepaidForExpense(expenseId, recoveries));
}

export function totalRecoveryOwedRemaining(state: Pick<BudgetState, 'plannedExpenses' | 'plannedExpensePayments' | 'plannedExpenseRecoveries'>): number {
  const payments = state.plannedExpensePayments ?? [];
  const recoveries = state.plannedExpenseRecoveries ?? [];
  return state.plannedExpenses.reduce(
    (sum, e) => sum + recoveryOwedForExpense(e.id, payments, recoveries),
    0,
  );
}

export interface PlannedExpenseRecoverySlice {
  plannedExpenseId: string;
  expenseName: string;
  amount: number;
}

export interface SetAsideSplit {
  recovery: number;
  funding: number;
  byExpense: PlannedExpenseRecoverySlice[];
}

/** Allocate this month's set-aside: recovery first (per expense with owed), then funding. */
export function splitSetAsideForMonth(
  recommendedRate: number,
  plannedExpenses: PlannedExpense[],
  payments: PlannedExpensePayment[],
  recoveries: PlannedExpenseRecovery[],
): SetAsideSplit {
  if (recommendedRate <= EPSILON) {
    return { recovery: 0, funding: 0, byExpense: [] };
  }

  let remaining = recommendedRate;
  let recoveryTotal = 0;
  const byExpense: PlannedExpenseRecoverySlice[] = [];
  const sorted = [...plannedExpenses].sort((a, b) => a.id.localeCompare(b.id));

  for (const expense of sorted) {
    const owed = recoveryOwedForExpense(expense.id, payments, recoveries);
    if (owed <= EPSILON || remaining <= EPSILON) continue;
    const slice = Math.min(remaining, owed);
    byExpense.push({
      plannedExpenseId: expense.id,
      expenseName: expense.name,
      amount: slice,
    });
    recoveryTotal += slice;
    remaining -= slice;
  }

  return {
    recovery: recoveryTotal,
    funding: recommendedRate - recoveryTotal,
    byExpense,
  };
}

export interface PlannedExpenseFundingProgress {
  plannedExpenseId: string;
  name: string;
  plannedAmount: number;
  paidFromPot: number;
  recoveryOwed: number;
  recoveryRepaid: number;
  /** Progress toward funding the plan (pot payments + recoveries), not for rate calculation. */
  fundedProgress: number;
}

export function fundingProgressForExpense(
  expense: PlannedExpense,
  payments: PlannedExpensePayment[],
  recoveries: PlannedExpenseRecovery[],
): PlannedExpenseFundingProgress {
  const expensePayments = payments.filter(p => p.plannedExpenseId === expense.id);
  const paidFromPot = expensePayments.reduce((s, p) => s + p.potDeduction, 0);
  const recoveryOwed = recoveryOwedForExpense(expense.id, payments, recoveries);
  const recoveryRepaid = recoveryRepaidForExpense(expense.id, recoveries);
  const freePaid = expensePayments.reduce((s, p) => s + freeBudgetPortionOfPayment(p), 0);

  return {
    plannedExpenseId: expense.id,
    name: expense.name,
    plannedAmount: expense.amount,
    paidFromPot,
    recoveryOwed,
    recoveryRepaid,
    fundedProgress: paidFromPot + recoveryRepaid + freePaid,
  };
}

/** Turn a lock-in amount into persisted recovery records (recovery slice first). */
export function recoveriesFromLockInAmount(
  amount: number,
  month: Month,
  plannedExpenses: PlannedExpense[],
  payments: PlannedExpensePayment[],
  recoveries: PlannedExpenseRecovery[],
): PlannedExpenseRecovery[] {
  if (amount <= EPSILON) return [];
  const split = splitSetAsideForMonth(amount, plannedExpenses, payments, recoveries);
  return split.byExpense
    .filter(slice => slice.amount > EPSILON)
    .map(slice => ({
      id: crypto.randomUUID(),
      plannedExpenseId: slice.plannedExpenseId,
      month,
      amount: slice.amount,
    }));
}

/** Drop recovery bookings when the user frees locked money (newest recoveries in that month first). */
export function removeRecoveriesForFreeUp(
  amount: number,
  month: Month,
  recoveries: PlannedExpenseRecovery[],
): PlannedExpenseRecovery[] {
  if (amount <= EPSILON) return recoveries;

  const otherMonths = recoveries.filter(r => r.month !== month);
  const thisMonth = recoveries.filter(r => r.month === month);
  let remaining = amount;
  const keptThisMonth: PlannedExpenseRecovery[] = [];

  for (let i = thisMonth.length - 1; i >= 0; i--) {
    const record = thisMonth[i];
    if (remaining <= EPSILON) {
      keptThisMonth.unshift(record);
      continue;
    }
    if (record.amount <= remaining + EPSILON) {
      remaining -= record.amount;
      continue;
    }
    keptThisMonth.unshift({
      ...record,
      amount: record.amount - remaining,
    });
    remaining = 0;
  }

  return [...otherMonths, ...keptThisMonth];
}

/** Backfill recovery ledger from historical lock-ins (one pass per calendar month). */
export function backfillRecoveriesFromLockIns(budget: BudgetState): PlannedExpenseRecovery[] {
  const existing = budget.plannedExpenseRecoveries ?? [];
  if (existing.length > 0) return existing;

  const payments = budget.plannedExpensePayments ?? [];
  const hasFreeBudgetAdvance = payments.some(p => freeBudgetPortionOfPayment(p) > EPSILON);
  if (!hasFreeBudgetAdvance || budget.lockIns.length === 0) return existing;

  const lockedByMonth = new Map<Month, number>();
  for (const lock of budget.lockIns) {
    lockedByMonth.set(lock.month, (lockedByMonth.get(lock.month) ?? 0) + lock.lockedAmount);
  }

  let ledger: PlannedExpenseRecovery[] = [];
  const months = [...lockedByMonth.keys()].sort();
  for (const month of months) {
    const amount = lockedByMonth.get(month) ?? 0;
    const booked = recoveriesFromLockInAmount(
      amount,
      month,
      budget.plannedExpenses,
      payments,
      ledger,
    );
    ledger = [...ledger, ...booked];
  }
  return ledger;
}

export function appendVirtualRecoveries(
  recoveries: PlannedExpenseRecovery[],
  month: Month,
  slices: PlannedExpenseRecoverySlice[],
): PlannedExpenseRecovery[] {
  const next = [...recoveries];
  for (const slice of slices) {
    if (slice.amount <= EPSILON) continue;
    next.push({
      id: `virt-${month}-${slice.plannedExpenseId}`,
      plannedExpenseId: slice.plannedExpenseId,
      month,
      amount: slice.amount,
    });
  }
  return next;
}
