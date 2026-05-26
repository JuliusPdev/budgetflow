import { describe, expect, it } from 'vitest';
import type { BudgetState } from './types';
import type { ConfirmedTransaction } from './csvImportTypes';
import { applyReconciliation, computeReconciliationSummary } from './reconciliationApply';

const budget: BudgetState = {
  income: 3500,
  fixedExpenses: [
    { id: 'food', name: 'Food', amount: 400, category: 'food', isEnvelope: true, actualAmount: null },
  ],
  plannedExpenses: [
    {
      id: 'trip',
      name: 'Trip',
      amount: 500,
      targetMonth: '2026-06',
      category: 'travel',
      confidence: 'confirmed',
    },
  ],
  savingsGoals: [],
  lockIns: [],
  unplannedExpenses: [],
  envelopeActualizations: [],
  plannedExpensePayments: [],
  plannedExpenseRecoveries: [],
  plannedExpenseSettlements: [],
};

describe('applyReconciliation', () => {
  it('creates envelope actualization and confirmed lock-in', () => {
    const confirmed: ConfirmedTransaction[] = [
      {
        id: '1',
        date: '2026-05-01',
        transactionType: 'csv',
        payee: 'Employer',
        description: null,
        amount: 3500,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'income',
      },
      {
        id: '2',
        date: '2026-05-05',
        transactionType: 'csv',
        payee: 'REWE',
        description: null,
        amount: -300,
        subAccount: 'Food',
        confirmedCategory: 'envelope-spend',
        linkedEnvelopeId: 'food',
      },
      {
        id: '3',
        date: '2026-05-02',
        transactionType: 'csv',
        payee: '',
        description: null,
        amount: -325,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'set-aside-transfer',
      },
    ];

    const next = applyReconciliation(budget, {
      month: '2026-05',
      confirmed,
      envelopeSurplusDecisions: [
        { month: '2026-05', envelopeId: 'food', surplus: 100, choice: 'pot' },
      ],
      plannedExpenseSurplusDecisions: [],
      leftoverFreeBudget: 0,
      leftoverAllocation: null,
      potAvailable: 500,
    });

    expect(next.envelopeActualizations.length).toBe(1);
    expect(next.envelopeActualizations[0].actualAmount).toBe(300);
    expect(next.lockIns.some(l => l.month === '2026-05' && l.lockState === 'confirmed')).toBe(true);
    expect(next.reconciledMonths).toContain('2026-05');
  });

  it('computes summary leftover', () => {
    const confirmed: ConfirmedTransaction[] = [
      {
        id: '1',
        date: '2026-05-01',
        transactionType: 'csv',
        payee: 'Employer',
        description: null,
        amount: 3500,
        subAccount: 'Checking',
        confirmedCategory: 'income',
      },
      {
        id: '2',
        date: '2026-05-05',
        transactionType: 'csv',
        payee: 'REWE',
        description: null,
        amount: -300,
        subAccount: 'Food',
        confirmedCategory: 'envelope-spend',
        linkedEnvelopeId: 'food',
      },
    ];
    const summary = computeReconciliationSummary('2026-05', confirmed, budget);
    expect(summary.incomeTotal).toBe(3500);
    expect(summary.envelopeActuals[0].surplus).toBe(100);
    expect(summary.leftoverFreeBudget).toBeGreaterThan(0);
  });

  it('counts a positive set-aside transfer when the receiving side is selected', () => {
    const confirmed: ConfirmedTransaction[] = [
      {
        id: '1',
        date: '2026-05-02',
        transactionType: 'csv',
        payee: '',
        description: null,
        amount: 325,
        subAccount: 'Sparkonto',
        confirmedCategory: 'set-aside-transfer',
      },
    ];

    const summary = computeReconciliationSummary('2026-05', confirmed, budget);
    expect(summary.potTransferAmount).toBe(325);
    expect(summary.potTransferConfirmed).toBe(true);
  });

  it('prefers the debit side when both transfer sides are selected', () => {
    const confirmed: ConfirmedTransaction[] = [
      {
        id: '1',
        date: '2026-05-02',
        transactionType: 'csv',
        payee: '',
        description: null,
        amount: -325,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'set-aside-transfer',
      },
      {
        id: '2',
        date: '2026-05-02',
        transactionType: 'csv',
        payee: '',
        description: null,
        amount: 325,
        subAccount: 'Sparkonto',
        confirmedCategory: 'set-aside-transfer',
      },
    ];

    const summary = computeReconciliationSummary('2026-05', confirmed, budget);
    expect(summary.potTransferAmount).toBe(325);
  });

  it('includes a future planned expense link as an early payment', () => {
    const confirmed: ConfirmedTransaction[] = [
      {
        id: '1',
        date: '2026-05-10',
        transactionType: 'csv',
        payee: 'Hotel',
        description: null,
        amount: -480,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'planned-expense-settlement',
        linkedExpenseId: 'trip',
      },
    ];

    const summary = computeReconciliationSummary('2026-05', confirmed, budget);
    expect(summary.plannedExpensePayments).toEqual([
      {
        id: 'trip',
        name: 'Trip',
        planned: 500,
        targetMonth: '2026-06',
        actual: 480,
        recoveryOwed: 0,
        recoveryRepaid: 0,
      },
    ]);
    expect(summary.settledExpenses).toEqual([]);
  });

  it('includes a user-linked planned expense settlement in its target month summary', () => {
    const confirmed: ConfirmedTransaction[] = [
      {
        id: '1',
        date: '2026-06-10',
        transactionType: 'csv',
        payee: 'Hotel',
        description: null,
        amount: -480,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'planned-expense-settlement',
        linkedExpenseId: 'trip',
      },
    ];

    const summary = computeReconciliationSummary('2026-06', confirmed, budget);
    expect(summary.settledExpenses).toEqual([
      { id: 'trip', name: 'Trip', planned: 500, paidBefore: 0, currentAmount: 480, actual: 480 },
    ]);
  });

  it('applies a user-linked planned expense settlement in its target month', () => {
    const confirmed: ConfirmedTransaction[] = [
      {
        id: '1',
        date: '2026-06-10',
        transactionType: 'csv',
        payee: 'Hotel',
        description: null,
        amount: -480,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'planned-expense-settlement',
        linkedExpenseId: 'trip',
      },
    ];

    const next = applyReconciliation(budget, {
      month: '2026-06',
      confirmed,
      envelopeSurplusDecisions: [],
      plannedExpenseSurplusDecisions: [],
      leftoverFreeBudget: 0,
      leftoverAllocation: null,
      potAvailable: 500,
    });

    expect(next.plannedExpenseSettlements).toHaveLength(1);
    expect(next.plannedExpenseSettlements[0]).toMatchObject({
      plannedExpenseId: 'trip',
      month: '2026-06',
      actualAmount: 480,
      potDeduction: 480,
    });
  });

  it('applies an early planned expense payment from the pot when enough pot is available', () => {
    const confirmed: ConfirmedTransaction[] = [
      {
        id: '1',
        date: '2026-05-10',
        transactionType: 'csv',
        payee: 'Airline',
        description: null,
        amount: -300,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'planned-expense-settlement',
        linkedExpenseId: 'trip',
      },
    ];

    const next = applyReconciliation(budget, {
      month: '2026-05',
      confirmed,
      envelopeSurplusDecisions: [],
      plannedExpenseSurplusDecisions: [],
      leftoverFreeBudget: 0,
      leftoverAllocation: null,
      potAvailable: 500,
    });

    expect(next.plannedExpensePayments).toHaveLength(1);
    expect(next.plannedExpensePayments[0]).toMatchObject({
      plannedExpenseId: 'trip',
      month: '2026-05',
      amount: 300,
      potDeduction: 300,
    });
    expect(next.unplannedExpenses).toHaveLength(0);
  });

  it('books recovery when a CSV pot transfer repays an early free-budget advance', () => {
    const withEarlyPay: BudgetState = {
      ...budget,
      plannedExpensePayments: [
        {
          id: 'pay1',
          plannedExpenseId: 'trip',
          month: '2026-04',
          amount: 500,
          potDeduction: 200,
        },
      ],
    };
    const confirmed: ConfirmedTransaction[] = [
      {
        id: '1',
        date: '2026-05-02',
        transactionType: 'csv',
        payee: '',
        description: null,
        amount: -250,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'set-aside-transfer',
      },
    ];

    const next = applyReconciliation(withEarlyPay, {
      month: '2026-05',
      confirmed,
      envelopeSurplusDecisions: [],
      plannedExpenseSurplusDecisions: [],
      leftoverFreeBudget: 0,
      leftoverAllocation: null,
      potAvailable: 500,
    });

    const recoveryTotal = (next.plannedExpenseRecoveries ?? []).reduce((s, r) => s + r.amount, 0);
    expect(recoveryTotal).toBe(250);
    expect(next.plannedExpenseRecoveries?.[0]).toMatchObject({
      plannedExpenseId: 'trip',
      month: '2026-05',
    });
  });

  it('uses free budget for the uncovered part of an early planned expense payment', () => {
    const confirmed: ConfirmedTransaction[] = [
      {
        id: '1',
        date: '2026-05-10',
        transactionType: 'csv',
        payee: 'Airline',
        description: null,
        amount: -500,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'planned-expense-settlement',
        linkedExpenseId: 'trip',
      },
    ];

    const next = applyReconciliation(budget, {
      month: '2026-05',
      confirmed,
      envelopeSurplusDecisions: [],
      plannedExpenseSurplusDecisions: [],
      leftoverFreeBudget: 0,
      leftoverAllocation: null,
      potAvailable: 200,
    });

    expect(next.plannedExpensePayments[0]).toMatchObject({
      amount: 500,
      potDeduction: 200,
    });
    expect(next.unplannedExpenses[0]).toMatchObject({
      name: 'Trip early payment',
      amount: 300,
      month: '2026-05',
      linkedPlannedExpenseId: 'trip',
    });
  });

  it('does not double-count a manual lock and matching CSV set-aside transfer', () => {
    const augustTripBudget: BudgetState = {
      ...budget,
      plannedExpenses: [
        {
          id: 'trip',
          name: 'Trip',
          amount: 2000,
          targetMonth: '2026-08',
          category: 'travel',
          confidence: 'confirmed',
        },
      ],
      lockIns: [
        { id: 'may-lock', month: '2026-05', lockedAmount: 500, lockState: 'planned' },
      ],
    };
    const confirmed: ConfirmedTransaction[] = [
      {
        id: 'set-aside',
        date: '2026-05-02',
        transactionType: 'csv',
        payee: '',
        description: null,
        amount: -500,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'set-aside-transfer',
      },
      {
        id: 'flight',
        date: '2026-05-10',
        transactionType: 'csv',
        payee: 'Airline',
        description: null,
        amount: -1000,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'planned-expense-settlement',
        linkedExpenseId: 'trip',
      },
    ];

    const next = applyReconciliation(augustTripBudget, {
      month: '2026-05',
      confirmed,
      envelopeSurplusDecisions: [],
      plannedExpenseSurplusDecisions: [],
      leftoverFreeBudget: 0,
      leftoverAllocation: null,
      potAvailable: 500,
    });

    expect(next.lockIns).toEqual([
      expect.objectContaining({
        month: '2026-05',
        lockedAmount: 500,
        lockState: 'confirmed',
      }),
    ]);
    expect(next.plannedExpensePayments[0]).toMatchObject({
      plannedExpenseId: 'trip',
      month: '2026-05',
      amount: 1000,
      potDeduction: 500,
    });
    expect(next.unplannedExpenses[0]).toMatchObject({
      name: 'Trip early payment',
      amount: 500,
      month: '2026-05',
      linkedPlannedExpenseId: 'trip',
    });
  });

  it('settles final-month overrun after earlier payments as unplanned expense', () => {
    const budgetWithPayment: BudgetState = {
      ...budget,
      plannedExpensePayments: [
        {
          id: 'flight',
          plannedExpenseId: 'trip',
          month: '2026-05',
          amount: 300,
          potDeduction: 300,
        },
      ],
    };
    const confirmed: ConfirmedTransaction[] = [
      {
        id: '1',
        date: '2026-06-10',
        transactionType: 'csv',
        payee: 'Hotel',
        description: null,
        amount: -250,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'planned-expense-settlement',
        linkedExpenseId: 'trip',
      },
    ];

    const next = applyReconciliation(budgetWithPayment, {
      month: '2026-06',
      confirmed,
      envelopeSurplusDecisions: [],
      plannedExpenseSurplusDecisions: [],
      leftoverFreeBudget: 0,
      leftoverAllocation: null,
      potAvailable: 200,
    });

    expect(next.plannedExpenseSettlements[0]).toMatchObject({
      actualAmount: 550,
      potDeduction: 200,
      surplusDestination: null,
    });
    expect(next.unplannedExpenses[0]).toMatchObject({
      name: 'Trip overspend',
      amount: 50,
      month: '2026-06',
      linkedPlannedExpenseId: 'trip',
    });
  });

  it('stores total actual paid when final settlement follows an earlier payment', () => {
    const tripBudget: BudgetState = {
      ...budget,
      plannedExpenses: [
        {
          id: 'trip',
          name: 'Trip',
          amount: 2000,
          targetMonth: '2026-08',
          category: 'travel',
          confidence: 'confirmed',
        },
      ],
      plannedExpensePayments: [
        {
          id: 'flight',
          plannedExpenseId: 'trip',
          month: '2026-05',
          amount: 1000,
          potDeduction: 500,
        },
      ],
    };
    const confirmed: ConfirmedTransaction[] = [
      {
        id: 'hotel',
        date: '2026-08-10',
        transactionType: 'csv',
        payee: 'Hotel',
        description: null,
        amount: -1000,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'planned-expense-settlement',
        linkedExpenseId: 'trip',
      },
    ];

    const next = applyReconciliation(tripBudget, {
      month: '2026-08',
      confirmed,
      envelopeSurplusDecisions: [],
      plannedExpenseSurplusDecisions: [],
      leftoverFreeBudget: 0,
      leftoverAllocation: null,
      potAvailable: 1000,
    });

    expect(next.plannedExpenseSettlements[0]).toMatchObject({
      plannedExpenseId: 'trip',
      month: '2026-08',
      actualAmount: 2000,
      potDeduction: 1000,
      surplusDestination: null,
    });
  });

  it('records May pot lock-in and early trip payment for ledger reconciliation scenario', () => {
    const tripBudget: BudgetState = {
      ...budget,
      plannedExpenses: [
        {
          id: 'trip',
          name: 'Trip',
          amount: 800,
          targetMonth: '2026-09',
          category: 'travel',
          confidence: 'confirmed',
        },
      ],
    };
    const confirmed: ConfirmedTransaction[] = [
      {
        id: 'pot',
        date: '2026-05-02',
        transactionType: 'csv',
        payee: '',
        description: null,
        amount: -200,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'set-aside-transfer',
        lockInMonth: '2026-05',
      },
      {
        id: 'trip-pay',
        date: '2026-05-15',
        transactionType: 'csv',
        payee: 'Travel',
        description: null,
        amount: -400,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'planned-expense-settlement',
        linkedExpenseId: 'trip',
      },
    ];

    const next = applyReconciliation(tripBudget, {
      month: '2026-05',
      confirmed,
      envelopeSurplusDecisions: [],
      plannedExpenseSurplusDecisions: [],
      leftoverFreeBudget: 0,
      leftoverAllocation: null,
      potAvailable: 600,
    });

    const mayLockTotal = next.lockIns
      .filter(l => l.month === '2026-05')
      .reduce((sum, l) => sum + l.lockedAmount, 0);
    expect(mayLockTotal).toBe(200);
    expect(next.plannedExpensePayments[0]).toMatchObject({
      plannedExpenseId: 'trip',
      month: '2026-05',
      amount: 400,
      potDeduction: 400,
    });
  });
});
