import type { BudgetState, Month, SurplusDestination } from './types';
import { addMonths } from './smoothing';
import type {
  ConfirmedTransaction,
  EnvelopeSurplusDecision,
  ImportSession,
  LeftoverAllocation,
  PlannedExpenseSurplusDecision,
  ReconciliationSummary,
} from './csvImportTypes';
import { buildCarryAdjustments, mergeCarryAdjustments } from './carryForward';

function sumSetAsideTransfers(confirmed: ConfirmedTransaction[]): number {
  const transfers = confirmed.filter(c => c.confirmedCategory === 'set-aside-transfer');
  const debitTotal = transfers
    .filter(c => c.amount < 0)
    .reduce((sum, c) => sum + Math.abs(c.amount), 0);

  if (debitTotal > 0) return debitTotal;

  return transfers
    .filter(c => c.amount > 0)
    .reduce((sum, c) => sum + c.amount, 0);
}

export function computeReconciliationSummary(
  month: Month,
  confirmed: ConfirmedTransaction[],
  budget: BudgetState,
): ReconciliationSummary {
  const incomeTotal = confirmed
    .filter(c => c.confirmedCategory === 'income')
    .reduce((s, c) => s + c.amount, 0);

  const fixedExpenses = budget.fixedExpenses
    .filter(e => !e.isEnvelope)
    .map(e => {
      const actual = confirmed
        .filter(
          c =>
            c.confirmedCategory === 'fixed-expense' && c.linkedExpenseId === e.id,
        )
        .reduce((s, c) => s + Math.abs(c.amount), 0);
      return { id: e.id, name: e.name, expected: e.amount, actual };
    })
    .filter(e => e.actual > 0 || e.expected > 0);

  const envelopes = budget.fixedExpenses.filter(e => e.isEnvelope);
  const envelopeActuals = envelopes.map(e => {
    const actual = confirmed
      .filter(
        c =>
          c.confirmedCategory === 'envelope-spend' && c.linkedEnvelopeId === e.id,
      )
      .reduce((s, c) => s + Math.abs(c.amount), 0);
    return {
      id: e.id,
      name: e.name,
      planned: e.amount,
      actual,
      surplus: Math.max(0, e.amount - actual),
    };
  });

  const potTransferAmount = sumSetAsideTransfers(confirmed);

  const potTransferConfirmed = potTransferAmount > 0;

  const savingsContributions = budget.savingsGoals
    .filter((g): g is Extract<typeof g, { mode: 'target' }> => g.mode === 'target')
    .map(g => {
      const amount = confirmed
        .filter(
          c =>
            c.confirmedCategory === 'savings-contribution' &&
            c.linkedSavingsGoalId === g.id,
        )
        .reduce((s, c) => s + c.amount, 0);
      return { id: g.id, name: g.name, amount };
    })
    .filter(g => g.amount > 0);

  const settlementAmounts = new Map<string, number>();
  for (const c of confirmed) {
    if (c.confirmedCategory !== 'planned-expense-settlement' || !c.linkedExpenseId) {
      continue;
    }
    settlementAmounts.set(
      c.linkedExpenseId,
      (settlementAmounts.get(c.linkedExpenseId) ?? 0) + Math.abs(c.amount),
    );
  }

  const plannedExpensePayments = [...settlementAmounts.entries()]
    .map(([expenseId, actual]) => {
      const expense = budget.plannedExpenses.find(e => e.id === expenseId);
      if (!expense) return null;
      if (expense.targetMonth <= month) return null;
      return {
        id: expense.id,
        name: expense.name,
        planned: expense.amount,
        targetMonth: expense.targetMonth,
        actual,
      };
    })
    .filter((e): e is {
      id: string;
      name: string;
      planned: number;
      targetMonth: Month;
      actual: number;
    } => e !== null);

  const settledExpenses = [...settlementAmounts.entries()]
    .map(([expenseId, currentAmount]) => {
      const expense = budget.plannedExpenses.find(e => e.id === expenseId);
      if (!expense) return null;
      if (expense.targetMonth > month) return null;
      const paidBefore = (budget.plannedExpensePayments ?? [])
        .filter(p => p.plannedExpenseId === expense.id && p.month !== month)
        .reduce((sum, p) => sum + p.amount, 0);
      return {
        id: expense.id,
        name: expense.name,
        planned: expense.amount,
        paidBefore,
        currentAmount,
        actual: paidBefore + currentAmount,
      };
    })
    .filter((e): e is {
      id: string;
      name: string;
      planned: number;
      paidBefore: number;
      currentAmount: number;
      actual: number;
    } => e !== null);

  const freeBudgetSpendTotal = confirmed
    .filter(c => c.confirmedCategory === 'free-budget-spend')
    .reduce((s, c) => s + Math.abs(c.amount), 0);

  const skippedCount = confirmed.filter(c => c.confirmedCategory === 'skip').length;

  const incomeIn = incomeTotal;
  const fixedOut = fixedExpenses.reduce((s, e) => s + e.actual, 0);
  const envelopeOut = envelopeActuals.reduce((s, e) => s + e.actual, 0);
  const freeSpend = freeBudgetSpendTotal;
  const potOut = potTransferAmount;
  const savingsOut = savingsContributions.reduce((s, g) => s + g.amount, 0);
  const plannedPaymentOut = plannedExpensePayments.reduce((s, e) => s + e.actual, 0);
  const settledOut = settledExpenses.reduce((s, e) => s + e.currentAmount, 0);

  const leftoverFreeBudget = Math.max(
    0,
    incomeIn - fixedOut - envelopeOut - freeSpend - potOut - savingsOut - plannedPaymentOut - settledOut,
  );

  return {
    month,
    incomeTotal,
    fixedExpenses,
    envelopeActuals,
    potTransferAmount,
    potTransferConfirmed,
    savingsContributions,
    plannedExpensePayments,
    settledExpenses,
    freeBudgetSpendTotal,
    skippedCount,
    leftoverFreeBudget,
  };
}

