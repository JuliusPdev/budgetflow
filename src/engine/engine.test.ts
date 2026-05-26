import { describe, it, expect } from 'vitest';
import { runEngine } from './smoothing';
import type { BudgetState, PlannedExpense } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Builds a minimal BudgetState with only the fields needed for a given test.
// Defaults: no fixed expenses, no savings goals, no lock-ins.
function makeState(
  income: number,
  expenses: Pick<PlannedExpense, 'amount' | 'targetMonth'>[]
): BudgetState {
  return {
    income,
    fixedExpenses: [],
    plannedExpenses: expenses.map((e, i) => ({
      id: `expense-${i}`,
      name: `Expense ${i}`,
      amount: e.amount,
      targetMonth: e.targetMonth,
      category: 'general',
      confidence: 'confirmed',
    })),
    savingsGoals: [],
    lockIns: [],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };
}

// Rounds to 2 decimal places so floating-point drift doesn't fail assertions.
function r(n: number): number {
  return Math.round(n * 100) / 100;
}

// Shorthand: find a month result by its "YYYY-MM" string.
function find(months: ReturnType<typeof runEngine>['months'], month: string) {
  const m = months.find(r => r.month === month);
  if (!m) throw new Error(`Month ${month} not found in result`);
  return m;
}

// ─── Engine Unit Tests (docs/test-flow.md) ────────────────────────────────────
// Source of truth: docs/test-flow.md "Engine Unit Tests" section.

describe('Test 1: Back-loaded expenses (equal distribution)', () => {
  const CURRENT = '2026-01';
  const state = makeState(1000, [
    { amount: 100,  targetMonth: '2026-02' },
    { amount: 500,  targetMonth: '2026-05' },
    { amount: 2000, targetMonth: '2026-08' },
  ]);
  const result = runEngine(state, CURRENT);

  it('sets aside €325/month and free budget €675 in the algorithm window', () => {
    const algorithmMonths = result.months.filter(
      m => m.month >= '2026-01' && m.month <= '2026-08'
    );
    for (const m of algorithmMonths) {
      expect(r(m.setAsideRecommended)).toBe(325);
      expect(r(m.freeBudget)).toBe(675);
    }
  });

  it('pot balances: M2=550, M5=1025, M8=0', () => {
    expect(r(find(result.months, '2026-02').potAfter)).toBe(550);
    expect(r(find(result.months, '2026-05').potAfter)).toBe(1025);
    expect(r(find(result.months, '2026-08').potAfter)).toBe(0);
  });
});

describe('Test 2: Front-loaded expenses (constraint forces split)', () => {
  const CURRENT = '2026-01';
  const state = makeState(1000, [
    { amount: 800, targetMonth: '2026-02' },
    { amount: 600, targetMonth: '2026-05' },
    { amount: 400, targetMonth: '2026-08' },
  ]);
  const result = runEngine(state, CURRENT);

  it('M1–M2: rate €400, free €600', () => {
    expect(r(find(result.months, '2026-01').setAsideRecommended)).toBe(400);
    expect(r(find(result.months, '2026-02').setAsideRecommended)).toBe(400);
    expect(r(find(result.months, '2026-01').freeBudget)).toBe(600);
    expect(r(find(result.months, '2026-02').freeBudget)).toBe(600);
  });

  it('M3–M5: rate €200, free €800', () => {
    for (const month of ['2026-03', '2026-04', '2026-05']) {
      expect(r(find(result.months, month).setAsideRecommended)).toBe(200);
      expect(r(find(result.months, month).freeBudget)).toBe(800);
    }
  });

  it('M6–M8: rate €133.33, free €866.67', () => {
    for (const month of ['2026-06', '2026-07', '2026-08']) {
      expect(r(find(result.months, month).setAsideRecommended)).toBe(133.33);
      expect(r(find(result.months, month).freeBudget)).toBe(866.67);
    }
  });

  it('pot ends at 0 after the last expense month', () => {
    expect(r(find(result.months, '2026-08').potAfter)).toBe(0);
  });
});

describe('Test 3: No expenses', () => {
  const result = runEngine(makeState(1000, []), '2026-01');

  it('set-aside €0 and free budget €1,000 every month', () => {
    for (const m of result.months) {
      expect(m.setAsideRecommended).toBe(0);
      expect(m.freeBudget).toBe(1000);
    }
  });
});

