import type {
  CategorySuggestion,
  CategoryType,
  ConfirmedTransaction,
  ParsedCsvRow,
  ReviewableTransaction,
  SubAccountMappings,
} from './csvImportTypes';
import {
  bookingMonth,
  defaultLockInMonth,
  findPriorMatch,
  fingerprintParsedRow,
} from './importMatching';
import { incomeForMonth } from './income';
import type { BudgetState, FixedExpense, Month, PlannedExpense } from './types';

const INCOME_TOLERANCE = 0.05;
const AMOUNT_TOLERANCE = 0.02;

function amountsMatch(a: number, b: number): boolean {
  const expected = Math.abs(b);
  if (expected < 0.01) return Math.abs(a) < 0.01;
  return Math.abs(Math.abs(a) - expected) / expected <= AMOUNT_TOLERANCE;
}

function isLargeIncome(amount: number, income: number): boolean {
  return amount > 0 && amount >= income * (1 - INCOME_TOLERANCE);
}

function getMappingType(
  accountName: string,
  mappings: SubAccountMappings,
): SubAccountMappings[string] | undefined {
  return mappings[accountName];
}

function findFixedExpense(
  expenses: FixedExpense[],
  amount: number,
  payee: string,
): FixedExpense | undefined {
  const hardFixed = expenses.filter(e => !e.isEnvelope);
  const byAmount = hardFixed.filter(e => amountsMatch(amount, e.amount));
  if (byAmount.length === 1) return byAmount[0];
  if (byAmount.length > 1) {
    const payeeLower = payee.toLowerCase();
    const byPayee = byAmount.find(e => payeeLower.includes(e.name.toLowerCase()));
    if (byPayee) return byPayee;
    return byAmount[0];
  }
  return undefined;
}

function findPlannedExpense(
  expenses: PlannedExpense[],
  month: Month,
  amount: number,
): PlannedExpense | undefined {
  return expenses.find(
    e => e.targetMonth === month && amountsMatch(amount, e.amount),
  );
}

function suggestForRow(
  row: ParsedCsvRow,
  mappings: SubAccountMappings,
  budget: BudgetState,
): CategorySuggestion {
  const mapping = getMappingType(row.accountName, mappings);
  const absAmount = Math.abs(row.amount);
  const isDebit = row.amount < 0;
  const isCredit = row.amount > 0;

  if (row.type === 'Pocket-Umbuchung') {
    if (mapping?.type === 'checking' && isDebit) {
      return {
        category: 'set-aside-transfer',
        label: 'Set-aside transfer',
        uncertain: false,
      };
    }
    if (isCredit && (mapping?.type === 'pot' || mapping?.type === 'savings')) {
      return {
        category: mapping.type === 'savings' ? 'savings-contribution' : 'set-aside-transfer',
        label: mapping.type === 'savings' ? 'Savings contribution' : 'Set-aside transfer',
        linkedSavingsGoalId: mapping.linkedId,
        uncertain: !mapping.linkedId && mapping.type === 'savings',
      };
    }
    return { category: 'internal-transfer', label: 'Internal transfer', uncertain: false };
  }

  if (mapping?.type === 'ignore') {
    return { category: 'skip', label: 'Skip', uncertain: false };
  }

  if (mapping?.type === 'envelope') {
    if (isDebit) {
      const env = budget.fixedExpenses.find(e => e.id === mapping.linkedId);
      return {
        category: 'envelope-spend',
        label: env ? `${env.name} spend` : 'Envelope spend',
        linkedEnvelopeId: mapping.linkedId,
        uncertain: !mapping.linkedId,
      };
    }
    return { category: 'internal-transfer', label: 'Internal transfer', uncertain: true };
  }

  if (mapping?.type === 'pot' || mapping?.type === 'savings') {
    if (isCredit) {
      return {
        category: mapping.type === 'savings' ? 'savings-contribution' : 'set-aside-transfer',
        label: mapping.type === 'savings' ? 'Savings contribution' : 'Set-aside transfer',
        linkedSavingsGoalId: mapping.linkedId,
        uncertain: !mapping.linkedId && mapping.type === 'savings',
      };
    }
    return { category: 'internal-transfer', label: 'Internal transfer', uncertain: false };
  }

  if (mapping?.type === 'checking' || !mapping) {
    if (isCredit && isLargeIncome(row.amount, incomeForMonth(bookingMonth(row.bookingDate), budget))) {
      return { category: 'income', label: 'Monthly income', uncertain: false };
    }

    if (isDebit) {
      const fixed = findFixedExpense(budget.fixedExpenses, absAmount, row.payee);
      if (fixed && !fixed.isEnvelope) {
        return {
          category: 'fixed-expense',
          label: `Fixed expense — ${fixed.name}`,
          linkedExpenseId: fixed.id,
          uncertain: false,
        };
      }

      const planned = findPlannedExpense(
        budget.plannedExpenses,
        bookingMonth(row.bookingDate),
        absAmount,
      );
      if (planned) {
        return {
          category: 'planned-expense-settlement',
          label: `Related to ${planned.name}?`,
          linkedExpenseId: planned.id,
          uncertain: true,
        };
      }

      return { category: 'free-budget-spend', label: 'Free budget spend', uncertain: false };
    }
  }

  return { category: 'skip', label: 'Skip', uncertain: true };
}

