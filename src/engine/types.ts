// ─── Primitive aliases ────────────────────────────────────────────────────────

// A calendar month in "YYYY-MM" format, e.g. "2026-05".
// Using a named alias makes function signatures self-documenting.
export type Month = string;

// ─── Input types (what the user configures) ───────────────────────────────────

export interface FixedExpense {
  id: string;
  name: string;
  // The monthly amount deducted from income each month.
  // For hard fixed expenses this never changes.
  // For envelopes this is the planned budget; actualAmount records what was really spent.
  amount: number;
  category: string;
  // true = budget envelope (food, travel…); false = hard fixed (rent, phone…)
  isEnvelope: boolean;
  // Only meaningful when isEnvelope is true. null until the user actualizes at end of month.
  actualAmount: number | null;
}

// A planned expense is something you're saving toward across multiple months.
// The smoothing algorithm distributes the cost into the pot as a set-aside amount.
// Formerly called "irregular expenses" in the UI — rename is in progress.
export type ExpenseConfidence = 'confirmed' | 'estimated' | 'rough-guess';

export interface PlannedExpense {
  id: string;
  name: string;
  amount: number;
  targetMonth: Month;
  category: string;
  confidence: ExpenseConfidence;
  // When set to a month after currentMonth, the engine excludes this expense
  // from the current month's distribution and funds it only from startFromMonth onward.
  // Undefined means "include from the first available month" (the default).
  startFromMonth?: Month;
}

// Discriminated union: TypeScript knows which fields are available based on `mode`.
// Mode A = "save €X by date Y". Mode B = "save €X every month forever".
export type SavingsGoal =
  | {
      id: string;
      name: string;
      mode: 'target';
      targetAmount: number;
      currentAmount: number;
      targetDate: Month;
    }
  | {
      id: string;
      name: string;
      mode: 'monthly';
      monthlyAmount: number;
    };

// An envelope actualization records what was actually spent on a budget envelope
// in a given month. Created at end-of-month when the user enters the real amount.
// surplusDestination tells us where the leftover went (null = no surplus or overspent).
// When surplusDestination = 'pot', the engine tracks the surplus via envelopePotByMonth.
// When surplusDestination = 'savings', the linked goal's currentAmount was increased.
// When surplusDestination = 'free', the engine adds the surplus back to freeBudget.
// When actual > planned, an UnplannedExpense was created for the overage instead.
export type SurplusDestination = 'pot' | 'savings' | 'free' | 'carry';

export interface EnvelopeActualization {
  id: string;
  envelopeId: string;
  month: Month;
  actualAmount: number;
  surplusDestination: SurplusDestination | null;
  surplusSavingsGoalId: string | null;
}

// A lock-in is a fact: "I transferred this much to savings this month."
// lockedAmount is a running total — multiple lock-ins per month are additive.
// lockState = 'planned'   → user recorded intent in the app (has not been verified)
// lockState = 'confirmed' → verified by CSV import (transfer actually happened)
export interface LockInRecord {
  id: string;
  month: Month;
  lockedAmount: number;
  lockState: 'planned' | 'confirmed';
}

// An unplanned expense is something that wasn't budgeted for ahead of time.
// It comes directly out of free budget (not the pot), and can only exist in the
// current month or past months — never a future month (that would be a planned expense).
//
// linkedPlannedExpenseId is set when this unplanned expense represents overflow from a
// settled planned expense that cost more than the pot could cover. null in the normal case.
export interface UnplannedExpense {
  id: string;
  name: string;
  amount: number;
  month: Month;
  category: string;
  linkedPlannedExpenseId: string | null;
}

// A payment record is created when money is spent toward a planned expense before
// the expense is finally closed. Example: paying for a flight in June toward a
// September Trip. amount reduces what remains to fund; potDeduction records how
// much actually came out of the pot in the payment month.
export interface PlannedExpensePayment {
  id: string;
  plannedExpenseId: string;
  month: Month;
  amount: number;
  potDeduction: number;
}