describe('Test 4: Single expense', () => {
  const result = runEngine(makeState(1000, [
    { amount: 600, targetMonth: '2026-03' },
  ]), '2026-01');

  it('set-aside €200/month (600/3), free €800, pot ends at 0', () => {
    for (const month of ['2026-01', '2026-02', '2026-03']) {
      expect(r(find(result.months, month).setAsideRecommended)).toBe(200);
      expect(r(find(result.months, month).freeBudget)).toBe(800);
    }
    expect(r(find(result.months, '2026-03').potAfter)).toBe(0);
  });
});

describe('Test 5: Pot carry-forward', () => {
  const state: BudgetState = {
    income: 1000,
    fixedExpenses: [],
    plannedExpenses: [
      {
        id: 'e1',
        name: 'Expense',
        amount: 600,
        targetMonth: '2026-02',
        category: 'general',
        confidence: 'confirmed',
      },
    ],
    savingsGoals: [],
    lockIns: [{ id: 'l1', month: '2025-12', lockedAmount: 400, lockState: 'planned' }],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [],
    plannedExpenseSettlements: [],
  };
  const result = runEngine(state, '2026-01');

  it('only €200 still needed: rate €100/month, free €900', () => {
    expect(r(find(result.months, '2026-01').setAsideRecommended)).toBe(100);
    expect(r(find(result.months, '2026-02').setAsideRecommended)).toBe(100);
    expect(r(find(result.months, '2026-01').freeBudget)).toBe(900);
    expect(r(find(result.months, '2026-02').freeBudget)).toBe(900);
    expect(r(find(result.months, '2026-02').potAfter)).toBe(0);
  });
});

// ─── Verification examples from docs/algorithm.md ─────────────────────────────
// If these fail, the algorithm is wrong. Do not adjust the expected values.

describe('Example A — back-loaded expenses (equal distribution works)', () => {
  // Available: €1,000/month. Expenses: €100 month 2, €500 month 5, €2,000 month 8.
  // Expected: €325/month set-aside. €675 free budget every month.

  const CURRENT = '2026-01';
  const state = makeState(1000, [
    { amount: 100,  targetMonth: '2026-02' },
    { amount: 500,  targetMonth: '2026-05' },
    { amount: 2000, targetMonth: '2026-08' },
  ]);

  const result = runEngine(state, CURRENT);

  it('computes A = 1000 (no fixed costs)', () => {
    expect(result.availablePerMonth).toBe(1000);
  });

  it('returns 15 months (3 past + 12 future through display end)', () => {
    // Past window:   3 months (2025-10 → 2025-12)
    // Future window: 2026-01 → 2026-12 (minDisplayEnd = current + 11 months)
    expect(result.months).toHaveLength(15);
  });

  it('sets aside €325 every month in the algorithm window (2026-01 → 2026-08)', () => {
    const algorithmMonths = result.months.filter(
      m => m.month >= '2026-01' && m.month <= '2026-08'
    );
    expect(algorithmMonths).toHaveLength(8);
    for (const m of algorithmMonths) {
      expect(r(m.setAsideRecommended)).toBe(325);
    }
  });

  it('sets aside €0 in the padding months after the last expense', () => {
    const paddingMonths = result.months.filter(m => m.month > '2026-08');
    expect(paddingMonths.length).toBeGreaterThan(0);
    for (const m of paddingMonths) {
      expect(m.setAsideRecommended).toBe(0);
    }
  });

  it('gives €675 free budget every month in the algorithm window', () => {
    const algorithmMonths = result.months.filter(
      m => m.month >= '2026-01' && m.month <= '2026-08'
    );
    for (const m of algorithmMonths) {
      expect(r(m.freeBudget)).toBe(675);
    }
  });

  it('pot ends at 0 after the last expense month', () => {
    expect(r(find(result.months, '2026-08').potAfter)).toBe(0);
  });

  it('pot never goes negative', () => {
    for (const m of result.months) {
      expect(m.potAfter).toBeGreaterThanOrEqual(-0.001);
    }
  });
});

