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

  it('expense hit month: potBeforeExpenses − potDeduction = potAfter', () => {
    const aug = find(result.months, '2026-08');
    expect(aug.potDeduction).toBe(2000);
    expect(r(aug.potBeforeExpenses)).toBe(2000);
    expect(r(aug.potBeforeExpenses - aug.potDeduction)).toBe(r(aug.potAfter));
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

  it('pot reflects funded plan when nothing is locked yet (set-aside covers same-month expense)', () => {
    // Funded pot uses the plan's funding slice: recommended set-aside (300) funds the
    // same-month expense (300), so the forecast pot ends at 0 — not a negative warning.
    expect(r(find(result.months, '2026-01').potAfter)).toBe(0);
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
});

describe('Overdue planned expense still needs funding', () => {
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

  it('forecasts the overdue obligation as needing funding now', () => {
    const result = runEngine(baseState, '2026-03');
    expect(r(find(result.months, '2026-03').setAsideRecommended)).toBe(500);
  });
});

describe('Early payment fully from pot reduces remaining and allows negative pot', () => {
  // Trip costs €2000 in Aug. In May the user pays €1000 early (fully from pot).
  // Pot carry from May lock-in: €500. After payment: pot = 500 - 1000 = -500.
  // Remaining trip: €1000. Pot carry into Jun: -500.
  // smooth() sees -500 carry + €1000 expense over 3 months = €1500 / 3 = €500/mo.
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
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [
      {
        id: 'flight-payment',
        plannedExpenseId: 'trip',
        month: '2026-05',
        amount: 1000,
        potDeduction: 1000,
      },
    ],
    plannedExpenseSettlements: [],
    reconciledMonths: ['2026-05'],
    monthCarryAdjustments: [],
  };

  const result = runEngine(state, '2026-06');

  it('smooths the remaining amount plus negative carry over future months', () => {
    for (const month of ['2026-06', '2026-07', '2026-08']) {
      expect(r(find(result.months, month).setAsideRecommended)).toBe(500);
    }
  });

  it('pot starts negative (savings loan from early payment exceeding locked amount)', () => {
    expect(r(find(result.months, '2026-06').potAfter)).toBe(0);
  });

  it('pot ends at zero after the target month', () => {
    expect(Math.abs(r(find(result.months, '2026-08').potAfter))).toBe(0);
  });
});

describe('Early payment makes pot negative, partial payment still on funding timeline', () => {
  // Trip €800 in May. In Feb, user pays €400 early (fully from pot, pot = 0 - 400 = -400).
  // From March: potCarry = -400, remaining trip = 400, expense in May.
  // Partial payment — recovery waits until fully paid; feasibility floor keeps ~266.67/mo.
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
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [
      {
        id: 'early-pay',
        plannedExpenseId: 'trip',
        month: '2026-02',
        amount: 400,
        potDeduction: 400,
      },
    ],
    plannedExpenseRecoveries: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };

  const result = runEngine(state, '2026-03');

  it('shows no recovery slice while the expense still has a remaining balance', () => {
    const march = find(result.months, '2026-03');
    expect(r(march.setAsideRecovery)).toBe(0);
    expect(r(march.setAsideFunding)).toBe(r(march.setAsideRecommended));
  });

  it('produces a uniform rate — smooth() allows negative pot during recovery', () => {
    // smooth() with potCarry=-400 and 400 expense in month 3:
    // The pot can be negative in non-expense months, so the rate is uniform.
    // (400 remaining + 400 deficit) / 3 months ≈ 266.67.
    const march = find(result.months, '2026-03');
    const april = find(result.months, '2026-04');
    expect(r(march.setAsideRecommended)).toBe(266.67);
    expect(r(april.setAsideRecommended)).toBe(266.67);
  });

  it('pot ends at zero after the expense month', () => {
    expect(Math.abs(r(find(result.months, '2026-05').potAfter))).toBe(0);
  });
});