// A settlement record is created when a planned expense's target month arrives and
// the user confirms what it actually cost. It acts like a receipt: "I budgeted €650
// for this, it actually cost €580, and the €70 surplus stays in the pot."
//
// potDeduction = what actually left the pot:
//   • Underspent + keep in pot  → potDeduction = actualAmount (surplus stays)
//   • Underspent + free up      → potDeduction = expense.amount (full planned amount
//                                  drained; engine credits freed surplus back to freeBudget)
//   • Exact match               → potDeduction = actualAmount (= expense.amount)
//   • Overspent                 → potDeduction = expense.amount + however much pot surplus
//                                  could absorb; remainder becomes an UnplannedExpense
//
// surplusDestination is null for exact or overspent cases.
export interface PlannedExpenseSettlement {
  id: string;
  plannedExpenseId: string;
  month: Month;
  actualAmount: number;
  potDeduction: number;
  surplusDestination: 'pot' | 'free' | null;
}

// One-time boosts on a future month from reconciliation carry-forward.
export interface MonthCarryAdjustments {
  month: Month;
  freeBudgetBoost: number;
  envelopeBoosts: Record<string, number>;
}

// ─── Persisted state (written to and read from localStorage) ──────────────────

export interface BudgetState {
  /** Default monthly income when a month has no entry in incomeByMonth. */
  income: number;
  /** Actual confirmed income per calendar month (from CSV settlement). */
  incomeByMonth?: Partial<Record<Month, number>>;
  fixedExpenses: FixedExpense[];
  plannedExpenses: PlannedExpense[];
  savingsGoals: SavingsGoal[];
  lockIns: LockInRecord[];
  unplannedExpenses: UnplannedExpense[];
  envelopeActualizations: EnvelopeActualization[];
  plannedExpensePayments: PlannedExpensePayment[];
  plannedExpenseSettlements: PlannedExpenseSettlement[];
  reconciledMonths?: Month[];
  monthCarryAdjustments?: MonthCarryAdjustments[];
}

// Full app state: budget data + one undo snapshot.
// previousSnapshot is null when there is nothing to undo.
export interface AppState {
  budget: BudgetState;
  previousSnapshot: BudgetState | null;
}

// ─── Engine output types (what the algorithm returns) ─────────────────────────

// Describes how the current month's locked amount compares to the new recommendation.
// This is a discriminated union: each `kind` carries exactly the fields it needs.
export type LockStatus =
  | { kind: 'unlocked' }
  | { kind: 'on-track';          lockedAmount: number }
  | { kind: 'additional-needed'; lockedAmount: number; additionalNeeded: number }
  | { kind: 'surplus';           lockedAmount: number; surplus: number };

export interface MonthResult {
  month: Month;
  /** Income used for this month (from incomeByMonth or default income). */
  monthlyIncome: number;
  /** monthlyIncome − fixed − Mode B savings (before set-aside). */
  availableAfterFixed: number;
  plannedExpenses: PlannedExpense[];      // Type 2 expenses whose targetMonth === this month
  plannedTotal: number;                   // sum of those expenses
  unplannedExpenses: UnplannedExpense[];  // Type 3 expenses that occurred in this month
  unplannedTotal: number;                 // sum of those expenses
  incomeCarryover: number;                // free budget carried into this month
  setAsideRecommended: number;            // what the algorithm says to set aside
  setAsideLocked: number;                 // what has actually been transferred (0 for future months)
  freeBudget: number;                     // A − set-aside − unplanned expenses
  potAfter: number;                       // cumulative pot balance after this month
  physicalPotAfter: number;               // actual locked pot balance, before unfounded planned deductions
  lockStatus: LockStatus;                 // only meaningful for the current month
}

export interface EngineOutput {
  /** Available for current month (income − fixed − Mode B); other months use MonthResult.availableAfterFixed. */
  availablePerMonth: number;
  fixedTotal: number;          // sum of all fixed expenses (informational, for display)
  modeBSavingsTotal: number;   // sum of all Mode B monthly contributions
  months: MonthResult[];
}
