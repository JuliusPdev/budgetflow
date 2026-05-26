import type { CategoryType, ReviewableTransaction } from '../engine/csvImportTypes';
import { CATEGORY_LABELS, transactionNeedsDetails } from '../engine/csvPreCategorize';
import type { BudgetState } from '../engine/types';
import { formatCurrencyExact } from './formatting';

const ENVELOPE_VALUE_PREFIX = 'envelope:';
const FIXED_VALUE_PREFIX = 'fixed:';

/** Categories in Allocation dropdown; envelopes and fixed expenses are listed separately. */
export const GENERAL_ALLOCATION_CATEGORIES: CategoryType[] = [
  'income',
  'set-aside-transfer',
  'savings-contribution',
  'planned-expense-settlement',
  'free-budget-spend',
  'internal-transfer',
  'skip',
];

export function envelopeAllocationValue(envelopeId: string): string {
  return `${ENVELOPE_VALUE_PREFIX}${envelopeId}`;
}

export function fixedAllocationValue(expenseId: string): string {
  return `${FIXED_VALUE_PREFIX}${expenseId}`;
}

/** Select value for allocation column — matches allocation dropdown options. */
export function allocationSelectValue(tx: ReviewableTransaction): string {
  const category = tx.confirmedCategory ?? tx.suggestion.category;
  if (category === 'envelope-spend') {
    const envelopeId =
      tx.confirmedLinkedEnvelopeId ?? tx.suggestion.linkedEnvelopeId;
    return envelopeId ? envelopeAllocationValue(envelopeId) : '';
  }
  if (category === 'fixed-expense') {
    const expenseId =
      tx.confirmedLinkedExpenseId ?? tx.suggestion.linkedExpenseId;
    return expenseId ? fixedAllocationValue(expenseId) : '';
  }
  return category;
}

export interface AllocationFilterOption {
  value: string;
  label: string;
}

/** Distinct allocation filter choices (same labels as allocation dropdown). */
export function buildAllocationFilterOptions(
  budget: BudgetState,
): AllocationFilterOption[] {
  const options: AllocationFilterOption[] = GENERAL_ALLOCATION_CATEGORIES.map(
    c => ({ value: c, label: CATEGORY_LABELS[c] }),
  );
  for (const e of budget.fixedExpenses.filter(x => !x.isEnvelope)) {
    options.push({ value: fixedAllocationValue(e.id), label: e.name });
  }
  for (const e of budget.fixedExpenses.filter(x => x.isEnvelope)) {
    options.push({ value: envelopeAllocationValue(e.id), label: e.name });
  }
  return options;
}

export type ReviewTransactionStatusFilter = 'settled' | 'needs-detail' | 'ok';

export function reviewTransactionRowStatus(
  tx: ReviewableTransaction,
): ReviewTransactionStatusFilter | 'settled' {
  if (tx.settledPreviously) return 'settled';
  if (transactionNeedsDetails(tx)) return 'needs-detail';
  return 'ok';
}

export interface ReviewColumnFilters {
  account?: string;
  payee?: string;
  reference?: string;
  allocation?: string;
  status?: ReviewTransactionStatusFilter | 'all';
}

function formatTxDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Human-readable allocation label for search and settled-row display. */
export function allocationDisplayLabel(
  tx: ReviewableTransaction,
  budget: BudgetState,
): string {
  const category = tx.confirmedCategory ?? tx.suggestion.category;
  if (category === 'envelope-spend') {
    const envelopeId =
      tx.confirmedLinkedEnvelopeId ?? tx.suggestion.linkedEnvelopeId;
    const envelope = budget.fixedExpenses.find(e => e.id === envelopeId);
    return envelope?.name ?? CATEGORY_LABELS['envelope-spend'];
  }
  if (category === 'fixed-expense') {
    const expenseId =
      tx.confirmedLinkedExpenseId ?? tx.suggestion.linkedExpenseId;
    const expense = budget.fixedExpenses.find(e => e.id === expenseId);
    return expense?.name ?? CATEGORY_LABELS['fixed-expense'];
  }
  return CATEGORY_LABELS[category];
}

function formatAmountForDisplay(amount: number): string {
  const prefix = amount >= 0 ? '+' : '';
  return `${prefix}${formatCurrencyExact(amount)}`;
}

/** Lowercased text blob used for case-insensitive substring search. */
export function reviewTransactionSearchHaystack(
  tx: ReviewableTransaction,
  budget: BudgetState,
): string {
  const parts = [
    tx.row.payee,
    tx.row.description,
    tx.row.reference,
    tx.row.accountName,
    formatTxDate(tx.row.bookingDate),
    formatAmountForDisplay(tx.row.amount),
    String(tx.row.amount),
    allocationDisplayLabel(tx, budget),
  ];
  return parts.filter((p): p is string => Boolean(p && String(p).trim())).join(' ').toLowerCase();
}

export function isReviewFilterActive(
  query: string,
  columnFilters?: ReviewColumnFilters,
): boolean {
  if (query.trim().length > 0) return true;
  if (!columnFilters) return false;
  if (columnFilters.account) return true;
  if (columnFilters.payee?.trim()) return true;
  if (columnFilters.reference?.trim()) return true;
  if (columnFilters.allocation) return true;
  if (columnFilters.status && columnFilters.status !== 'all') return true;
  return false;
}

function matchesSearch(
  tx: ReviewableTransaction,
  query: string,
  budget: BudgetState,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return reviewTransactionSearchHaystack(tx, budget).includes(needle);
}

function matchesColumnFilters(
  tx: ReviewableTransaction,
  columnFilters: ReviewColumnFilters | undefined,
): boolean {
  if (!columnFilters) return true;

  if (columnFilters.account && tx.row.accountName !== columnFilters.account) {
    return false;
  }

  const payeeNeedle = columnFilters.payee?.trim().toLowerCase();
  if (payeeNeedle) {
    const payee = (tx.row.payee ?? '').toLowerCase();
    const description = (tx.row.description ?? '').toLowerCase();
    if (!payee.includes(payeeNeedle) && !description.includes(payeeNeedle)) {
      return false;
    }
  }

  const referenceNeedle = columnFilters.reference?.trim().toLowerCase();
  if (referenceNeedle) {
    const reference = (tx.row.reference ?? '').toLowerCase();
    if (!reference.includes(referenceNeedle)) {
      return false;
    }
  }

  if (
    columnFilters.allocation &&
    allocationSelectValue(tx) !== columnFilters.allocation
  ) {
    return false;
  }

  if (
    columnFilters.status &&
    columnFilters.status !== 'all' &&
    reviewTransactionRowStatus(tx) !== columnFilters.status
  ) {
    return false;
  }

  return true;
}

export function filterReviewTransactions(
  transactions: ReviewableTransaction[],
  query: string,
  budget: BudgetState,
  columnFilters?: ReviewColumnFilters,
): ReviewableTransaction[] {
  return transactions.filter(
    tx =>
      matchesSearch(tx, query, budget) &&
      matchesColumnFilters(tx, columnFilters),
  );
}