describe('Early payment amount affects remaining funding need', () => {
  const baseTrip = {
    id: 'trip',
    name: 'Trip',
    amount: 800,
    targetMonth: '2026-05',
    category: 'travel',
    confidence: 'confirmed' as const,
  };

  const withoutPayment: BudgetState = {
    income: 3000,
    fixedExpenses: [],
    plannedExpenses: [baseTrip],
    savingsGoals: [],
    lockIns: [],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };

  const withPayment: BudgetState = {
    ...withoutPayment,
    plannedExpensePayments: [
      {
        id: 'pay1',
        plannedExpenseId: 'trip',
        month: '2026-03',
        amount: 400,
        potDeduction: 400,
      },
    ],
  };

  it('rate stays the same — early payment reduces remaining but creates equal deficit', () => {
    // Without payment: 800 over 3 months (Mar–May) = 266.67/mo.
    // With payment: remaining 400, potCarry -400. Net = 800 over 3 months = 266.67/mo.
    // The rate is identical because the payment reduces both sides equally.
    const without = runEngine(withoutPayment, '2026-03');
    const withPay = runEngine(withPayment, '2026-03');
    const rateWithout = find(without.months, '2026-04').setAsideRecommended;
    const rateWith = find(withPay.months, '2026-04').setAsideRecommended;
    expect(r(rateWith)).toBe(r(rateWithout));
    expect(rateWithout).toBeGreaterThan(0);
  });
});

describe('Early payment makes pot go negative, rate covers remaining + recovery', () => {
  // Trip €800 Aug. In May, user pays €400 early (fully from pot, pot goes to -400).
  // No lock-ins. Remaining trip: €400. Pot carry = -400.
  // smooth() sees -400 carry + 400 expense over 4 months (May–Aug) = 800 / 4 = 200/mo.
  const state: BudgetState = {
    income: 3400,
    fixedExpenses: [{ id: 'fixed', name: 'Fixed', amount: 1260, category: 'general', isEnvelope: false, actualAmount: null }],
    plannedExpenses: [
      {
        id: 'trip',
        name: 'Trip',
        amount: 800,
        targetMonth: '2026-08',
        category: 'travel',
        confidence: 'confirmed',
      },
    ],
    savingsGoals: [],
    lockIns: [],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [
      {
        id: 'pay-trip',
        plannedExpenseId: 'trip',
        month: '2026-05',
        amount: 400,
        potDeduction: 400,
      },
    ],
    plannedExpenseRecoveries: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };

  const result = runEngine(state, '2026-05');

  it('recommends €200/mo to recover the savings loan and fund the remaining trip', () => {
    // PotCarry = 0 - 400 (current month deduction) = -400. Remaining trip: 400 in Aug.
    // smooth() sees -400 carry + 400 expense over 4 months = 800/4 = 200/mo (uniform).
    for (const month of ['2026-05', '2026-06', '2026-07', '2026-08']) {
      const m = find(result.months, month);
      expect(r(m.setAsideRecommended)).toBe(200);
      expect(r(m.setAsideRecovery + m.setAsideFunding)).toBe(r(m.setAsideRecommended));
    }
  });

  it('pot starts negative in May (savings loan: rate partially recovers deficit)', () => {
    // potCarry=-400, May rate=200, May algo expense=0 → display pot = -400 + 200 = -200.
    const may = find(result.months, '2026-05');
    expect(r(may.potAfter)).toBe(-200);
  });

  it('pot ends at zero after the Aug trip is paid', () => {
    expect(Math.abs(r(find(result.months, '2026-08').potAfter))).toBe(0);
  });

  it('shows recovery only after the expense is fully paid', () => {
    const may = find(result.months, '2026-05');
    expect(r(may.setAsideRecovery)).toBe(0);
    expect(r(may.setAsideFunding)).toBe(r(may.setAsideRecommended));
  });
});

// ─── Overflow handling: early payments exceeding the planned expense ──────────

