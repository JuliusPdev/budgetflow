import { useState, useMemo, useEffect } from 'react';
import { runEngine } from '../engine/smoothing';
import { loadState, saveState } from '../utils/storage';
import type {
  AppState,
  BudgetState,
  EnvelopeActualization,
  EngineOutput,
  FixedExpense,
  Month,
  PlannedExpense,
  PlannedExpensePayment,
  PlannedExpenseSettlement,
  SavingsGoal,
  SurplusDestination,
  UnplannedExpense,
} from '../engine/types';
import { buildCarryAdjustments, mergeCarryAdjustments } from '../engine/carryForward';

// ─── Types ────────────────────────────────────────────────────────────────────

// Omit<SavingsGoal, 'id'> doesn't distribute over the union correctly in TypeScript,
// so we define the "new goal" shape explicitly. The hook generates the id internally.
type NewSavingsGoal =
  | { name: string; mode: 'target'; targetAmount: number; currentAmount: number; targetDate: Month }
  | { name: string; mode: 'monthly'; monthlyAmount: number };

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_BUDGET: BudgetState = {
  income: 0,
  incomeByMonth: {},
  additionalIncomeByMonth: {},
  fixedExpenses: [],
  plannedExpenses: [],
  savingsGoals: [],
  lockIns: [],
  unplannedExpenses: [],
  envelopeActualizations: [],
  plannedExpensePayments: [],
  plannedExpenseRecoveries: [],
  plannedExpenseSettlements: [],
  reconciledMonths: [],
  monthCarryAdjustments: [],
};

const INITIAL_STATE: AppState = {
  budget: EMPTY_BUDGET,
  previousSnapshot: null,
};

// ─── Migration ────────────────────────────────────────────────────────────────

// Ensures any stored data created before `lockState` was added to LockInRecord
// gets a default of 'planned' so the TypeScript type is always satisfied.
function migrateBudget(b: BudgetState): BudgetState {
  const additionalIncomeByMonth = { ...(b.additionalIncomeByMonth ?? {}) };
  const incomeByMonth = { ...(b.incomeByMonth ?? {}) };

  // Older planner saves stored a full override in incomeByMonth. Convert bonuses to additional income.
  for (const [month, value] of Object.entries(incomeByMonth)) {
    if (value == null) continue;
    if (additionalIncomeByMonth[month] != null) continue;
    if (value === b.income) {
      delete incomeByMonth[month];
      continue;
    }
    if (value > b.income) {
      additionalIncomeByMonth[month] = value - b.income;
      delete incomeByMonth[month];
    }
  }

  return {
    ...b,
    incomeByMonth,
    additionalIncomeByMonth,
    lockIns: b.lockIns.map(l => ({ ...l, lockState: l.lockState ?? ('planned' as const) })),
    plannedExpensePayments: b.plannedExpensePayments ?? [],
    plannedExpenseRecoveries: b.plannedExpenseRecoveries ?? [],
    reconciledMonths: b.reconciledMonths ?? [],
    monthCarryAdjustments: b.monthCarryAdjustments ?? [],
  };
}

