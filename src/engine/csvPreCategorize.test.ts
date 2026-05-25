import { describe, expect, it } from 'vitest';
import type { BudgetState } from './types';
import type { ParsedCsvRow, SubAccountMappings } from './csvImportTypes';
import { buildReviewableTransactions } from './csvPreCategorize';

const baseBudget: BudgetState = {
  income: 3500,
  fixedExpenses: [
    { id: 'e1', name: 'Rent', amount: 120, category: 'housing', isEnvelope: false, actualAmount: null },
    { id: 'e2', name: 'Food', amount: 400, category: 'food', isEnvelope: true, actualAmount: null },
    { id: 'e3', name: 'Contracts', amount: 50, category: 'subs', isEnvelope: false, actualAmount: null },
  ],
  plannedExpenses: [],
  savingsGoals: [],
  lockIns: [],
  unplannedExpenses: [],
  envelopeActualizations: [],
  plannedExpensePayments: [],
  plannedExpenseSettlements: [],
};

const mappings: SubAccountMappings = {
  'C24 Pluskonto': { type: 'checking' },
  Essen: { type: 'envelope', linkedId: 'e2' },
  VERTRÄGE: { type: 'envelope', linkedId: 'e3' },
};

function row(overrides: Partial<ParsedCsvRow> & Pick<ParsedCsvRow, 'amount' | 'accountName'>): ParsedCsvRow {
  return {
    rowIndex: 1,
    type: 'Online-Kartenzahlung',
    bookingDate: '2026-05-05',
    cardDate: null,
    payee: 'Shop',
    iban: null,
    bic: null,
    reference: null,
    description: null,
    accountNumber: '1',
    category: null,
    subcategory: null,
    cashWithdrawal: null,
    ...overrides,
  };
}

describe('buildReviewableTransactions', () => {
  it('suggests income for large credit on checking', () => {
    const txs = buildReviewableTransactions(
      [row({ amount: 3500, accountName: 'C24 Pluskonto', type: 'Gutschrift', payee: 'Employer' })],
      mappings,
      baseBudget,
      '2026-05',
      [],
    );
    expect(txs[0].suggestion.category).toBe('income');
  });

  it('suggests envelope spend for envelope sub-account debit', () => {
    const txs = buildReviewableTransactions(
      [row({ amount: -42.5, accountName: 'Essen' })],
      mappings,
      baseBudget,
      '2026-05',
      [],
    );
    expect(txs[0].suggestion.category).toBe('envelope-spend');
    expect(txs[0].suggestion.linkedEnvelopeId).toBe('e2');
  });
});