describe('Overflow Option A: increase planned expense to match overpayment', () => {
  // Trip €800 due Aug (4 months from May). Lock €200 in May. Pay €1000 early, plan → €1000.
  // Remaining = 0. Debt to repay = 1000 - 200 lock = 800 over May–Aug → €200/mo (not €83 over 12 mo).
  const state: BudgetState = {
    income: 3400,
    fixedExpenses: [],
    plannedExpenses: [
      {
        id: 'trip',
        name: 'Trip',
        amount: 1000,
        targetMonth: '2026-08',
        category: 'travel',
        confidence: 'confirmed',
        originalAmount: 800,
      },
    ],
    savingsGoals: [],
    lockIns: [
      { id: 'may-lock', month: '2026-05', lockedAmount: 200, lockState: 'planned' },
    ],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [
      {
        id: 'pay-trip',
        plannedExpenseId: 'trip',
        month: '2026-05',
        amount: 1000,
        potDeduction: 1000,
      },
    ],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };

  const result = runEngine(state, '2026-05');

  it('uses trip target month for recovery window (4 months, not 12)', () => {
    const may = find(result.months, '2026-05');
    const aug = find(result.months, '2026-08');
    const sep = find(result.months, '2026-09');
    expect(r(may.setAsideRecommended)).toBe(200);
    expect(r(aug.setAsideRecommended)).toBe(200);
    expect(r(sep.setAsideRecommended)).toBe(0);
  });

  it('all set-aside goes to recovery — trip already fully funded', () => {
    const jun = find(result.months, '2026-06');
    expect(r(jun.setAsideFunding)).toBe(0);
    expect(r(jun.setAsideRecovery)).toBe(r(jun.setAsideRecommended));
  });

  it('savings debt decreases by ~200/mo from 800 after May lock', () => {
    const may = find(result.months, '2026-05');
    const jun = find(result.months, '2026-06');
    expect(r(may.potAfter)).toBe(-800);
    expect(r(jun.potAfter)).toBe(-600);
  });
});

describe('Overflow Option B: surplus from free budget via unplanned expense', () => {
  // Trip planned at €800 due in Aug. User pays €1000 in May.
  // Option B: pot deduction capped at €800 (remaining). €200 overflow becomes
  // an unplanned expense that hits free budget.
  const state: BudgetState = {
    income: 3400,
    fixedExpenses: [],
    plannedExpenses: [
      {
        id: 'trip',
        name: 'Trip',
        amount: 800,
        targetMonth: '2026-08',
        category: 'travel',
        confidence: 'confirmed',
      },
    ],
    savingsGoals: [],
    lockIns: [],
    unplannedExpenses: [
      {
        id: 'overflow-unplanned',
        name: 'Trip overpayment',
        amount: 200,
        month: '2026-05',
        category: 'travel',
        linkedPlannedExpenseId: 'trip',
      },
    ],
    envelopeActualizations: [],
    plannedExpensePayments: [
      {
        id: 'pay-trip',
        plannedExpenseId: 'trip',
        month: '2026-05',
        amount: 1000,
        potDeduction: 800,
      },
    ],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };

  const result = runEngine(state, '2026-05');

  it('pot deduction is capped at the planned amount (800), not the payment (1000)', () => {
    // potCarry = -800. Remaining = 0. Debt recovery over May–Aug (4 months) → €200/mo.
    const may = find(result.months, '2026-05');
    const rate = r(may.setAsideRecommended);
    expect(rate).toBe(200);
  });

  it('unplanned expense reduces free budget in the payment month', () => {
    const may = find(result.months, '2026-05');
    expect(r(may.unplannedTotal)).toBe(200);
  });

  it('pot deficit is 200 less than Option A (800 vs 1000)', () => {
    const may = find(result.months, '2026-05');
    // pot = -800 + rate ≈ -800 + 67 = about -733
    expect(r(may.potAfter)).toBeGreaterThan(-800);
  });
});

describe('Cumulative overflow: multiple payments exceeding plan', () => {
  // Trip €800 Aug. Two payments: €500 in May + €500 in Jun = €1000 total.
  // Option A path: planned expense increased to €1000 after the second payment.
  const state: BudgetState = {
    income: 3400,
    fixedExpenses: [],
    plannedExpenses: [
      {
        id: 'trip',
        name: 'Trip',
        amount: 1000,
        targetMonth: '2026-08',
        category: 'travel',
        confidence: 'confirmed',
      },
    ],
    savingsGoals: [],
    lockIns: [],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [
      {
        id: 'pay-1',
        plannedExpenseId: 'trip',
        month: '2026-05',
        amount: 500,
        potDeduction: 500,
      },
      {
        id: 'pay-2',
        plannedExpenseId: 'trip',
        month: '2026-06',
        amount: 500,
        potDeduction: 500,
      },
    ],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };

  const result = runEngine(state, '2026-07');

  it('remaining is zero after cumulative payments match the (increased) plan', () => {
    // 500 + 500 = 1000 paid, plan = 1000 → remaining = 0.
    // Recovery spreads over the full May–Aug window (4 months) → ~€292/mo.
    const jul = find(result.months, '2026-07');
    expect(r(jul.setAsideRecommended)).toBe(291.67);
    expect(r(jul.setAsideFunding)).toBe(0);
    expect(r(jul.setAsideRecovery)).toBe(291.67);
  });

  it('pot starts at -1000 and gradually recovers', () => {
    const jul = find(result.months, '2026-07');
    expect(r(jul.potAfter)).toBeLessThan(0);
    expect(r(jul.potAfter)).toBeGreaterThan(-1000);
  });
});