export function buildReviewableTransactions(
  rows: ParsedCsvRow[],
  mappings: SubAccountMappings,
  budget: BudgetState,
  currentMonth: Month,
  priorConfirmed: ConfirmedTransaction[],
): ReviewableTransaction[] {
  return rows.map((row, index) => {
    const prior = findPriorMatch(row, priorConfirmed);
    const suggestion = suggestForRow(row, mappings, budget);
    const category = prior?.confirmedCategory ?? suggestion.category;
    let lockInMonth: Month | undefined;
    if (category === 'set-aside-transfer') {
      lockInMonth =
        prior?.lockInMonth ??
        defaultLockInMonth(row, rows, incomeForMonth(bookingMonth(row.bookingDate), budget), currentMonth);
    }
    return {
      id: `tx-${fingerprintParsedRow(row)}-${index}`,
      row,
      suggestion: prior
        ? {
            category: prior.confirmedCategory,
            label: CATEGORY_LABELS[prior.confirmedCategory],
            linkedExpenseId: prior.linkedExpenseId,
            linkedEnvelopeId: prior.linkedEnvelopeId,
            linkedSavingsGoalId: prior.linkedSavingsGoalId,
            uncertain: false,
          }
        : suggestion,
      confirmedCategory: category,
      confirmedLinkedExpenseId: prior?.linkedExpenseId ?? suggestion.linkedExpenseId,
      confirmedLinkedEnvelopeId: prior?.linkedEnvelopeId ?? suggestion.linkedEnvelopeId,
      confirmedLinkedSavingsGoalId:
        prior?.linkedSavingsGoalId ?? suggestion.linkedSavingsGoalId,
      lockInMonth,
      settledPreviously: Boolean(prior),
    };
  });
}

export function transactionNeedsDetails(tx: ReviewableTransaction): boolean {
  switch (tx.confirmedCategory) {
    case 'fixed-expense':
    case 'planned-expense-settlement':
      return !tx.confirmedLinkedExpenseId && !tx.suggestion.linkedExpenseId;
    case 'envelope-spend':
      return !tx.confirmedLinkedEnvelopeId && !tx.suggestion.linkedEnvelopeId;
    case 'savings-contribution':
      return !tx.confirmedLinkedSavingsGoalId && !tx.suggestion.linkedSavingsGoalId;
    default:
      return false;
  }
}

export function allTransactionsReady(transactions: ReviewableTransaction[]): boolean {
  return (
    transactions.length > 0 &&
    transactions.every(tx => tx.settledPreviously || !transactionNeedsDetails(tx))
  );
}

export function toConfirmedTransactions(
  transactions: ReviewableTransaction[],
): import('./csvImportTypes').ConfirmedTransaction[] {
  return transactions
    .filter(tx => tx.confirmedCategory !== null && tx.confirmedCategory !== 'skip')
    .map(tx => ({
      id: tx.id,
      date: tx.row.bookingDate,
      transactionType: tx.row.type,
      payee: tx.row.payee,
      description: tx.row.description,
      amount: tx.row.amount,
      subAccount: tx.row.accountName,
      confirmedCategory: tx.confirmedCategory!,
      linkedExpenseId: tx.confirmedLinkedExpenseId ?? tx.suggestion.linkedExpenseId,
      linkedEnvelopeId: tx.confirmedLinkedEnvelopeId ?? tx.suggestion.linkedEnvelopeId,
      linkedSavingsGoalId:
        tx.confirmedLinkedSavingsGoalId ?? tx.suggestion.linkedSavingsGoalId,
      lockInMonth: tx.lockInMonth,
    }));
}

export const CATEGORY_LABELS: Record<CategoryType, string> = {
  income: 'Income',
  'fixed-expense': 'Fixed expense',
  'envelope-spend': 'Envelope spend',
  'set-aside-transfer': 'Set-aside transfer',
  'savings-contribution': 'Savings contribution',
  'planned-expense-settlement': 'Planned expense settlement',
  'free-budget-spend': 'Free budget spend',
  'internal-transfer': 'Internal transfer (ignore)',
  skip: 'Skip',
};