describe('Example B — front-loaded expenses (constraint forces split)', () => {
  // Available: €1,000/month. Expenses: €800 month 2, €600 month 5, €400 month 8.
  // Expected:
  //   M1–M2: rate €400, free budget €600
  //   M3–M5: rate €200, free budget €800
  //   M6–M8: rate €133.33, free budget €866.67

  const CURRENT = '2026-01';
  const state = makeState(1000, [
    { amount: 800, targetMonth: '2026-02' },
    { amount: 600, targetMonth: '2026-05' },
    { amount: 400, targetMonth: '2026-08' },
  ]);

  const result = runEngine(state, CURRENT);

  it('segment 1 (M1–M2): rate = 400, free budget = 600', () => {
    expect(r(find(result.months, '2026-01').setAsideRecommended)).toBe(400);
    expect(r(find(result.months, '2026-02').setAsideRecommended)).toBe(400);
    expect(r(find(result.months, '2026-01').freeBudget)).toBe(600);
    expect(r(find(result.months, '2026-02').freeBudget)).toBe(600);
  });

  it('segment 2 (M3–M5): rate = 200, free budget = 800', () => {
    expect(r(find(result.months, '2026-03').setAsideRecommended)).toBe(200);
    expect(r(find(result.months, '2026-04').setAsideRecommended)).toBe(200);
    expect(r(find(result.months, '2026-05').setAsideRecommended)).toBe(200);
    expect(r(find(result.months, '2026-03').freeBudget)).toBe(800);
    expect(r(find(result.months, '2026-04').freeBudget)).toBe(800);
    expect(r(find(result.months, '2026-05').freeBudget)).toBe(800);
  });

  it('segment 3 (M6–M8): rate ≈ 133.33, free budget ≈ 866.67', () => {
    expect(r(find(result.months, '2026-06').setAsideRecommended)).toBe(133.33);
    expect(r(find(result.months, '2026-07').setAsideRecommended)).toBe(133.33);
    expect(r(find(result.months, '2026-08').setAsideRecommended)).toBe(133.33);
    expect(r(find(result.months, '2026-06').freeBudget)).toBe(866.67);
    expect(r(find(result.months, '2026-07').freeBudget)).toBe(866.67);
    expect(r(find(result.months, '2026-08').freeBudget)).toBe(866.67);
  });

  it('pot ends at 0 after the last expense month', () => {
    expect(r(find(result.months, '2026-08').potAfter)).toBe(0);
  });

  it('pot never goes negative', () => {
    for (const m of result.months) {
      expect(m.potAfter).toBeGreaterThanOrEqual(-0.001);
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge case — no expenses', () => {
  const state = makeState(1000, []);
  const result = runEngine(state, '2026-01');

  it('returns 15 months (3 past + 12 future)', () => {
    expect(result.months).toHaveLength(15);
  });

  it('set-aside is 0 every month', () => {
    for (const m of result.months) {
      expect(m.setAsideRecommended).toBe(0);
    }
  });

  it('free budget equals full available amount every month (past months use 0 locked)', () => {
    // Past months: freeBudget = A - locked - unplannedTotal = 1000 - 0 - 0 = 1000
    // Future months: freeBudget = A - rate - unplannedTotal = 1000 - 0 - 0 = 1000
    for (const m of result.months) {
      expect(m.freeBudget).toBe(1000);
    }
  });
});

describe('Edge case — expense in current month', () => {
  // No smoothing possible: one saving month = the current month itself.
  // Rate = full expense amount. Free budget = A - expense.
  const state = makeState(1000, [
    { amount: 300, targetMonth: '2026-01' },
  ]);
  const result = runEngine(state, '2026-01');

  it('rate = full expense amount (nothing to spread)', () => {
    expect(r(find(result.months, '2026-01').setAsideRecommended)).toBe(300);
  });

  it('free budget = A - expense', () => {
    expect(r(find(result.months, '2026-01').freeBudget)).toBe(700);
  });

  it('pot shows −expense when nothing is locked yet (expense funded = 0, cost = 300)', () => {
    // The display override uses actual locked (0), so pot = 0 - 300 = -300.
    // This signals to the user: "you have an unfunded expense this month."
    // Once the user locks 300, potAfter becomes 0.
    expect(r(find(result.months, '2026-01').potAfter)).toBe(-300);
  });
});

describe('Edge case — pot carry-forward from past lock-ins', () => {
  // Past month locked €200, no past expenses. Carry = €200.
  // Future expense: €600 in month 2. Net needed = 600 - 200 = 400.
  // Window = 2 months. Rate = 400 / 2 = 200. Free budget = 800.
  const state: BudgetState = {
    income: 1000,
    fixedExpenses: [],
    plannedExpenses: [
      {
        id: 'e1',
        name: 'Trip',
        amount: 600,
        targetMonth: '2026-02',
        category: 'travel',
        confidence: 'confirmed',
      },
    ],
    savingsGoals: [],
    lockIns: [
      { id: 'l1', month: '2025-12', lockedAmount: 200, lockState: 'planned' },
    ],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };

  const result = runEngine(state, '2026-01');

  it('rate accounts for pot carry (400 / 2 = 200)', () => {
    expect(r(find(result.months, '2026-01').setAsideRecommended)).toBe(200);
    expect(r(find(result.months, '2026-02').setAsideRecommended)).toBe(200);
  });

  it('pot ends at 0 after expense month', () => {
    expect(r(find(result.months, '2026-02').potAfter)).toBe(0);
  });
});

describe('Edge case — fixed expenses reduce A', () => {
  // Income 2000, fixed 500, no savings goals → A = 1500.
  // Expense: €900 in month 3. Rate = 900/3 = 300. Free budget = 1200.
  const state: BudgetState = {
    income: 2000,
    fixedExpenses: [
      { id: 'f1', name: 'Rent', amount: 500, category: 'housing', isEnvelope: false, actualAmount: null },
    ],
    plannedExpenses: [
      {
        id: 'e1',
        name: 'Holiday',
        amount: 900,
        targetMonth: '2026-03',
        category: 'travel',
        confidence: 'confirmed',
      },
    ],
    savingsGoals: [],
    lockIns: [],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };

  const result = runEngine(state, '2026-01');

  it('availablePerMonth = income - fixed = 1500', () => {
    expect(result.availablePerMonth).toBe(1500);
  });

  it('rate = 300, free budget = 1200', () => {
    expect(r(find(result.months, '2026-01').setAsideRecommended)).toBe(300);
    expect(r(find(result.months, '2026-01').freeBudget)).toBe(1200);
  });
});

describe('Carry-forward free budget displays as income carryover', () => {
  const state: BudgetState = {
    income: 2000,
    fixedExpenses: [],
    plannedExpenses: [],
    savingsGoals: [],
    lockIns: [],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [],
    plannedExpenseSettlements: [],
    reconciledMonths: ['2026-01'],
    monthCarryAdjustments: [
      {
        month: '2026-02',
        freeBudgetBoost: 250,
        envelopeBoosts: {},
      },
    ],
  };

  const result = runEngine(state, '2026-02');
  const february = find(result.months, '2026-02');

  it('exposes the carried amount on the month result', () => {
    expect(february.incomeCarryover).toBe(250);
  });

  it('adds carryover to free budget', () => {
    expect(february.freeBudget).toBe(2250);
  });
});

describe('Planned expense payments reduce the remaining amount to fund', () => {
  const state: BudgetState = {
    income: 1000,
    fixedExpenses: [],
    plannedExpenses: [
      {
        id: 'trip',
        name: 'Trip',
        amount: 1000,
        targetMonth: '2026-03',
        category: 'travel',
        confidence: 'confirmed',
      },
    ],
    savingsGoals: [],
    lockIns: [
      { id: 'lock-jan', month: '2026-01', lockedAmount: 500, lockState: 'confirmed' },
    ],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [
      {
        id: 'flight',
        plannedExpenseId: 'trip',
        month: '2026-01',
        amount: 500,
        potDeduction: 500,
      },
    ],
    plannedExpenseSettlements: [],
    reconciledMonths: ['2026-01'],
    monthCarryAdjustments: [],
  };

  const result = runEngine(state, '2026-02');

  it('only smooths the unpaid remainder across future months', () => {
    expect(r(find(result.months, '2026-02').setAsideRecommended)).toBe(250);
    expect(r(find(result.months, '2026-03').setAsideRecommended)).toBe(250);
  });

  it('still ends the pot at zero after the target month', () => {
    expect(r(find(result.months, '2026-03').potAfter)).toBe(0);
  });

  it('shows the physical pot after the early payment has actually left', () => {
    expect(r(find(result.months, '2026-02').physicalPotAfter)).toBe(0);
  });
});

describe('Physical pot display ignores unreconciled past planned expenses', () => {
  const baseState: BudgetState = {
    income: 1000,
    fixedExpenses: [],
    plannedExpenses: [
      {
        id: 'trip',
        name: 'Trip',
        amount: 1000,
        targetMonth: '2026-02',
        category: 'travel',
        confidence: 'confirmed',
      },
    ],
    savingsGoals: [],
    lockIns: [
      { id: 'lock-jan', month: '2026-01', lockedAmount: 500, lockState: 'confirmed' },
    ],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };

  it('keeps the physical pot at the locked amount until a payment or settlement exists', () => {
    const result = runEngine(baseState, '2026-03');
    expect(r(find(result.months, '2026-03').physicalPotAfter)).toBe(500);
  });

  it('still forecasts the overdue obligation as needing funding now', () => {
    const result = runEngine(baseState, '2026-03');
    expect(r(find(result.months, '2026-03').setAsideRecommended)).toBe(500);
  });

  it('reduces the physical pot once a final settlement proves money left', () => {
    const result = runEngine(
      {
        ...baseState,
        plannedExpenseSettlements: [
          {
            id: 'settle-trip',
            plannedExpenseId: 'trip',
            month: '2026-02',
            actualAmount: 1000,
            potDeduction: 1000,
            surplusDestination: null,
          },
        ],
        reconciledMonths: ['2026-02'],
      },
      '2026-03',
    );

    expect(r(find(result.months, '2026-03').physicalPotAfter)).toBe(-500);
  });
});

describe('May early Trip payment reduces future set-aside amounts', () => {
  const state: BudgetState = {
    income: 1000,
    fixedExpenses: [],
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
    savingsGoals: [],
    lockIns: [
      { id: 'may-lock', month: '2026-05', lockedAmount: 500, lockState: 'confirmed' },
    ],
    unplannedExpenses: [
      {
        id: 'flight-free-portion',
        name: 'Trip early payment',
        amount: 500,
        month: '2026-05',
        category: 'travel',
        linkedPlannedExpenseId: 'trip',
      },
    ],
    envelopeActualizations: [],
    plannedExpensePayments: [
      {
        id: 'flight-payment',
        plannedExpenseId: 'trip',
        month: '2026-05',
        amount: 1000,
        potDeduction: 500,
      },
    ],
    plannedExpenseSettlements: [],
    reconciledMonths: ['2026-05'],
    monthCarryAdjustments: [],
  };

  const result = runEngine(state, '2026-06');

  it('smooths only the remaining €1000 over June through August', () => {
    for (const month of ['2026-06', '2026-07', '2026-08']) {
      expect(r(find(result.months, month).setAsideRecommended)).toBe(333.33);
    }
  });

  it('shows the May free-budget portion as past spending linked to the Trip', () => {
    const may = find(result.months, '2026-05');
    expect(may.unplannedTotal).toBe(500);
    expect(may.unplannedExpenses[0]).toMatchObject({
      name: 'Trip early payment',
      linkedPlannedExpenseId: 'trip',
    });
  });
});

describe('Early payment recovery increases set-aside until repaid', () => {
  const state: BudgetState = {
    income: 3000,
    fixedExpenses: [],
    plannedExpenses: [
      {
        id: 'trip',
        name: 'Trip',
        amount: 800,
        targetMonth: '2026-05',
        category: 'travel',
        confidence: 'confirmed',
      },
    ],
    savingsGoals: [],
    lockIns: [],
    unplannedExpenses: [
      {
        id: 'free-portion',
        name: 'Trip early payment',
        amount: 200,
        month: '2026-02',
        category: 'travel',
        linkedPlannedExpenseId: 'trip',
      },
    ],
    envelopeActualizations: [],
    plannedExpensePayments: [
      {
        id: 'early-pay',
        plannedExpenseId: 'trip',
        month: '2026-02',
        amount: 400,
        potDeduction: 200,
      },
    ],
    plannedExpenseRecoveries: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };

  const result = runEngine(state, '2026-03');

  it('allocates set-aside to recovery before funding while €200 is still owed', () => {
    const march = find(result.months, '2026-03');
    expect(r(march.setAsideRecovery)).toBeGreaterThan(0);
    expect(r(march.setAsideRecovery + march.setAsideFunding)).toBe(r(march.setAsideRecommended));
  });

  it('records recovery against Trip when lock-in recoveries exist', () => {
    const withRecovery: BudgetState = {
      ...state,
      lockIns: [{ id: 'l1', month: '2026-03', lockedAmount: 200, lockState: 'planned' }],
      plannedExpenseRecoveries: [
        { id: 'r1', plannedExpenseId: 'trip', month: '2026-03', amount: 200 },
      ],
    };
    const after = runEngine(withRecovery, '2026-04');
    const april = find(after.months, '2026-04');
    expect(r(april.setAsideRecovery)).toBe(0);
    expect(r(april.setAsideFunding)).toBe(r(april.setAsideRecommended));
  });
});