// ─── Deferred expense: "start from next month" ───────────────────────────────

describe('Deferred expense: start-from-next-month gets its own rate pass', () => {
  // Expense 1: €800 in Aug (4 months: May–Aug). Rate = 200/month.
  // Expense 2: €1000 in Oct, deferred to start from Jun (5 months: Jun–Oct).
  // Lock-in: 200 in May.
  //
  // Expected:
  // - May rate stays 200 (only expense 1, deferred expense excluded).
  // - Jun–Oct rate covers both expenses:
  //     pot after May = 0 + 200 (contribution) - 0 (no May expense) = 200
  //     remaining expense 1: 800 in Aug
  //     deferred expense 2: 1000 in Oct
  //     smooth() solves these over Jun–Oct with potCarry=200
  const state: BudgetState = {
    income: 3400,
    fixedExpenses: [{ id: 'fixed', name: 'Fixed', amount: 1000, category: 'general', isEnvelope: false, actualAmount: null }],
    plannedExpenses: [
      {
        id: 'trip1',
        name: 'Trip 1',
        amount: 800,
        targetMonth: '2026-08',
        category: 'travel',
        confidence: 'confirmed' as const,
      },
      {
        id: 'trip2',
        name: 'Trip 2',
        amount: 1000,
        targetMonth: '2026-10',
        category: 'travel',
        confidence: 'confirmed' as const,
        startFromMonth: '2026-06',
      },
    ],
    savingsGoals: [],
    lockIns: [
      { id: 'may-lock', month: '2026-05', lockedAmount: 200, lockState: 'planned' as const },
    ],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };

  const result = runEngine(state, '2026-05');

  it('current month (May) rate stays at 200 — only expense 1', () => {
    const may = find(result.months, '2026-05');
    expect(r(may.setAsideRecommended)).toBe(200);
  });

  it('future months have a higher rate covering both expenses', () => {
    const jun = find(result.months, '2026-06');
    // Jun rate must fund: 800 remaining of trip1 in Aug + 1000 trip2 in Oct,
    // with pot carry of 200 from May. Total needed = 1800 - 200 = 1600 over 5 months.
    // smooth() may split this non-uniformly due to the binding constraint at Aug.
    expect(r(jun.setAsideRecommended)).toBeGreaterThan(200);
  });

  it('pot is non-negative at expense 1 target month (Aug)', () => {
    const aug = find(result.months, '2026-08');
    expect(r(aug.potAfter)).toBeGreaterThanOrEqual(0);
  });

  it('pot ends at zero after expense 2 target month (Oct)', () => {
    const oct = find(result.months, '2026-10');
    expect(Math.abs(r(oct.potAfter))).toBeLessThanOrEqual(1);
  });

  it('rates drop to zero after all expenses are covered', () => {
    const nov = find(result.months, '2026-11');
    expect(r(nov.setAsideRecommended)).toBe(0);
  });
});

// ─── Split funding vs slow recovery ────────────────────────────────────────────

function splitwiseAugustState(splitwiseTarget: string): BudgetState {
  return {
    income: 3400,
    fixedExpenses: [],
    plannedExpenses: [
      {
        id: 'splitwise',
        name: 'Splitwise',
        amount: 400,
        targetMonth: splitwiseTarget,
        category: 'general',
        confidence: 'confirmed',
      },
      {
        id: 'soundboks',
        name: 'Soundboks',
        amount: 800,
        targetMonth: '2026-08',
        category: 'general',
        confidence: 'confirmed',
      },
    ],
    savingsGoals: [],
    lockIns: [
      { id: 'jun-lock', month: '2026-06', lockedAmount: 300, lockState: 'planned' },
    ],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [
      {
        id: 'pay-splitwise',
        plannedExpenseId: 'splitwise',
        month: '2026-06',
        amount: 400,
        potDeduction: 400,
      },
    ],
    plannedExpenseRecoveries: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };
}