function migrateState(s: AppState): AppState {
  return {
    budget: migrateBudget(s.budget),
    previousSnapshot: s.previousSnapshot ? migrateBudget(s.previousSnapshot) : null,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBudgetState(currentMonth: Month) {
  const [appState, setAppState] = useState<AppState>(() => {
    const loaded = loadState();
    return loaded ? migrateState(loaded) : INITIAL_STATE;
  });

  // Re-run the engine whenever the budget data changes.
  // useMemo means it only recalculates when appState.budget actually changes,
  // not on every render.
  const engine: EngineOutput = useMemo(
    () => runEngine(appState.budget, currentMonth),
    [appState.budget, currentMonth]
  );

  // Keep localStorage in sync after every state change.
  useEffect(() => {
    saveState(appState);
  }, [appState]);

  // Every budget mutation goes through `update`. Before applying the change,
  // it saves the current budget as the undo snapshot automatically.
  // Think of it like a "track changes" wrapper around every action.
  function update(fn: (prev: BudgetState) => BudgetState): void {
    setAppState(prev => ({
      budget: fn(prev.budget),
      previousSnapshot: prev.budget,
    }));
  }

  // ─── Income ─────────────────────────────────────────────────────────────────

  function setIncome(amount: number): void {
    update(b => ({ ...b, income: amount }));
  }

  function setAdditionalIncomeForMonth(month: Month, amount: number): void {
    update(b => ({
      ...b,
      additionalIncomeByMonth: {
        ...(b.additionalIncomeByMonth ?? {}),
        [month]: amount,
      },
    }));
  }

  function clearAdditionalIncomeForMonth(month: Month): void {
    update(b => {
      const next = { ...(b.additionalIncomeByMonth ?? {}) };
      delete next[month];
      return { ...b, additionalIncomeByMonth: next };
    });
  }

  // ─── Fixed expenses ──────────────────────────────────────────────────────────

  // Callers supply name, amount, category, and isEnvelope. actualAmount starts
  // as null — it gets filled in when the user actualizes the month at month end.
  function addFixedExpense(expense: Omit<FixedExpense, 'id' | 'actualAmount'>): void {
    update(b => ({
      ...b,
      fixedExpenses: [
        ...b.fixedExpenses,
        { ...expense, id: crypto.randomUUID(), actualAmount: null },
      ],
    }));
  }

  function updateFixedExpense(id: string, changes: Partial<Omit<FixedExpense, 'id'>>): void {
    update(b => ({
      ...b,
      fixedExpenses: b.fixedExpenses.map(e => e.id === id ? { ...e, ...changes } : e),
    }));
  }

  function removeFixedExpense(id: string): void {
    update(b => ({
      ...b,
      fixedExpenses: b.fixedExpenses.filter(e => e.id !== id),
    }));
  }

  // ─── Planned irregular expenses ───────────────────────────────────────────────

  function addPlannedExpense(expense: Omit<PlannedExpense, 'id'>): void {
    update(b => ({
      ...b,
      plannedExpenses: [...b.plannedExpenses, { ...expense, id: crypto.randomUUID() }],
    }));
  }

  function updatePlannedExpense(
    id: string,
    changes: Partial<Omit<PlannedExpense, 'id'>> & { resetStartFromMonth?: boolean },
  ): void {
    update(b => ({
      ...b,
      plannedExpenses: b.plannedExpenses.map(e => {
        if (e.id !== id) return e;
        const { resetStartFromMonth, ...patch } = changes;
        const next: PlannedExpense = { ...e, ...patch };
        if (resetStartFromMonth) delete next.startFromMonth;
        return next;
      }),
    }));
  }

  function removePlannedExpense(id: string): void {
    update(b => ({
      ...b,
      plannedExpenses: b.plannedExpenses.filter(e => e.id !== id),
    }));
  }

  // ─── Savings goals ────────────────────────────────────────────────────────────

  function addSavingsGoal(goal: NewSavingsGoal): void {
    // Type assertion is safe: we're constructing a SavingsGoal from all its
    // required fields — the only thing missing was the id, which we add here.
    const newGoal = { ...goal, id: crypto.randomUUID() } as SavingsGoal;
    update(b => ({
      ...b,
      savingsGoals: [...b.savingsGoals, newGoal],
    }));
  }

  // Accepts the full updated goal because switching mode (target ↔ monthly)
  // changes which fields exist — a partial update can't express that cleanly.
  function updateSavingsGoal(updated: SavingsGoal): void {
    update(b => ({
      ...b,
      savingsGoals: b.savingsGoals.map(g => g.id === updated.id ? updated : g),
    }));
  }

  function removeSavingsGoal(id: string): void {
    update(b => ({
      ...b,
      savingsGoals: b.savingsGoals.filter(g => g.id !== id),
    }));
  }

  // ─── Lock-in and free-up ─────────────────────────────────────────────────────

  function lockIn(amount: number): void {
    update(b => {
      const alreadyExists = b.lockIns.some(l => l.month === currentMonth);
      if (alreadyExists) {
        return {
          ...b,
          lockIns: b.lockIns.map(l =>
            l.month === currentMonth
              ? { ...l, lockedAmount: l.lockedAmount + amount }
              : l
          ),
        };
      }
      return {
        ...b,
        lockIns: [
          ...b.lockIns,
          { id: crypto.randomUUID(), month: currentMonth, lockedAmount: amount, lockState: 'planned' as const },
        ],
      };
    });
  }

  function freeUp(amount: number): void {
    update(b => ({
      ...b,
      lockIns: b.lockIns.map(l =>
        l.month === currentMonth
          ? { ...l, lockedAmount: Math.max(0, l.lockedAmount - amount) }
          : l
      ),
    }));
  }

  // ─── Envelope actualization ───────────────────────────────────────────────────

  // Records what was actually spent on a budget envelope this month and handles
  // all three outcomes atomically in one undo snapshot:
  //   exact match  → just records the actualization
  //   underspent   → records actualization + applies surplus (pot / savings / free)
  //   overspent    → records actualization + creates an UnplannedExpense for the overage
  function actualizeEnvelope(
    envelopeId: string,
    month: Month,
    actualAmount: number,
    surplusDestination: SurplusDestination | null,
    surplusSavingsGoalId: string | null,
  ): void {
    update(b => {
      const envelope = b.fixedExpenses.find(e => e.id === envelopeId);
      if (!envelope) return b;

      const diff = envelope.amount - actualAmount; // positive = underspent, negative = overspent

      const actualization: EnvelopeActualization = {
        id:                  crypto.randomUUID(),
        envelopeId,
        month,
        actualAmount,
        surplusDestination:  diff > 0 ? surplusDestination : null,
        surplusSavingsGoalId: diff > 0 && surplusDestination === 'savings' ? surplusSavingsGoalId : null,
      };

      let next: BudgetState = {
        ...b,
        envelopeActualizations: [...b.envelopeActualizations, actualization],
      };

      // Underspent + "add to pot": no lock-in needed.
      // The surplus is tracked via the EnvelopeActualization record (surplusDestination = 'pot').
      // The engine reads that record directly when computing pot balances — so the pot increases
      // without touching lockIns, which means freeBudget is not affected.
      // (The envelope budget was already deducted from income to compute A, so there's nothing
      // extra to move — the money was never in free budget to begin with.)

      // Underspent + "add to savings": increase the chosen goal's currentAmount.
      if (diff > 0 && surplusDestination === 'savings' && surplusSavingsGoalId) {
        next = {
          ...next,
          savingsGoals: next.savingsGoals.map(g =>
            g.id === surplusSavingsGoalId && g.mode === 'target'
              ? { ...g, currentAmount: g.currentAmount + diff }
              : g
          ),
        };
      }

      // Underspent + "carry to next month": boost envelope budget next month.
      if (diff > 0 && surplusDestination === 'carry') {
        const incoming = buildCarryAdjustments({
          fromMonth: month,
          envelopeDecisions: [{ envelopeId, surplus: diff, choice: 'carry' }],
          leftoverFreeBudget: 0,
          includeLeftoverCarry: false,
        });
        next = {
          ...next,
          monthCarryAdjustments: mergeCarryAdjustments(
            next.monthCarryAdjustments ?? [],
            incoming,
          ),
        };
      }

      // Overspent: the amount over budget becomes an unplanned expense (hits free budget directly).
      if (diff < 0) {
        const overage = -diff;
        next = {
          ...next,
          unplannedExpenses: [
            ...next.unplannedExpenses,
            {
              id:                    crypto.randomUUID(),
              name:                  `${envelope.name} overspend`,
              amount:                overage,
              month,
              category:              envelope.category,
              linkedPlannedExpenseId: null,
            },
          ],
        };
      }

      return next;
    });
  }

  // ─── Planned expense settlement ───────────────────────────────────────────────

  // Called when the user confirms what a planned expense actually cost.
  // potAvailable = the physical pot balance before the planned expense is paid.
  function settleExpense(
    plannedExpenseId: string,
    actualAmount: number,
    surplusDestination: 'pot' | 'free' | null,
    potAvailable: number,
  ): void {
    update(b => {
      const expense = b.plannedExpenses.find(e => e.id === plannedExpenseId);
      if (!expense) return b;

      const diff = expense.amount - actualAmount; // positive = underspent, negative = overspent

      let potDeduction: number;
      let next = b;

      if (diff >= 0) {
        // Exact match or underspent.
        // "Free up" drains the full planned amount so the engine can credit the
        // freed portion back to freeBudget via settlementFreeSurplusByMonth.
        // "Keep in pot" only drains the actual amount; the surplus stays in the pot.
        potDeduction = surplusDestination === 'free' ? expense.amount : actualAmount;
      } else {
        // Overspent: planned amount leaves the pot first.
        // Any pot surplus (money in the pot beyond the planned amount) absorbs the overflow.
        // Whatever pot surplus can't cover becomes an unplanned expense hitting free budget.
        const overflow = -diff;
        const potSurplus = Math.max(0, potAvailable - expense.amount);
        const coverage = Math.min(potSurplus, overflow);
        potDeduction = expense.amount + coverage;

        const unplannedPortion = overflow - coverage;
        if (unplannedPortion > 0) {
          next = {
            ...next,
            unplannedExpenses: [
              ...next.unplannedExpenses,
              {
                id:                     crypto.randomUUID(),
                name:                   `${expense.name} overspend`,
                amount:                 unplannedPortion,
                month:                  expense.targetMonth,
                category:               expense.category,
                linkedPlannedExpenseId: plannedExpenseId,
              },
            ],
          };
        }
      }

      const settlement: PlannedExpenseSettlement = {
        id:                   crypto.randomUUID(),
        plannedExpenseId,
        month:                expense.targetMonth,
        actualAmount,
        potDeduction,
        surplusDestination:   diff > 0 ? surplusDestination : null,
      };

      return {
        ...next,
        plannedExpenseSettlements: [
          ...(next.plannedExpenseSettlements ?? []),
          settlement,
        ],
      };
    });
  }

  function addPlannedExpensePayment(payment: Omit<PlannedExpensePayment, 'id'>): void {
    update(b => ({
      ...b,
      plannedExpensePayments: [
        ...(b.plannedExpensePayments ?? []),
        { ...payment, id: crypto.randomUUID() },
      ],
    }));
  }

  function recordEarlyPayment(
    plannedExpenseId: string,
    paymentMonth: Month,
    amount: number,
    overflowToFreeBudget?: number,
  ): void {
    update(b => {
      const expense = b.plannedExpenses.find(e => e.id === plannedExpenseId);
      if (!expense || amount <= 0) return b;

      const potDeduction = overflowToFreeBudget && overflowToFreeBudget > 0
        ? amount - overflowToFreeBudget
        : amount;

      const payment: PlannedExpensePayment = {
        id: crypto.randomUUID(),
        plannedExpenseId,
        month: paymentMonth,
        amount,
        potDeduction,
      };

      let next: BudgetState = {
        ...b,
        plannedExpensePayments: [...(b.plannedExpensePayments ?? []), payment],
      };

      if (overflowToFreeBudget && overflowToFreeBudget > 0) {
        next = {
          ...next,
          unplannedExpenses: [
            ...next.unplannedExpenses,
            {
              id: crypto.randomUUID(),
              name: `${expense.name} overpayment`,
              amount: overflowToFreeBudget,
              month: paymentMonth,
              category: expense.category,
              linkedPlannedExpenseId: expense.id,
            },
          ],
        };
      }

      return next;
    });
  }

  function updateEarlyPayment(
    paymentId: string,
    amount: number,
    overflowToFreeBudget?: number,
  ): void {
    update(b => {
      if (amount <= 0) return b;
      const payment = (b.plannedExpensePayments ?? []).find(p => p.id === paymentId);
      if (!payment) return b;

      const expense = b.plannedExpenses.find(e => e.id === payment.plannedExpenseId);

      const potDeduction = overflowToFreeBudget && overflowToFreeBudget > 0
        ? amount - overflowToFreeBudget
        : amount;

      // Remove any previous overflow unplanned expense linked to this payment's expense
      let unplanned = b.unplannedExpenses.filter(
        u => !(u.linkedPlannedExpenseId === payment.plannedExpenseId
          && u.month === payment.month
          && u.name.endsWith('overpayment')),
      );

      if (overflowToFreeBudget && overflowToFreeBudget > 0 && expense) {
        unplanned = [
          ...unplanned,
          {
            id: crypto.randomUUID(),
            name: `${expense.name} overpayment`,
            amount: overflowToFreeBudget,
            month: payment.month,
            category: expense.category,
            linkedPlannedExpenseId: expense.id,
          },
        ];
      }

      return {
        ...b,
        plannedExpensePayments: (b.plannedExpensePayments ?? []).map(p =>
          p.id === paymentId ? { ...p, amount, potDeduction } : p
        ),
        unplannedExpenses: unplanned,
      };
    });
  }

  function removeEarlyPayment(paymentId: string): void {
    update(b => ({
      ...b,
      plannedExpensePayments: (b.plannedExpensePayments ?? []).filter(p => p.id !== paymentId),
    }));
  }

  // ─── Unplanned expenses ───────────────────────────────────────────────────────

  function addUnplannedExpense(expense: Omit<UnplannedExpense, 'id'>): void {
    update(b => ({
      ...b,
      unplannedExpenses: [...b.unplannedExpenses, { ...expense, id: crypto.randomUUID() }],
    }));
  }

  function removeUnplannedExpense(id: string): void {
    update(b => ({
      ...b,
      unplannedExpenses: b.unplannedExpenses.filter(e => e.id !== id),
    }));
  }

  // ─── Undo ─────────────────────────────────────────────────────────────────────

  function undo(): void {
    setAppState(prev => {
      if (!prev.previousSnapshot) return prev;
      return {
        budget: prev.previousSnapshot,
        previousSnapshot: null,
      };
    });
  }

  // ─── Bulk operations ─────────────────────────────────────────────────────────

  // Called by the onboarding wizard when the user finishes setup.
  function completeOnboarding(initialBudget: BudgetState): void {
    setAppState({ budget: migrateBudget(initialBudget), previousSnapshot: null });
  }

  // Called by the import flow to replace everything at once.
  // No undo snapshot — a full import is treated as a fresh start.
  function importBudget(newBudget: BudgetState): void {
    setAppState({ budget: migrateBudget(newBudget), previousSnapshot: null });
  }

  // Clears testing data while keeping the onboarding setup:
  // income, fixed expenses/envelopes, and savings goal definitions.
  function resetWorkingData(): void {
    setAppState(prev => ({
      budget: {
        income:                       prev.budget.income,
        incomeByMonth:                {},
        additionalIncomeByMonth:      {},
        fixedExpenses:                prev.budget.fixedExpenses,
        plannedExpenses:              [],
        savingsGoals:                 prev.budget.savingsGoals,
        lockIns:                      [],
        unplannedExpenses:            [],
        envelopeActualizations:       [],
        plannedExpensePayments:       [],
        plannedExpenseRecoveries:     [],
        plannedExpenseSettlements:    [],
        reconciledMonths:             [],
        monthCarryAdjustments:        [],
      },
      previousSnapshot: null,
    }));
  }

  // ─── Return value ─────────────────────────────────────────────────────────────

  return {
    budget: appState.budget,
    engine,
    currentMonth,
    canUndo: appState.previousSnapshot !== null,
    // If income is 0, the user hasn't completed onboarding yet.
    hasCompletedSetup: appState.budget.income > 0,
    // Actions
    setIncome,
    setAdditionalIncomeForMonth,
    clearAdditionalIncomeForMonth,
    addFixedExpense,
    updateFixedExpense,
    removeFixedExpense,
    addPlannedExpense,
    updatePlannedExpense,
    removePlannedExpense,
    addSavingsGoal,
    updateSavingsGoal,
    removeSavingsGoal,
    lockIn,
    freeUp,
    addUnplannedExpense,
    removeUnplannedExpense,
    actualizeEnvelope,
    settleExpense,
    addPlannedExpensePayment,
    recordEarlyPayment,
    updateEarlyPayment,
    removeEarlyPayment,
    undo,
    completeOnboarding,
    importBudget,
    resetWorkingData,
  };
}
