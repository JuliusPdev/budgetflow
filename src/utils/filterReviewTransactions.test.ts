import { describe, expect, it } from 'vitest';
import type { BudgetState } from '../engine/types';
import type { ReviewableTransaction } from '../engine/csvImportTypes';
import {
  allocationSelectValue,
  filterReviewTransactions,
  isReviewFilterActive,
} from './filterReviewTransactions';

const budget: BudgetState = {
  income: 3000,
  fixedExpenses: [
    { id: 'e1', name: 'Rent', amount: 900, category: 'housing', isEnvelope: false, actualAmount: null },
    { id: 'env1', name: 'Groceries', amount: 200, category: 'food', isEnvelope: true, actualAmount: null },
  ],
  plannedExpenses: [],
  savingsGoals: [],
  lockIns: [],
  unplannedExpenses: [],
  envelopeActualizations: [],
  plannedExpensePayments: [],
  plannedExpenseSettlements: [],
};

function tx(
  overrides: Partial<ReviewableTransaction['row']> &
    Pick<ReviewableTransaction['row'], 'payee' | 'amount'> & {
      id?: string;
      confirmedCategory?: ReviewableTransaction['confirmedCategory'];
      confirmedLinkedExpenseId?: string;
      confirmedLinkedEnvelopeId?: string;
      settledPreviously?: boolean;
      suggestion?: ReviewableTransaction['suggestion'];
    },
): ReviewableTransaction {
  const {
    id = 't1',
    confirmedCategory = null,
    confirmedLinkedExpenseId,
    confirmedLinkedEnvelopeId,
    settledPreviously,
    suggestion,
    ...rowOverrides
  } = overrides;
  return {
    id,
    row: {
      rowIndex: 1,
      type: 'Payment',
      bookingDate: '2026-05-12',
      cardDate: null,
      payee: rowOverrides.payee,
      iban: null,
      bic: null,
      reference: rowOverrides.reference ?? null,
      description: rowOverrides.description ?? null,
      accountNumber: '1',
      accountName: rowOverrides.accountName ?? 'Main',
      category: null,
      subcategory: null,
      cashWithdrawal: null,
      amount: rowOverrides.amount,
    },
    suggestion: suggestion ?? { category: 'free-budget-spend', label: 'Spend', uncertain: false },
    confirmedCategory,
    confirmedLinkedExpenseId,
    confirmedLinkedEnvelopeId,
    settledPreviously,
  };
}

describe('filterReviewTransactions', () => {
  const rows = [
    tx({ id: 't1', payee: 'REWE', amount: -42.5, description: 'Groceries', accountName: 'Giro' }),
    tx({ id: 't2', payee: 'Employer', amount: 2800, accountName: 'Giro' }),
    tx({
      id: 't3',
      payee: 'Landlord',
      amount: -900,
      accountName: 'Savings',
      confirmedCategory: 'fixed-expense',
      confirmedLinkedExpenseId: 'e1',
    }),
    tx({
      id: 't4',
      payee: 'Old shop',
      amount: -10,
      accountName: 'Giro',
      settledPreviously: true,
    }),
    tx({
      id: 't5',
      payee: 'Market',
      amount: -30,
      accountName: 'Giro',
      confirmedCategory: 'envelope-spend',
      suggestion: {
        category: 'envelope-spend',
        label: 'Envelope',
        linkedEnvelopeId: 'env1',
        uncertain: false,
      },
    }),
  ];

  it('returns all rows when query is empty', () => {
    expect(filterReviewTransactions(rows, '', budget)).toHaveLength(5);
    expect(filterReviewTransactions(rows, '   ', budget)).toHaveLength(5);
  });

  it('filters by payee case-insensitively via search', () => {
    const filtered = filterReviewTransactions(rows, 'rewe', budget);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].row.payee).toBe('REWE');
  });

  it('filters by Betreff (reference) via search', () => {
    const withReference = [
      ...rows,
      tx({
        id: 't6',
        payee: 'Utility Co',
        amount: -80,
        reference: 'Invoice May 2026',
      }),
    ];
    const filtered = filterReviewTransactions(withReference, 'invoice may', budget);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].row.reference).toBe('Invoice May 2026');
  });

  it('filters by reference column', () => {
    const withReference = [
      tx({
        id: 't6',
        payee: 'Utility Co',
        amount: -80,
        reference: 'Invoice May 2026',
      }),
    ];
    const filtered = filterReviewTransactions(withReference, '', budget, {
      reference: 'invoice',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].row.reference).toBe('Invoice May 2026');
  });

  it('filters by formatted amount substring', () => {
    const filtered = filterReviewTransactions(rows, '2800', budget);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].row.payee).toBe('Employer');
  });

  it('filters by account column', () => {
    const filtered = filterReviewTransactions(rows, '', budget, {
      account: 'Savings',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].row.payee).toBe('Landlord');
  });

  it('filters by payee column with partial match on description', () => {
    const filtered = filterReviewTransactions(rows, '', budget, {
      payee: 'grocer',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].row.payee).toBe('REWE');
  });

  it('filters by allocation select value (fixed expense)', () => {
    const filtered = filterReviewTransactions(rows, '', budget, {
      allocation: 'fixed:e1',
    });
    expect(filtered).toHaveLength(1);
    expect(allocationSelectValue(filtered[0])).toBe('fixed:e1');
  });

  it('filters by allocation select value (envelope)', () => {
    const filtered = filterReviewTransactions(rows, '', budget, {
      allocation: 'envelope:env1',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].row.payee).toBe('Market');
  });

  it('filters by status column', () => {
    expect(
      filterReviewTransactions(rows, '', budget, { status: 'settled' }),
    ).toHaveLength(1);
    expect(
      filterReviewTransactions(rows, '', budget, { status: 'needs-detail' }),
    ).toHaveLength(0);
  });

  it('combines search and column filters with AND logic', () => {
    const filtered = filterReviewTransactions(rows, 'rewe', budget, {
      account: 'Giro',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('t1');

    const none = filterReviewTransactions(rows, 'rewe', budget, {
      account: 'Savings',
    });
    expect(none).toHaveLength(0);
  });
});

describe('isReviewFilterActive', () => {
  it('is false when nothing is set', () => {
    expect(isReviewFilterActive('', {})).toBe(false);
    expect(isReviewFilterActive('  ', { status: 'all' })).toBe(false);
  });

  it('is true when search or any column filter is set', () => {
    expect(isReviewFilterActive('x', {})).toBe(true);
    expect(isReviewFilterActive('', { account: 'Giro' })).toBe(true);
    expect(isReviewFilterActive('', { payee: 'a' })).toBe(true);
    expect(isReviewFilterActive('', { reference: 'rent' })).toBe(true);
    expect(isReviewFilterActive('', { allocation: 'income' })).toBe(true);
    expect(isReviewFilterActive('', { status: 'ok' })).toBe(true);
  });
});
