import type { Month } from './types';

// ─── Parsed C24 row ───────────────────────────────────────────────────────────

export interface ParsedCsvRow {
  rowIndex: number;
  type: string;
  bookingDate: string; // ISO YYYY-MM-DD
  cardDate: string | null;
  amount: number; // negative = outgoing, positive = incoming
  payee: string;
  iban: string | null;
  bic: string | null;
  reference: string | null;
  description: string | null;
  accountNumber: string;
  accountName: string;
  category: string | null;
  subcategory: string | null;
  cashWithdrawal: string | null;
}

export type ParseCsvResult =
  | { ok: true; rows: ParsedCsvRow[]; delimiter: ';' | ',' }
  | { ok: false; error: string };

// ─── Sub-account mapping ──────────────────────────────────────────────────────

export type SubAccountMappingType = 'checking' | 'envelope' | 'pot' | 'savings' | 'ignore';

export interface SubAccountMapping {
  type: SubAccountMappingType;
  linkedId?: string;
}

export type SubAccountMappings = Record<string, SubAccountMapping>;

// ─── Category types for reconciliation ────────────────────────────────────────

export type CategoryType =
  | 'income'
  | 'fixed-expense'
  | 'envelope-spend'
  | 'set-aside-transfer'
  | 'savings-contribution'
  | 'planned-expense-settlement'
  | 'free-budget-spend'
  | 'internal-transfer'
  | 'skip';

export interface CategorySuggestion {
  category: CategoryType;
  label: string;
  linkedExpenseId?: string;
  linkedEnvelopeId?: string;
  linkedSavingsGoalId?: string;
  uncertain: boolean;
}

export interface ReviewableTransaction {
  id: string;
  row: ParsedCsvRow;
  suggestion: CategorySuggestion;
  confirmedCategory: CategoryType | null;
  confirmedLinkedExpenseId?: string;
  confirmedLinkedEnvelopeId?: string;
  confirmedLinkedSavingsGoalId?: string;
  lockInMonth?: Month;
  settledPreviously?: boolean;
}

export interface LastSettleMeta {
  periodStart: string;
  periodEnd: string;
  settledAt: string;
  maxBookingDate: string;
}

export interface ConfirmedTransaction {
  id: string;
  date: string;
  transactionType: string;
  payee: string;
  description: string | null;
  amount: number;
  subAccount: string;
  confirmedCategory: CategoryType;
  linkedExpenseId?: string;
  linkedEnvelopeId?: string;
  linkedSavingsGoalId?: string;
  lockInMonth?: Month;
}

// ─── Import session ───────────────────────────────────────────────────────────

export type LeftoverAllocation = 'pot' | 'savings' | 'carry' | null;

export type EnvelopeSurplusChoice = 'pot' | 'savings' | 'carry';

export interface EnvelopeSurplusDecision {
  month: Month;
  envelopeId: string;
  surplus: number;
  choice: EnvelopeSurplusChoice;
  savingsGoalId?: string;
}

export type PlannedExpenseSurplusChoice = 'pot' | 'free';

export interface PlannedExpenseSurplusDecision {
  plannedExpenseId: string;
  surplus: number;
  choice: PlannedExpenseSurplusChoice;
}

export interface ImportSession {
  importDate: string;
  rawRowCount: number;
  confirmedRows: ConfirmedTransaction[];
  envelopeActuals: Record<string, number>;
  potTransferAmount: number;
  potTransferConfirmed: boolean;
  savingsContributions: Record<string, number>;
  plannedExpensePayments: Record<string, number>;
  settledExpenses: Record<string, number>;
  plannedExpenseSurplusDecisions: PlannedExpenseSurplusDecision[];
  leftoverFreeBudget: number;
  leftoverAllocation: LeftoverAllocation;
  leftoverSavingsGoalId?: string;
  envelopeSurplusDecisions: EnvelopeSurplusDecision[];
  status: 'in-progress' | 'complete';
}

export type ImportSessions = Record<Month, ImportSession>;

// ─── Reconciliation summary (computed before apply) ───────────────────────────

export interface ReconciliationSummary {
  month: Month;
  incomeTotal: number;
  fixedExpenses: { id: string; name: string; expected: number; actual: number }[];
  envelopeActuals: { id: string; name: string; planned: number; actual: number; surplus: number }[];
  potTransferAmount: number;
  potTransferConfirmed: boolean;
  savingsContributions: { id: string; name: string; amount: number }[];
  plannedExpensePayments: {
    id: string;
    name: string;
    planned: number;
    targetMonth: Month;
    actual: number;
    /** Free-budget advance still to repay via future set-asides (before this import is applied). */
    recoveryOwed: number;
    recoveryRepaid: number;
  }[];
  settledExpenses: {
    id: string;
    name: string;
    planned: number;
    paidBefore: number;
    currentAmount: number;
    actual: number;
  }[];
  freeBudgetSpendTotal: number;
  skippedCount: number;
  leftoverFreeBudget: number;
}
