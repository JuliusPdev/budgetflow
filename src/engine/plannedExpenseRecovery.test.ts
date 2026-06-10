import { describe, expect, it } from 'vitest';
import type { PlannedExpense, PlannedExpensePayment } from './types';
import { fundingProgressForExpense } from './plannedExpenseRecovery';

const trip: PlannedExpense = {
  id: 'trip',
  name: 'Trip',
  amount: 800,
  targetMonth: '2026-05',
  category: 'travel',
  confidence: 'confirmed',
};

describe('fundingProgressForExpense', () => {
  it('shows zero progress when no payments exist', () => {
    const progress = fundingProgressForExpense(trip, []);
    expect(progress.totalPaid).toBe(0);
    expect(progress.fundedProgress).toBe(0);
    expect(progress.plannedAmount).toBe(800);
  });

  it('tracks total paid from early payments', () => {
    const payments: PlannedExpensePayment[] = [
      { id: 'p1', plannedExpenseId: 'trip', month: '2026-02', amount: 400, potDeduction: 400 },
    ];
    const progress = fundingProgressForExpense(trip, payments);
    expect(progress.totalPaid).toBe(400);
    expect(progress.fundedProgress).toBe(400);
  });

  it('accumulates multiple payments', () => {
    const payments: PlannedExpensePayment[] = [
      { id: 'p1', plannedExpenseId: 'trip', month: '2026-02', amount: 200, potDeduction: 200 },
      { id: 'p2', plannedExpenseId: 'trip', month: '2026-03', amount: 300, potDeduction: 300 },
    ];
    const progress = fundingProgressForExpense(trip, payments);
    expect(progress.totalPaid).toBe(500);
    expect(progress.fundedProgress).toBe(500);
  });

  it('ignores payments for other expenses', () => {
    const payments: PlannedExpensePayment[] = [
      { id: 'p1', plannedExpenseId: 'trip', month: '2026-02', amount: 400, potDeduction: 400 },
      { id: 'p2', plannedExpenseId: 'other', month: '2026-02', amount: 100, potDeduction: 100 },
    ];
    const progress = fundingProgressForExpense(trip, payments);
    expect(progress.totalPaid).toBe(400);
  });
});
