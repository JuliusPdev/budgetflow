import { availableForMonth, incomeForMonth } from './income';
import { computeDebtClearanceRates, computeSplitSetAsideRates } from './splitRecovery';
import type {
  BudgetState,
  EngineOutput,
  LockStatus,
  Month,
  MonthResult,
  PlannedExpense,
  PlannedExpensePayment,
  PlannedExpenseSettlement,
  UnplannedExpense,
} from './types';

// Treat amounts within 0.1 cent of zero as zero to absorb floating-point drift.
const EPSILON = 0.001;

// Lock-status deadband: differences smaller than this are treated as on-track so
// tiny floating-point drift or rounding does not flip surplus ↔ additional-needed.
const LOCK_STATUS_DEADBAND = 1;

// ─── Month arithmetic ─────────────────────────────────────────────────────────

// "YYYY-MM" strings sort lexicographically in chronological order, so plain
// string comparison (<, >, ===) works correctly for month comparisons.

export function addMonths(month: Month, n: number): Month {
  const [yearStr, monStr] = month.split('-');
  const total = parseInt(yearStr, 10) * 12 + (parseInt(monStr, 10) - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

// ─── Core smoothing algorithm ─────────────────────────────────────────────────

// Returns the optimal set-aside amount for each month in `months`.
// This is a recursive function: when equal distribution fails, it splits at
// the binding constraint and solves each segment independently.
export function smooth(
  months: Month[],
  expenseTotals: Map<Month, number>,
  potCarry: number
): number[] {
  if (months.length === 0) return [];

  const totalExpenses = months.reduce(
    (sum, m) => sum + (expenseTotals.get(m) ?? 0),
    0
  );

  // If the pot already covers all expenses, no additional saving is needed.
  const netNeeded = totalExpenses - potCarry;
  const idealRate = netNeeded <= 0 ? 0 : netNeeded / months.length;

  // Step 4: Feasibility check — simulate pot month by month.
  // Contribution is added BEFORE the expense is paid (target month is a saving month).
  // The pot can go negative (savings loan) in months with no expense — only reject
  // when an expense month results in a negative pot (can't cover the expense).
  let pot = potCarry;
  let feasible = true;
  for (const month of months) {
    pot += idealRate;
    const monthExpense = expenseTotals.get(month) ?? 0;
    pot -= monthExpense;
    if (monthExpense > EPSILON && pot < -EPSILON) {
      feasible = false;
      break;
    }
  }

  if (feasible) {
    return months.map(() => idealRate);
  }

  // Step 5: Find the binding constraint — the expense deadline that requires the
  // highest rate. Only expense months can bind (non-expense months allow negative pot).
  let bindingIndex = 0;
  let bindingRate = 0;
  let cumulative = 0;

  for (let i = 0; i < months.length; i++) {
    const monthExpense = expenseTotals.get(months[i]) ?? 0;
    cumulative += monthExpense;
    if (monthExpense <= EPSILON) continue;
    const rate = (cumulative - potCarry) / (i + 1);
    if (rate > bindingRate) {
      bindingRate = rate;
      bindingIndex = i;
    }
  }

  // Step 6: Segment 1 — all months up to and including the binding deadline,
  // set at the binding rate.
  const segment1 = Array<number>(bindingIndex + 1).fill(bindingRate);

  // Calculate pot balance at the end of segment 1.
  let potAfterSegment1 = potCarry;
  for (let i = 0; i <= bindingIndex; i++) {
    potAfterSegment1 += bindingRate;
    potAfterSegment1 -= expenseTotals.get(months[i]) ?? 0;
  }

  // Step 7: Segment 2 — solve the remaining months independently.
  // This recursion terminates because each call processes a strictly shorter array.
  const segment2 = smooth(
    months.slice(bindingIndex + 1),
    expenseTotals,
    potAfterSegment1
  );

  return [...segment1, ...segment2];
}

// ─── Lock status ──────────────────────────────────────────────────────────────

function computeLockStatus(
  isCurrentMonth: boolean,
  lockedAmount: number,
  recommended: number
): LockStatus {
  if (!isCurrentMonth || lockedAmount <= 0) {
    return { kind: 'unlocked' };
  }
  const diff = recommended - lockedAmount;
  if (Math.abs(diff) <= LOCK_STATUS_DEADBAND) {
    return { kind: 'on-track', lockedAmount };
  }
  if (diff > 0) {
    return { kind: 'additional-needed', lockedAmount, additionalNeeded: diff };
  }
  return { kind: 'surplus', lockedAmount, surplus: -diff };
}

// ─── Main engine entry point ──────────────────────────────────────────────────

export function runEngine(state: BudgetState, currentMonth: Month): EngineOutput {
  const {
    fixedExpenses,
    plannedExpenses,
    savingsGoals,
    lockIns,
    unplannedExpenses            = [],
    envelopeActualizations       = [],
    plannedExpensePayments       = [],
    plannedExpenseSettlements    = [],
    monthCarryAdjustments        = [],
  } = state;

  // A = monthly available after subtracting all predictable fixed outflows.
  const fixedTotal = fixedExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Precompute: for each month that has envelope actualizations with surplusDestination = 'free',
  // how much extra free budget should be credited back. When an envelope was budgeted at €400
  // but the user only spent €300 and chose "add to free budget", the engine adds back €100.
  const freeSurplusByMonth = new Map<Month, number>();
  for (const act of envelopeActualizations) {
    if (act.surplusDestination !== 'free') continue;
    const envelope = fixedExpenses.find(e => e.id === act.envelopeId);
    if (!envelope) continue;
    const surplus = envelope.amount - act.actualAmount;
    if (surplus > 0) {
      freeSurplusByMonth.set(act.month, (freeSurplusByMonth.get(act.month) ?? 0) + surplus);
    }
  }

  // Envelope surplus directed to pot: tracked here instead of via LockInRecord so that
  // freeBudget is not affected. The envelope budget was already deducted from income when
  // computing A, so the unspent amount flows into the pot without coming from free budget.
  const envelopePotByMonth = new Map<Month, number>();
  for (const act of envelopeActualizations) {
    if (act.surplusDestination !== 'pot') continue;
    const envelope = fixedExpenses.find(e => e.id === act.envelopeId);
    if (!envelope) continue;
    const surplus = envelope.amount - act.actualAmount;
    if (surplus > 0) {
      envelopePotByMonth.set(act.month, (envelopePotByMonth.get(act.month) ?? 0) + surplus);
    }
  }

  // Index settlements by plannedExpenseId for fast lookup.
  const settlementMap = new Map<string, PlannedExpenseSettlement>();
  for (const s of plannedExpenseSettlements) {
    settlementMap.set(s.plannedExpenseId, s);
  }

  const paymentsByExpense = new Map<string, PlannedExpensePayment[]>();
  for (const payment of plannedExpensePayments) {
    const existing = paymentsByExpense.get(payment.plannedExpenseId) ?? [];
    existing.push(payment);
    paymentsByExpense.set(payment.plannedExpenseId, existing);
  }

  // When a settlement frees up surplus (surplusDestination = 'free'), the engine
  // credits the freed amount back to freeBudget for that month — same mechanism as
  // envelope free surplus.
  const settlementFreeSurplusByMonth = new Map<Month, number>();
  for (const s of plannedExpenseSettlements) {
    if (s.surplusDestination !== 'free') continue;
    const expense = plannedExpenses.find(e => e.id === s.plannedExpenseId);
    if (!expense) continue;
    const freed = expense.amount - s.actualAmount;
    if (freed > 0) {
      settlementFreeSurplusByMonth.set(
        s.month,
        (settlementFreeSurplusByMonth.get(s.month) ?? 0) + freed
      );
    }
  }

  let modeBSavingsTotal = 0;
  for (const g of savingsGoals) {
    if (g.mode === 'monthly') modeBSavingsTotal += g.monthlyAmount;
  }

  const carryBoostByMonth = new Map<Month, number>();
  for (const adj of monthCarryAdjustments) {
    carryBoostByMonth.set(adj.month, adj.freeBudgetBoost);
  }

  // Three parallel maps:
  // expenseItems              — PlannedExpense objects grouped by month (for display)
  // expenseTotals             — pot simulation totals: settled expenses use potDeduction,
  //                             unsettled use expense.amount
  // regularAlgorithmExpenses  — passed to the first smooth() pass; current month participates
  // deferredAlgorithmExpenses — expenses with startFromMonth > currentMonth; excluded from
  //                             the first pass so this month's locked rate is not affected
  const expenseItems              = new Map<Month, PlannedExpense[]>();
  const expenseTotals             = new Map<Month, number>();
  const physicalPotDeductions     = new Map<Month, number>();
  const regularAlgorithmExpenses  = new Map<Month, number>();
  const deferredAlgorithmExpenses = new Map<Month, number>();

  for (const payment of plannedExpensePayments) {
    physicalPotDeductions.set(
      payment.month,
      (physicalPotDeductions.get(payment.month) ?? 0) + payment.potDeduction,
    );
  }

  for (const settlement of plannedExpenseSettlements) {
    physicalPotDeductions.set(
      settlement.month,
      (physicalPotDeductions.get(settlement.month) ?? 0) + settlement.potDeduction,
    );
  }

  for (const expense of plannedExpenses) {
    // Display: always included
    const existing = expenseItems.get(expense.targetMonth) ?? [];
    existing.push(expense);
    expenseItems.set(expense.targetMonth, existing);

    const paidBeforeFinalSettlement = (paymentsByExpense.get(expense.id) ?? [])
      .reduce((sum, payment) => sum + payment.amount, 0);
    const remainingAmount = Math.max(0, expense.amount - paidBeforeFinalSettlement);

    const settlement = settlementMap.get(expense.id);

    // Algorithm: only unsettled expenses.
    // Deferred expenses (startFromMonth > currentMonth) go into a separate map so the
    // first smooth() pass — which determines the current month's rate — ignores them.
    // They are merged back in for the second pass (future months only).
    if (!settlement && remainingAmount > 0) {
      const forecastMonth = expense.targetMonth < currentMonth ? currentMonth : expense.targetMonth;
      expenseTotals.set(
        forecastMonth,
        (expenseTotals.get(forecastMonth) ?? 0) + remainingAmount
      );
      const isDeferred = expense.startFromMonth != null && expense.startFromMonth > currentMonth;
      const targetMap = isDeferred ? deferredAlgorithmExpenses : regularAlgorithmExpenses;
      targetMap.set(
        forecastMonth,
        (targetMap.get(forecastMonth) ?? 0) + remainingAmount
      );
    }
  }

  // Mode A goals are treated as a lump-sum expense at their target date.
  // Goals are never deferred — they always contribute from the current month onward.
  for (const goal of savingsGoals) {
    if (goal.mode === 'target') {
      const remaining = goal.targetAmount - goal.currentAmount;
      if (remaining > 0 && goal.targetDate >= currentMonth) {
        expenseTotals.set(
          goal.targetDate,
          (expenseTotals.get(goal.targetDate) ?? 0) + remaining
        );
        regularAlgorithmExpenses.set(
          goal.targetDate,
          (regularAlgorithmExpenses.get(goal.targetDate) ?? 0) + remaining
        );
      }
    }
  }

  // Pot carry-forward: locked money minus actual pot deductions.
  // Includes current-month deductions (early payments, settlements) so smooth()
  // correctly sees the money that already left the pot this month.
  const pastLocked = lockIns
    .filter(l => l.month < currentMonth)
    .reduce((sum, l) => sum + l.lockedAmount, 0);

  const pastPhysicalDeductions = [...physicalPotDeductions.entries()]
    .filter(([m]) => m < currentMonth)
    .reduce((sum, [, amt]) => sum + amt, 0);

  const pastEnvelopePot = [...envelopePotByMonth.entries()]
    .filter(([m]) => m < currentMonth)
    .reduce((sum, [, amt]) => sum + amt, 0);

  const currentMonthDeductions = physicalPotDeductions.get(currentMonth) ?? 0;

  const potCarry = pastLocked - pastPhysicalDeductions + pastEnvelopePot - currentMonthDeductions;

  // ── Past months (read-only historical display) ─────────────────────────────
  // Show 3 months of history so the user can scroll left to see what happened.
  // These months use actual locked amounts from lockIns, not algorithm recommendations.
  const PAST_MONTHS_SHOWN = 3;
  const pastDisplayMonths: Month[] = [];
  for (let i = PAST_MONTHS_SHOWN; i >= 1; i--) {
    pastDisplayMonths.push(addMonths(currentMonth, -i));
  }

  // Pot balance at the start of the 3-month window. This is physical money:
  // locked contributions plus envelope surplus, minus factual pot deductions.
  const displayStart = addMonths(currentMonth, -PAST_MONTHS_SHOWN);
  const potAtDisplayStart =
    lockIns.filter(l => l.month < displayStart).reduce((sum, l) => sum + l.lockedAmount, 0) +
    [...envelopePotByMonth.entries()].filter(([m]) => m < displayStart).reduce((sum, [, v]) => sum + v, 0) -
    [...physicalPotDeductions.entries()].filter(([m]) => m < displayStart).reduce((sum, [, v]) => sum + v, 0);

  let potPast = potAtDisplayStart;
  const pastMonthResults: MonthResult[] = pastDisplayMonths.map(month => {
    const items          = expenseItems.get(month) ?? [];
    const locked         = lockIns.find(l => l.month === month)?.lockedAmount ?? 0;
    const expense        = physicalPotDeductions.get(month) ?? 0;
    const monthUnplanned = unplannedExpenses.filter(e => e.month === month);
    const unplannedTotal = monthUnplanned.reduce((s, e) => s + e.amount, 0);
    const incomeCarryover = carryBoostByMonth.get(month) ?? 0;
    potPast += locked;
    potPast += envelopePotByMonth.get(month) ?? 0;
    potPast -= expense;
    const monthIncome = incomeForMonth(month, state);
    const monthAvailable = availableForMonth(month, state, fixedTotal, modeBSavingsTotal);
    return {
      month,
      monthlyIncome: monthIncome,
      availableAfterFixed: monthAvailable,
      plannedExpenses:     items,
      plannedTotal:        items.reduce((s, e) => s + e.amount, 0),
      unplannedExpenses:   monthUnplanned,
      unplannedTotal,
      incomeCarryover,
      setAsideRecommended: 0,
      setAsideRecovery: 0,
      setAsideFunding: 0,
      setAsideLocked:      locked,
      freeBudget:          monthAvailable - locked - unplannedTotal
                             + (freeSurplusByMonth.get(month) ?? 0)
                             + (settlementFreeSurplusByMonth.get(month) ?? 0)
                             + incomeCarryover,
      potBeforeExpenses:   potPast,
      potDeduction:        0,
      potAfter:            potPast,
      potActual:           potPast,
      lockStatus:          { kind: 'unlocked' },
    };
  });

  // ── Algorithm window: current month forward ────────────────────────────────
  // The minimum fallback only applies when there are no future expenses —
  // passing extra empty months into smooth() would inflate the denominator and
  // lower the rate, producing a wrong answer.
  // Use algorithmExpenses (not expenseTotals) so settled expenses don't extend
  // the window unnecessarily.
  const futureExpenseMonths = [
    ...new Set([...regularAlgorithmExpenses.keys(), ...deferredAlgorithmExpenses.keys()])
  ].filter(m => m >= currentMonth);
  const lastExpenseMonth =
    futureExpenseMonths.length > 0 ? [...futureExpenseMonths].sort().at(-1)! : null;

  let lastTargetAmongOpenPlans: Month | null = null;
  for (const expense of plannedExpenses) {
    if (settlementMap.get(expense.id)) continue;
    const horizonMonth = expense.targetMonth < currentMonth ? currentMonth : expense.targetMonth;
    if (lastTargetAmongOpenPlans == null || horizonMonth > lastTargetAmongOpenPlans) {
      lastTargetAmongOpenPlans = horizonMonth;
    }
  }

  const minDisplayEnd = addMonths(currentMonth, 11); // at least 11 future months
  let algorithmEnd = lastExpenseMonth;
  if (algorithmEnd == null && potCarry < -EPSILON && lastTargetAmongOpenPlans != null) {
    algorithmEnd = lastTargetAmongOpenPlans;
  }
  if (algorithmEnd == null) {
    algorithmEnd = minDisplayEnd;
  }

  const algorithmMonths: Month[] = [];
  let cursor = currentMonth;
  while (cursor <= algorithmEnd) {
    algorithmMonths.push(cursor);
    cursor = addMonths(cursor, 1);
  }

  // Extend planning window backward to the earliest recovery payment month so
  // binding-constraint denominators stay stable when the calendar advances.
  let planningStart = currentMonth;
  for (const expense of plannedExpenses) {
    if (settlementMap.get(expense.id)) continue;
    const totalPaid = (paymentsByExpense.get(expense.id) ?? [])
      .reduce((sum, payment) => sum + payment.amount, 0);
    if (totalPaid + EPSILON < expense.amount) continue;
    for (const payment of paymentsByExpense.get(expense.id) ?? []) {
      if (payment.month < planningStart) {
        planningStart = payment.month;
      }
    }
  }

  const planningMonths: Month[] = [];
  cursor = planningStart;
  while (cursor <= algorithmEnd) {
    planningMonths.push(cursor);
    cursor = addMonths(cursor, 1);
  }

  const currentLocked       = lockIns.find(l => l.month === currentMonth)?.lockedAmount ?? 0;
  const currentEnvelopePot  = envelopePotByMonth.get(currentMonth) ?? 0;
  const currentActualContribution = currentLocked + currentEnvelopePot;
  const potActualNow = potCarry + currentActualContribution;

  const lockByMonth = new Map<Month, number>();
  for (const lock of lockIns) {
    lockByMonth.set(lock.month, lock.lockedAmount);
  }

  const deductionByMonth = new Map<Month, number>(physicalPotDeductions);

  // Split funding (remaining expenses, past carry only) from recovery (savings dip repaid
  // over each fully-paid expense's original target month). Feasibility floor uses potActualNow.
  const splitRates = computeSplitSetAsideRates(
    planningMonths,
    algorithmMonths,
    currentMonth,
    regularAlgorithmExpenses,
    deferredAlgorithmExpenses,
    expenseTotals,
    potCarry,
    plannedExpenses,
    paymentsByExpense,
    settlementMap,
    currentActualContribution,
    lockByMonth,
    deductionByMonth,
    smooth,
  );

  const rateMap = new Map<Month, number>();
  const fundingMap = new Map<Month, number>();
  const recoveryMap = new Map<Month, number>();
  algorithmMonths.forEach((month, index) => {
    const envelopePot = month === currentMonth ? currentEnvelopePot : 0;
    const total = Math.max(0, splitRates.total[index] - envelopePot);
    rateMap.set(month, total);
    fundingMap.set(month, splitRates.funding[index]);
    recoveryMap.set(month, splitRates.recovery[index]);
  });

  // Display window: always at least 11 future months so the grid is never sparse.
  // Months beyond the last expense get rate = 0 (nothing left to save for).
  const displayEnd = algorithmEnd > minDisplayEnd ? algorithmEnd : minDisplayEnd;
  const allMonths: Month[] = [...algorithmMonths];
  cursor = addMonths(algorithmEnd, 1);
  while (cursor <= displayEnd) {
    allMonths.push(cursor);
    cursor = addMonths(cursor, 1);
  }

  // After the last expense, keep recommending set-aside until the forecast pot reaches zero.
  const ratesByMonth = new Map<Month, number>();
  for (const month of allMonths) {
    ratesByMonth.set(month, rateMap.get(month) ?? 0);
  }
  const clearanceRates = computeDebtClearanceRates(
    allMonths,
    potCarry,
    ratesByMonth,
    expenseTotals,
  );
  for (const [month, clearance] of clearanceRates) {
    const existing = rateMap.get(month) ?? 0;
    rateMap.set(month, existing + clearance);
    fundingMap.set(month, (fundingMap.get(month) ?? 0) + clearance);
  }

  // Build the result array for current month and forward.
  let pot = potCarry;

  const futureMonthResults: MonthResult[] = allMonths.map((month) => {
    const rate = rateMap.get(month) ?? 0;
    const items = expenseItems.get(month) ?? [];
    const plannedTotal = items.reduce((sum, e) => sum + e.amount, 0);
    const algorithmExpenseTotal = expenseTotals.get(month) ?? 0;
    const isCurrentMonth = month === currentMonth;
    const locked = isCurrentMonth ? currentLocked : 0;

    const monthUnplanned  = isCurrentMonth
      ? unplannedExpenses.filter(e => e.month === currentMonth)
      : [] as UnplannedExpense[];
    const unplannedTotal  = monthUnplanned.reduce((s, e) => s + e.amount, 0);
    const incomeCarryover = carryBoostByMonth.get(month) ?? 0;

    const setAsideRecovery = recoveryMap.get(month) ?? 0;
    const setAsideFunding = fundingMap.get(month) ?? 0;

    // Full rate enters the pot; expenses leave it. Pot can go negative (savings loan).
    pot += rate;

    let potBeforeExpensesDisplay: number;
    let potAfterDisplay: number;
    if (isCurrentMonth) {
      const effectiveContribution = Math.max(currentActualContribution, rate);
      potBeforeExpensesDisplay = potCarry + effectiveContribution;
      potAfterDisplay = potCarry + effectiveContribution - algorithmExpenseTotal;
      pot = potAfterDisplay;
    } else {
      potBeforeExpensesDisplay = pot;
      pot -= algorithmExpenseTotal;
      potAfterDisplay = pot;
    }

    // Free budget is anchored to locked reality for the current month.
    // For future months, it reflects the recommended set-aside.
    const effectiveSetAside = isCurrentMonth ? Math.max(currentLocked, rate) : rate;
    const monthIncome = incomeForMonth(month, state);
    const monthAvailable = availableForMonth(month, state, fixedTotal, modeBSavingsTotal);
    const freeBudget = monthAvailable - effectiveSetAside - unplannedTotal
      + (freeSurplusByMonth.get(month) ?? 0)
      + (settlementFreeSurplusByMonth.get(month) ?? 0)
      + incomeCarryover;

    return {
      month,
      monthlyIncome: monthIncome,
      availableAfterFixed: monthAvailable,
      plannedExpenses: items,
      plannedTotal,
      unplannedExpenses: monthUnplanned,
      unplannedTotal,
      incomeCarryover,
      setAsideRecommended: rate,
      setAsideRecovery,
      setAsideFunding,
      setAsideLocked: locked,
      freeBudget,
      potBeforeExpenses: potBeforeExpensesDisplay,
      potDeduction: algorithmExpenseTotal,
      potAfter: potAfterDisplay,
      potActual: isCurrentMonth ? potActualNow : 0,
      lockStatus: computeLockStatus(isCurrentMonth, locked, rate),
    };
  });

  const currentAvailable = availableForMonth(currentMonth, state, fixedTotal, modeBSavingsTotal);

  return {
    availablePerMonth: currentAvailable,
    fixedTotal,
    modeBSavingsTotal,
    months: [...pastMonthResults, ...futureMonthResults],
  };
}
