import { describe, expect, it } from 'vitest';
import { smooth } from './smoothing';
import {
  computeDebtClearanceRates,
  computeRecoveryRates,
  computeSplitSetAsideRates,
  monthsThrough,
  simulateForecastPot,
  simulatePlanFeasible,
  simulatePotFeasible,
} from './splitRecovery';
import type { Month, PlannedExpense, PlannedExpensePayment } from './types';

function r(n: number): number {
  return Math.round(n * 100) / 100;
}

describe('computeRecoveryRates', () => {
  const splitwise: PlannedExpense = {
    id: 'splitwise',
    name: 'Splitwise',
    amount: 400,
    targetMonth: '2026-10',
    category: 'general',
    confidence: 'confirmed',
  };

  const payments = new Map<string, PlannedExpensePayment[]>([
    [
      'splitwise',
      [
        {
          id: 'pay',
          plannedExpenseId: 'splitwise',
          month: '2026-06',
          amount: 400,
          potDeduction: 400,
        },
      ],
    ],
  ]);

  it('spreads recovery over payment month through original target month', () => {
    const months = monthsThrough('2026-06', '2026-10');
    const rates = computeRecoveryRates(
      months,
      [splitwise],
      payments,
      new Map(),
      100,
    );
    expect(r(rates.get('2026-06') ?? 0)).toBe(20);
    expect(r(rates.get('2026-10') ?? 0)).toBe(20);
    expect(rates.get('2026-11')).toBeUndefined();
  });

  it('returns zero when there is no physical dip', () => {
    const months = monthsThrough('2026-06', '2026-10');
    const rates = computeRecoveryRates(
      months,
      [splitwise],
      payments,
      new Map(),
      0,
    );
    expect([...rates.values()].every(v => v === 0)).toBe(true);
  });

  it('uses a longer window when the target month is later', () => {
    const octTarget: PlannedExpense = { ...splitwise, targetMonth: '2026-10' };
    const decTarget: PlannedExpense = { ...splitwise, targetMonth: '2026-12' };
    const months = monthsThrough('2026-06', '2026-12');

    const octRates = computeRecoveryRates(
      months,
      [octTarget],
      payments,
      new Map(),
      100,
    );
    const decRates = computeRecoveryRates(
      months,
      [decTarget],
      payments,
      new Map(),
      100,
    );

    expect(r(octRates.get('2026-06') ?? 0)).toBe(20);
    expect(r(decRates.get('2026-06') ?? 0)).toBe(14.29);
    expect(r(decRates.get('2026-06') ?? 0)).toBeLessThan(r(octRates.get('2026-06') ?? 0));
  });
});

describe('simulatePlanFeasible', () => {
  it('uses actual past locks for months before currentMonth, not planned rates', () => {
    const months = monthsThrough('2026-06', '2026-07');
    const expenses = new Map<Month, number>([['2026-07', 400]]);
    const locks = new Map<Month, number>([['2026-06', 500]]);

    expect(simulatePlanFeasible(
      months,
      '2026-07',
      0,
      [0, 100],
      expenses,
      locks,
      new Map(),
    )).toBe(true);

    expect(simulatePlanFeasible(
      months,
      '2026-07',
      0,
      [0, 100],
      expenses,
      new Map(),
      new Map(),
    )).toBe(false);
  });
});

describe('computeSplitSetAsideRates', () => {
  it('floors combined schedule when August deadline would fail', () => {
    const algorithmMonths = monthsThrough('2026-06', '2026-10');
    const regular = new Map([['2026-08', 800]]);
    const deferred = new Map<string, number>();
    const expenseTotals = new Map([['2026-08', 800]]);

    const splitwise: PlannedExpense = {
      id: 'splitwise',
      name: 'Splitwise',
      amount: 400,
      targetMonth: '2026-10',
      category: 'general',
      confidence: 'confirmed',
    };

    const payments = new Map<string, PlannedExpensePayment[]>([
      [
        'splitwise',
        [
          {
            id: 'pay',
            plannedExpenseId: 'splitwise',
            month: '2026-06',
            amount: 400,
            potDeduction: 400,
          },
        ],
      ],
    ]);

    const split = computeSplitSetAsideRates(
      algorithmMonths,
      algorithmMonths,
      '2026-06',
      regular,
      deferred,
      expenseTotals,
      -100,
      [splitwise],
      payments,
      new Map(),
      300,
      new Map(),
      new Map(),
      smooth,
    );

    expect(r(split.total[0])).toBe(300);
    expect(r(split.total[1])).toBe(300);
    expect(r(split.total[2])).toBe(300);
    expect(
      simulatePotFeasible(algorithmMonths.slice(0, 3), -100, split.total.slice(0, 3), expenseTotals),
    ).toBe(true);
  });
});

describe('simulatePotFeasible', () => {
  it('allows negative pot in non-expense months but fails on under-funded expense months', () => {
    const months = ['2026-01', '2026-02'] as const;
    const expenses = new Map<string, number>([['2026-02', 500]]);
    expect(simulatePotFeasible([...months], 0, [100, 100], expenses)).toBe(false);
    expect(simulatePotFeasible([...months], 0, [250, 250], expenses)).toBe(true);
  });
});

describe('computeDebtClearanceRates', () => {
  it('spreads clearance over months after the last expense until pot reaches zero', () => {
    const months = ['2026-01', '2026-02', '2026-03'] as Month[];
    const expenses = new Map<Month, number>([['2026-02', 200]]);
    const rates = new Map<Month, number>([
      ['2026-01', 50],
      ['2026-02', 50],
      ['2026-03', 50],
    ]);

    const clearance = computeDebtClearanceRates(months, -100, rates, expenses);
    expect(clearance.size).toBe(1);
    expect(r(clearance.get('2026-03') ?? 0)).toBe(150);

    const merged = new Map(rates);
    for (const [month, amount] of clearance) {
      merged.set(month, (merged.get(month) ?? 0) + amount);
    }
    const terminal = simulateForecastPot(months, -100, merged, expenses).at(-1) ?? 0;
    expect(terminal).toBeGreaterThanOrEqual(-0.01);
  });
});