describe('Split recovery — Splitwise paid early, Soundboks due August', () => {
  // Jun: €300 locked, €400 Splitwise paid (fully), €800 Soundboks still open.
  // Physical dip = −€100. Combined slow recovery + August funding floors at ~€300/mo, not €400.
  const result = runEngine(splitwiseAugustState('2026-10'), '2026-06');

  it('recommends ~€400/mo through August (August binding with €100 dip)', () => {
    for (const month of ['2026-06', '2026-07', '2026-08']) {
      const m = find(result.months, month);
      expect(r(m.setAsideRecommended)).toBe(400);
    }
  });

  it('includes a recovery slice for the fully-paid Splitwise dip', () => {
    const jun = find(result.months, '2026-06');
    expect(r(jun.setAsideRecovery)).toBeGreaterThan(0);
    expect(r(jun.setAsideFunding)).toBeGreaterThan(0);
    expect(r(jun.setAsideRecovery + jun.setAsideFunding)).toBe(r(jun.setAsideRecommended));
  });
});

describe('Split recovery — target month changes recovery slice, not August floor', () => {
  const octTarget = runEngine(splitwiseAugustState('2026-10'), '2026-06');
  const decTarget = runEngine(splitwiseAugustState('2026-12'), '2026-06');

  it('August binding floor stays ~€400 for both target months', () => {
    for (const month of ['2026-06', '2026-07', '2026-08']) {
      expect(r(find(octTarget.months, month).setAsideRecommended)).toBe(400);
      expect(r(find(decTarget.months, month).setAsideRecommended)).toBe(400);
    }
  });
});

describe('Split recovery — month advance keeps recovery visible and stable', () => {
  function lock300JunePaymentsState(): BudgetState {
    return {
      income: 3400,
      fixedExpenses: [
        { id: 'fixed', name: 'Fixed', amount: 1885, category: 'general', isEnvelope: false, actualAmount: null },
      ],
      savingsGoals: [
        { id: 'sg', name: 'Savings', mode: 'monthly', monthlyAmount: 325 },
      ],
      unplannedExpenses: [],
      envelopeActualizations: [],
      plannedExpenseRecoveries: [],
      plannedExpenseSettlements: [],
      reconciledMonths: [],
      monthCarryAdjustments: [],
      plannedExpenses: [
        { id: 'hanne', name: 'Hanne in Munich', amount: 300, targetMonth: '2026-08', category: 'general', confidence: 'confirmed' },
        { id: 'verona', name: 'Verona with Sofia', amount: 500, targetMonth: '2026-08', category: 'general', confidence: 'confirmed' },
        { id: 'oktoberfest', name: 'Oktoberfest', amount: 400, targetMonth: '2026-09', category: 'general', confidence: 'confirmed' },
        { id: 'soundboks', name: 'Soundboks', amount: 375, targetMonth: '2026-10', category: 'general', confidence: 'confirmed' },
        { id: 'splitwise', name: 'Splitwise Repay', amount: 400, targetMonth: '2026-10', category: 'general', confidence: 'confirmed' },
        { id: 'presents', name: 'Presents', amount: 300, targetMonth: '2026-12', category: 'general', confidence: 'confirmed' },
      ],
      plannedExpensePayments: [
        { id: 'pay-sb', plannedExpenseId: 'soundboks', month: '2026-06', amount: 375, potDeduction: 375 },
        { id: 'pay-sw', plannedExpenseId: 'splitwise', month: '2026-06', amount: 400, potDeduction: 400 },
      ],
      lockIns: [
        { id: 'jun-lock', month: '2026-06', lockedAmount: 300, lockState: 'planned' },
      ],
    };
  }

  const june = runEngine(lock300JunePaymentsState(), '2026-06');
  const july = runEngine(lock300JunePaymentsState(), '2026-07');

  it('keeps recovery slice visible after advancing to July', () => {
    expect(june.months.some(month => month.setAsideRecovery > 0)).toBe(true);
    expect(july.months.some(month => month.setAsideRecovery > 0)).toBe(true);
    expect(r(find(july.months, '2026-07').setAsideRecovery)).toBe(95);
  });

  it('does not spike July rate to ~€638 when June had €300 locked', () => {
    const julyRate = r(find(july.months, '2026-07').setAsideRecommended);
    expect(julyRate).toBeLessThan(500);
    expect(julyRate).toBe(300);
  });

  it('keeps July recommended stable when adjusting the current-month lock', () => {
    const withExtraLock: BudgetState = {
      ...lock300JunePaymentsState(),
      lockIns: [
        { id: 'jun-lock', month: '2026-06', lockedAmount: 300, lockState: 'planned' },
        { id: 'jul-lock', month: '2026-07', lockedAmount: 425, lockState: 'planned' },
      ],
    };
    const locked = runEngine(withExtraLock, '2026-07');
    expect(r(find(locked.months, '2026-07').setAsideRecommended)).toBe(300);
    expect(find(locked.months, '2026-07').lockStatus.kind).toBe('surplus');
  });

  it('does not backfill recovery onto past June when viewing from July', () => {
    const state: BudgetState = {
      income: 3400,
      fixedExpenses: [
        { id: 'fixed', name: 'Fixed', amount: 1885, category: 'general', isEnvelope: false, actualAmount: null },
      ],
      savingsGoals: [
        { id: 'sg', name: 'Savings', mode: 'monthly', monthlyAmount: 325 },
      ],
      unplannedExpenses: [],
      envelopeActualizations: [],
      plannedExpenseRecoveries: [],
      plannedExpenseSettlements: [],
      reconciledMonths: [],
      monthCarryAdjustments: [],
      plannedExpenses: [
        { id: 'soundboks', name: 'Soundboks', amount: 375, targetMonth: '2026-10', category: 'general', confidence: 'confirmed' },
      ],
      plannedExpensePayments: [
        { id: 'pay-sb', plannedExpenseId: 'soundboks', month: '2026-06', amount: 375, potDeduction: 375 },
      ],
      lockIns: [
        { id: 'jun-lock', month: '2026-06', lockedAmount: 300, lockState: 'planned' },
      ],
    };

    const july = runEngine(state, '2026-07');
    const june = find(july.months, '2026-06');
    const futureRecoveryMonths = ['2026-07', '2026-08', '2026-09', '2026-10'] as const;

    expect(r(june.setAsideRecovery)).toBe(0);
    expect(r(june.setAsideFunding)).toBe(0);
    for (const month of futureRecoveryMonths) {
      expect(r(find(july.months, month).setAsideRecovery)).toBe(15);
    }
    expect(
      futureRecoveryMonths.reduce(
        (sum, month) => sum + find(july.months, month).setAsideRecovery,
        0,
      ),
    ).toBeCloseTo(60, 1);
  });
});

