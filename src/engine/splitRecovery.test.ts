import { describe, expect, it } from 'vitest';
import { smooth } from './smoothing';
import {
  computeRecoveryRates,
  computeSplitSetAsideRates,
  monthsThrough,
  simulatePotFeasible,
} from './splitRecovery';
import type { PlannedExpense, PlannedExpensePayment } from './types';

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
      '2026-06',
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
      '2026-06',
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
      '2026-06',
      [octTarget],
      payments,
      new Map(),
      100,
    );
    const decRates = computeRecoveryRates(
      months,
      '2026-06',
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
      '2026-06',
      regular,
      deferred,
      expenseTotals,
      -100,
      -400,
      [splitwise],
      payments,
      new Map(),
      300,
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
