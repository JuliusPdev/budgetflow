import { describe, it, expect } from 'vitest';
import {
  buildPlannedExpenseMarkers,
  chartLabelStackHeight,
  chartPadTop,
  CHART_ITEM_GAP,
  CHART_NAME_TO_AMOUNT,
  layoutExpenseLabels,
  maxPlannedExpenseStackDepth,
} from './potChartMarkers';
import type { MonthResult, PlannedExpense } from '../engine/types';

function expense(id: string, name: string, amount: number, targetMonth: string): PlannedExpense {
  return {
    id,
    name,
    amount,
    targetMonth,
    category: 'general',
    confidence: 'confirmed',
  };
}

function hitMonth(
  month: string,
  plannedExpenses: PlannedExpense[],
  potBeforeExpenses: number,
  potDeduction: number,
): MonthResult {
  return {
    month,
    monthlyIncome: 3000,
    availableAfterFixed: 2000,
    plannedExpenses,
    plannedTotal: plannedExpenses.reduce((sum, e) => sum + e.amount, 0),
    unplannedExpenses: [],
    unplannedTotal: 0,
    incomeCarryover: 0,
    setAsideRecommended: 200,
    setAsideRecovery: 0,
    setAsideFunding: 200,
    setAsideLocked: 0,
    freeBudget: 1800,
    potBeforeExpenses,
    potDeduction,
    potAfter: potBeforeExpenses - potDeduction,
    potActual: 0,
    lockStatus: { kind: 'none' },
  };
}

describe('chartPadTop', () => {
  it('grows when a month has multiple planned hits', () => {
    const months = [
      hitMonth('2026-08', [expense('a', 'A', 400, '2026-08'), expense('b', 'B', 600, '2026-08')], 1000, 1000),
    ];
    expect(chartPadTop(months)).toBe(28 + chartLabelStackHeight(2));
  });

  it('stays at base padding for a single hit', () => {
    const months = [hitMonth('2026-08', [expense('a', 'Only', 100, '2026-08')], 500, 100)];
    expect(chartPadTop(months)).toBe(28);
  });
});

describe('buildPlannedExpenseMarkers', () => {
  const padLeft = 200;
  const monthWidth = 92;
  const yForPotPositive = (amount: number) => 100 - amount / 20;
  const yForDebt = () => 150;

  it('emits one marker per month with all expenses and the total', () => {
    const months = [
      hitMonth('2026-07', [], 500, 0),
      hitMonth(
        '2026-08',
        [expense('trip-a', 'Summer trip', 400, '2026-08'), expense('trip-b', 'Winter coat', 600, '2026-08')],
        1200,
        1000,
      ),
    ];

    const markers = buildPlannedExpenseMarkers(months, padLeft, monthWidth, yForPotPositive, yForDebt);
    expect(markers).toHaveLength(1);

    const august = markers[0];
    expect(august.month).toBe('2026-08');
    expect(august.expenses).toHaveLength(2);
    expect(august.expenses[0].name).toBe('Summer trip');
    expect(august.expenses[1].name).toBe('Winter coat');
    expect(august.totalAmount).toBe(1000);
  });

  it('skips months without a pot deduction', () => {
    const months = [hitMonth('2026-08', [expense('a', 'Only', 100, '2026-08')], 500, 0)];
    expect(buildPlannedExpenseMarkers(months, padLeft, monthWidth, yForPotPositive, yForDebt)).toHaveLength(0);
  });
});

describe('layoutExpenseLabels', () => {
  it('uses the same gap between total, groups, and within a group', () => {
    const totalY = 200;
    const [first, second] = layoutExpenseLabels(totalY, 2);

    expect(second.amountY).toBe(totalY - CHART_ITEM_GAP);
    expect(second.nameY).toBe(second.amountY - CHART_NAME_TO_AMOUNT);
    expect(first.amountY).toBe(second.nameY - CHART_ITEM_GAP);
    expect(first.nameY).toBe(first.amountY - CHART_NAME_TO_AMOUNT);
  });
});

describe('maxPlannedExpenseStackDepth', () => {
  it('returns the largest planned-expense count among hit months', () => {
    const months = [
      hitMonth('2026-07', [expense('a', 'A', 100, '2026-07')], 200, 100),
      hitMonth('2026-08', [expense('b', 'B', 100, '2026-08'), expense('c', 'C', 200, '2026-08')], 400, 300),
    ];
    expect(maxPlannedExpenseStackDepth(months)).toBe(2);
  });
});