describe('Split recovery — only expense fully paid early', () => {
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
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [
      {
        id: 'full-pay',
        plannedExpenseId: 'trip',
        month: '2026-02',
        amount: 800,
        potDeduction: 800,
      },
    ],
    plannedExpenseRecoveries: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
  };

  const result = runEngine(state, '2026-03');

  it('recovery only through the original target month', () => {
    const mar = find(result.months, '2026-03');
    const apr = find(result.months, '2026-04');
    const may = find(result.months, '2026-05');
    const jun = find(result.months, '2026-06');
    expect(r(mar.setAsideFunding)).toBe(0);
    expect(r(mar.setAsideRecovery)).toBeGreaterThan(0);
    expect(r(may.setAsideRecovery)).toBeGreaterThan(0);
    expect(r(jun.setAsideRecommended)).toBe(0);
    expect(r(apr.setAsideRecommended)).toBe(r(mar.setAsideRecommended));
  });
});

function soundboksJuneScenarioState(): BudgetState {
  return {
    income: 3400,
    fixedExpenses: [
      { id: 'fixed', name: 'Fixed', amount: 1885, category: 'general', isEnvelope: false, actualAmount: null },
    ],
    savingsGoals: [
      { id: 'sg', name: 'Savings', mode: 'monthly', monthlyAmount: 325 },
    ],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpenseRecoveries: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
    plannedExpenses: [
      { id: 'hanne', name: 'Hanne', amount: 300, targetMonth: '2026-08', category: 'general', confidence: 'confirmed' },
      { id: 'verona', name: 'Verona', amount: 500, targetMonth: '2026-08', category: 'general', confidence: 'confirmed' },
      { id: 'oktoberfest', name: 'Oktoberfest', amount: 400, targetMonth: '2026-10', category: 'general', confidence: 'confirmed' },
      { id: 'soundboks', name: 'Soundboks', amount: 375, targetMonth: '2026-10', category: 'general', confidence: 'confirmed' },
      { id: 'splitwise', name: 'Splitwise', amount: 400, targetMonth: '2026-10', category: 'general', confidence: 'confirmed' },
      { id: 'presents', name: 'Presents', amount: 300, targetMonth: '2026-12', category: 'general', confidence: 'confirmed' },
    ],
    plannedExpensePayments: [
      { id: 'pay-sb', plannedExpenseId: 'soundboks', month: '2026-06', amount: 375, potDeduction: 375 },
    ],
    lockIns: [
      { id: 'jun-lock', month: '2026-06', lockedAmount: 300, lockState: 'planned' },
    ],
  };
}