function surplusDestination(
  choice: EnvelopeSurplusDecision['choice'],
): SurplusDestination | null {
  if (choice === 'pot') return 'pot';
  if (choice === 'savings') return 'savings';
  if (choice === 'carry') return 'carry';
  return null;
}

export interface ApplyReconciliationInput {
  month: Month;
  confirmed: ConfirmedTransaction[];
  envelopeSurplusDecisions: EnvelopeSurplusDecision[];
  plannedExpenseSurplusDecisions: PlannedExpenseSurplusDecision[];
  leftoverFreeBudget: number;
  leftoverAllocation: LeftoverAllocation;
  leftoverSavingsGoalId?: string;
  potAvailable: number;
}

export function applyReconciliation(
  budget: BudgetState,
  input: ApplyReconciliationInput,
): BudgetState {
  const { month, confirmed } = input;
  const existingLockedForMonth = budget.lockIns
    .filter(l => l.month === month)
    .reduce((sum, l) => sum + l.lockedAmount, 0);
  const existingEnvelopePotForMonth = budget.envelopeActualizations
    .filter(a => a.month === month && a.surplusDestination === 'pot')
    .reduce((sum, a) => {
      const envelope = budget.fixedExpenses.find(e => e.id === a.envelopeId);
      return sum + (envelope ? Math.max(0, envelope.amount - a.actualAmount) : 0);
    }, 0);
  const existingPotDeductionsForMonth =
    (budget.plannedExpensePayments ?? [])
      .filter(p => p.month === month)
      .reduce((sum, p) => sum + p.potDeduction, 0) +
    (budget.plannedExpenseSettlements ?? [])
      .filter(s => s.month === month)
      .reduce((sum, s) => sum + s.potDeduction, 0);
  const next: BudgetState = {
    ...budget,
    lockIns: [...budget.lockIns],
    unplannedExpenses: [...budget.unplannedExpenses],
    envelopeActualizations: [...budget.envelopeActualizations],
    plannedExpensePayments: [...(budget.plannedExpensePayments ?? [])],
    plannedExpenseSettlements: [...budget.plannedExpenseSettlements],
    savingsGoals: [...budget.savingsGoals],
    reconciledMonths: [...(budget.reconciledMonths ?? [])],
    monthCarryAdjustments: [...(budget.monthCarryAdjustments ?? [])],
  };

  // Remove prior reconciliation data for this month (re-import replace).
  next.lockIns = next.lockIns.filter(l => l.month !== month);
  next.unplannedExpenses = next.unplannedExpenses.filter(e => e.month !== month);
  next.envelopeActualizations = next.envelopeActualizations.filter(a => a.month !== month);
  next.plannedExpensePayments = next.plannedExpensePayments.filter(p => p.month !== month);
  next.plannedExpenseSettlements = next.plannedExpenseSettlements.filter(
    s => s.month !== month,
  );
  next.reconciledMonths = (next.reconciledMonths ?? []).filter(m => m !== month);

  const summary = computeReconciliationSummary(month, confirmed, budget);

  // Envelope actualizations
  for (const env of summary.envelopeActuals) {
    if (env.actual === 0 && env.surplus === 0) continue;
    const decision = input.envelopeSurplusDecisions.find(
      d => d.month === month && d.envelopeId === env.id,
    );
    const diff = env.planned - env.actual;
    let dest: SurplusDestination | null = null;
    let savingsGoalId: string | null = null;

    if (diff > 0 && decision) {
      dest = surplusDestination(decision.choice);
      if (decision.choice === 'savings' && decision.savingsGoalId) {
        savingsGoalId = decision.savingsGoalId;
      }
    }

    next.envelopeActualizations.push({
      id: crypto.randomUUID(),
      envelopeId: env.id,
      month,
      actualAmount: env.actual,
      surplusDestination: diff > 0 ? dest : null,
      surplusSavingsGoalId: savingsGoalId,
    });

    if (diff > 0 && decision?.choice === 'savings' && decision.savingsGoalId) {
      next.savingsGoals = next.savingsGoals.map(g =>
        g.id === decision.savingsGoalId && g.mode === 'target'
          ? { ...g, currentAmount: g.currentAmount + diff }
          : g,
      );
    }

    if (diff < 0) {
      next.unplannedExpenses.push({
        id: crypto.randomUUID(),
        name: `${env.name} overspend`,
        amount: -diff,
        month,
        category: 'envelope',
        linkedPlannedExpenseId: null,
      });
    }
  }

  // Free budget spends
  for (const c of confirmed.filter(x => x.confirmedCategory === 'free-budget-spend')) {
    next.unplannedExpenses.push({
      id: crypto.randomUUID(),
      name: c.payee || c.description || 'Free budget spend',
      amount: Math.abs(c.amount),
      month,
      category: 'general',
      linkedPlannedExpenseId: null,
    });
  }

  // Pot transfer → confirmed lock-in
  if (summary.potTransferAmount > 0) {
    next.lockIns.push({
      id: crypto.randomUUID(),
      month,
      lockedAmount: summary.potTransferAmount,
      lockState: 'confirmed',
    });
  }

  // Savings contributions (target mode only)
  for (const s of summary.savingsContributions) {
    next.savingsGoals = next.savingsGoals.map(g =>
      g.id === s.id && g.mode === 'target'
        ? { ...g, currentAmount: g.currentAmount + s.amount }
        : g,
    );
  }

  const potAvailableBeforeReconciledMonthFacts =
    input.potAvailable -
    existingLockedForMonth -
    existingEnvelopePotForMonth +
    existingPotDeductionsForMonth;
  let plannedPaymentPotAvailable = Math.max(
    0,
    potAvailableBeforeReconciledMonthFacts + summary.potTransferAmount,
  );

  // Early planned-expense payments
  for (const p of summary.plannedExpensePayments) {
    const expense = budget.plannedExpenses.find(e => e.id === p.id);
    if (!expense) continue;
    const potDeduction = Math.min(plannedPaymentPotAvailable, p.actual);
    plannedPaymentPotAvailable -= potDeduction;
    const freeBudgetPortion = p.actual - potDeduction;

    next.plannedExpensePayments.push({
      id: crypto.randomUUID(),
      plannedExpenseId: expense.id,
      month,
      amount: p.actual,
      potDeduction,
    });

    if (freeBudgetPortion > 0) {
      next.unplannedExpenses.push({
        id: crypto.randomUUID(),
        name: `${expense.name} early payment`,
        amount: freeBudgetPortion,
        month,
        category: expense.category,
        linkedPlannedExpenseId: expense.id,
      });
    }
  }

  // Planned expense final settlements
  for (const s of summary.settledExpenses) {
    const expense = budget.plannedExpenses.find(e => e.id === s.id);
    if (!expense) continue;
    const remainingPlannedBeforeFinal = Math.max(0, expense.amount - s.paidBefore);
    const diff = expense.amount - s.actual;
    let potDeduction: number;
    if (diff >= 0) {
      const decision = input.plannedExpenseSurplusDecisions.find(
        d => d.plannedExpenseId === expense.id,
      );
      potDeduction = decision?.choice === 'free'
        ? remainingPlannedBeforeFinal
        : s.currentAmount;
      plannedPaymentPotAvailable = Math.max(0, plannedPaymentPotAvailable - potDeduction);
    } else {
      const overflow = -diff;
      const potSurplus = Math.max(0, plannedPaymentPotAvailable - remainingPlannedBeforeFinal);
      const coverage = Math.min(potSurplus, overflow);
      potDeduction = remainingPlannedBeforeFinal + coverage;
      plannedPaymentPotAvailable = Math.max(0, plannedPaymentPotAvailable - potDeduction);
      const unplannedPortion = overflow - coverage;
      if (unplannedPortion > 0) {
        next.unplannedExpenses.push({
          id: crypto.randomUUID(),
          name: `${expense.name} overspend`,
          amount: unplannedPortion,
          month,
          category: expense.category,
          linkedPlannedExpenseId: expense.id,
        });
      }
    }
    next.plannedExpenseSettlements.push({
      id: crypto.randomUUID(),
      plannedExpenseId: expense.id,
      month,
      actualAmount: s.actual,
      potDeduction,
      surplusDestination: diff > 0 ? (input.plannedExpenseSurplusDecisions.find(
        d => d.plannedExpenseId === expense.id,
      )?.choice ?? 'pot') : null,
    });
  }

  // Leftover free budget allocation
  if (input.leftoverFreeBudget > 0) {
    if (input.leftoverAllocation === 'pot') {
      const existing = next.lockIns.find(l => l.month === month);
      if (existing) {
        next.lockIns = next.lockIns.map(l =>
          l.month === month
            ? { ...l, lockedAmount: l.lockedAmount + input.leftoverFreeBudget, lockState: 'confirmed' }
            : l,
        );
      } else {
        next.lockIns.push({
          id: crypto.randomUUID(),
          month,
          lockedAmount: input.leftoverFreeBudget,
          lockState: 'confirmed',
        });
      }
    } else if (input.leftoverAllocation === 'savings' && input.leftoverSavingsGoalId) {
      next.savingsGoals = next.savingsGoals.map(g =>
        g.id === input.leftoverSavingsGoalId && g.mode === 'target'
          ? { ...g, currentAmount: g.currentAmount + input.leftoverFreeBudget }
          : g,
      );
    }
  }

  // Carry-forward adjustments for next month
  const carryEnvelopes = input.envelopeSurplusDecisions.filter(d => d.choice === 'carry');
  const carryFree =
    input.leftoverAllocation === 'carry' && input.leftoverFreeBudget > 0;

  if (carryEnvelopes.length > 0 || carryFree) {
    const incoming = buildCarryAdjustments({
      fromMonth: month,
      envelopeDecisions: carryEnvelopes.map(d => ({
        envelopeId: d.envelopeId,
        surplus: d.surplus,
        choice: 'carry' as const,
      })),
      leftoverFreeBudget: input.leftoverFreeBudget,
      includeLeftoverCarry: carryFree,
    });
    next.monthCarryAdjustments = mergeCarryAdjustments(
      next.monthCarryAdjustments ?? [],
      incoming,
    );
  }

  // Clear carry adjustments FROM this month if re-importing (next month may need update)
  // Already merged above.

  if (!(next.reconciledMonths ?? []).includes(month)) {
    next.reconciledMonths = [...(next.reconciledMonths ?? []), month];
  }

  return next;
}

export function buildImportSession(
  _month: Month,
  confirmed: ConfirmedTransaction[],
  summary: ReconciliationSummary,
  envelopeSurplusDecisions: EnvelopeSurplusDecision[],
  plannedExpenseSurplusDecisions: PlannedExpenseSurplusDecision[],
  leftoverAllocation: LeftoverAllocation,
  leftoverSavingsGoalId?: string,
): ImportSession {
  const envelopeActuals: Record<string, number> = {};
  for (const e of summary.envelopeActuals) {
    envelopeActuals[e.id] = e.actual;
  }
  const savingsContributions: Record<string, number> = {};
  for (const s of summary.savingsContributions) {
    savingsContributions[s.id] = s.amount;
  }
  const plannedExpensePayments: Record<string, number> = {};
  for (const p of summary.plannedExpensePayments) {
    plannedExpensePayments[p.id] = p.actual;
  }
  const settledExpenses: Record<string, number> = {};
  for (const s of summary.settledExpenses) {
    settledExpenses[s.id] = s.actual;
  }

  return {
    importDate: new Date().toISOString(),
    rawRowCount: confirmed.length,
    confirmedRows: confirmed,
    envelopeActuals,
    potTransferAmount: summary.potTransferAmount,
    potTransferConfirmed: summary.potTransferConfirmed,
    savingsContributions,
    plannedExpensePayments,
    settledExpenses,
    plannedExpenseSurplusDecisions,
    leftoverFreeBudget: summary.leftoverFreeBudget,
    leftoverAllocation,
    leftoverSavingsGoalId,
    envelopeSurplusDecisions,
    status: 'complete',
  };
}

export function getDefaultReconcileMonth(currentMonth: Month): Month {
  return addMonths(currentMonth, -1);
}

export function isMonthReconcilable(month: Month, currentMonth: Month): boolean {
  return month < currentMonth;
}