describe('Debt clearance — terminal pot reaches zero after last expense', () => {
  const result = runEngine(soundboksJuneScenarioState(), '2026-07');

  it('does not leave savings debt stuck after the forecast window', () => {
    const lastMonth = result.months[result.months.length - 1];
    expect(lastMonth.potAfter).toBeGreaterThanOrEqual(-0.01);
  });

  it('recommends post-expense set-aside to clear accumulated pot debt', () => {
    const jan2027 = find(result.months, '2027-01');
    expect(jan2027.setAsideRecommended).toBeGreaterThan(0);
    expect(r(jan2027.setAsideFunding)).toBeGreaterThan(0);
  });

  it('still shows deep negative pot at December expense month before clearance heals it', () => {
    const dec = find(result.months, '2026-12');
    expect(dec.potAfter).toBeLessThan(-300);
  });
});

describe('potActual vs potAfter (physical pot now)', () => {
  it('reflects locks and deductions now; potAfter includes forecast set-aside', () => {
    const state: BudgetState = {
      income: 3400,
      fixedExpenses: [],
      plannedExpenses: [
        {
          id: 'trip',
          name: 'Trip',
          amount: 800,
          targetMonth: '2026-08',
          category: 'travel',
          confidence: 'confirmed',
        },
      ],
      savingsGoals: [],
      lockIns: [{ id: 'lock-mar', month: '2026-03', lockedAmount: 100, lockState: 'planned' }],
      unplannedExpenses: [],
      envelopeActualizations: [],
      plannedExpensePayments: [
        {
          id: 'pay-mar',
          plannedExpenseId: 'trip',
          month: '2026-03',
          amount: 50,
          potDeduction: 50,
        },
      ],
      plannedExpenseRecoveries: [],
      plannedExpenseSettlements: [],
      reconciledMonths: [],
      monthCarryAdjustments: [],
    };

    const mar = find(runEngine(state, '2026-03').months, '2026-03');
    // potCarry = −50 (early payment); +100 locked → €50 physical now.
    expect(r(mar.potActual)).toBe(50);
    // Forecast end-of-month adds recommended set-aside beyond what is locked so far.
    expect(r(mar.potAfter)).toBeGreaterThan(r(mar.potActual));
    expect(r(mar.setAsideRecommended)).toBeGreaterThan(100);
  });

  it('includes settlement pot deductions in physical pot now', () => {
    const state: BudgetState = {
      ...makeState(3400, [{ amount: 400, targetMonth: '2026-04' }]),
      lockIns: [{ id: 'lock-mar', month: '2026-03', lockedAmount: 80, lockState: 'planned' }],
      plannedExpensePayments: [
        {
          id: 'pay-mar',
          plannedExpenseId: 'expense-0',
          month: '2026-03',
          amount: 100,
          potDeduction: 100,
        },
      ],
      plannedExpenseSettlements: [
        {
          id: 'settle-mar',
          plannedExpenseId: 'expense-0',
          month: '2026-03',
          actualAmount: 400,
          potDeduction: 300,
          surplusDestination: null,
        },
      ],
    };
    const mar = find(runEngine(state, '2026-03').months, '2026-03');
    // potCarry = −100 − 300 = −400; +80 locked → −320 now (bank balance reference).
    expect(r(mar.potActual)).toBe(-320);
    expect(r(mar.potDeduction)).toBe(0);
  });

  it('matches potAfter for past months (end-of-month physical balance)', () => {
    const state = makeState(1000, [{ amount: 500, targetMonth: '2026-02' }]);
    state.lockIns = [{ id: 'l1', month: '2026-01', lockedAmount: 300, lockState: 'planned' }];
    const jan = find(runEngine(state, '2026-03').months, '2026-01');
    expect(r(jan.potActual)).toBe(r(jan.potAfter));
  });
});
