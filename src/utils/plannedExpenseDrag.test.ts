import { describe, expect, it } from 'vitest';
import {
  canDragLedgerCell,
  canDropEarlyPaymentMonth,
  canDropPlannedExpense,
  canDropTargetMonth,
  minTargetMonthForExpense,
} from './plannedExpenseDrag';
import type { PlannedExpense, PlannedExpensePayment } from '../engine/types';

const CURRENT = '2026-06';

const trip: PlannedExpense = {
  id: 'trip',
  name: 'Trip',
  amount: 800,
  targetMonth: '2026-08',
  category: 'travel',
  confidence: 'confirmed',
};

const payments: PlannedExpensePayment[] = [
  {
    id: 'pay-jun',
    plannedExpenseId: 'trip',
    month: '2026-06',
    amount: 400,
    potDeduction: 400,
  },
];

describe('minTargetMonthForExpense', () => {
  it('uses current month when the target is still in the future', () => {
    expect(minTargetMonthForExpense(trip, CURRENT)).toBe(CURRENT);
  });

  it('allows keeping a target that is already in the past', () => {
    const pastTarget = { ...trip, targetMonth: '2026-03' as const };
    expect(minTargetMonthForExpense(pastTarget, CURRENT)).toBe('2026-03');
  });
});

describe('canDragLedgerCell', () => {
  it('allows dragging target and early-payment cells', () => {
    expect(canDragLedgerCell({ kind: 'target', amount: 800 }, trip.id, [])).toBe(true);
    expect(
      canDragLedgerCell(
        { kind: 'early-payment', amount: 400, paymentId: 'pay-jun' },
        trip.id,
        [],
      ),
    ).toBe(true);
  });

  it('blocks empty cells and settled expenses', () => {
    expect(canDragLedgerCell({ kind: 'empty' }, trip.id, [])).toBe(false);
    expect(
      canDragLedgerCell(
        { kind: 'target', amount: 800 },
        trip.id,
        [{ id: 's1', plannedExpenseId: trip.id, month: '2026-08', actualAmount: 800, potDeduction: 800, surplusDestination: null }],
      ),
    ).toBe(false);
  });
});

describe('canDropTargetMonth', () => {
  it('allows moving the deadline to another valid month', () => {
    expect(
      canDropTargetMonth(trip, '2026-08', '2026-10', CURRENT, payments, []),
    ).toBe(true);
  });

  it('blocks drops before the minimum target month or onto an early-payment month', () => {
    expect(
      canDropTargetMonth(trip, '2026-08', '2026-05', CURRENT, payments, []),
    ).toBe(false);
    expect(
      canDropTargetMonth(trip, '2026-08', '2026-06', CURRENT, payments, []),
    ).toBe(false);
  });
});

describe('canDropEarlyPaymentMonth', () => {
  it('allows moving an early payment within past/current months before the target', () => {
    expect(
      canDropEarlyPaymentMonth(trip, '2026-06', '2026-05', CURRENT, payments, []),
    ).toBe(true);
  });

  it('blocks future months, the target month, and duplicate payment months', () => {
    expect(
      canDropEarlyPaymentMonth(trip, '2026-06', '2026-07', CURRENT, payments, []),
    ).toBe(false);
    expect(
      canDropEarlyPaymentMonth(trip, '2026-06', '2026-08', CURRENT, payments, []),
    ).toBe(false);
    expect(
      canDropEarlyPaymentMonth(
        trip,
        '2026-06',
        '2026-05',
        CURRENT,
        [
          ...payments,
          {
            id: 'pay-may',
            plannedExpenseId: 'trip',
            month: '2026-05',
            amount: 100,
            potDeduction: 100,
          },
        ],
        [],
      ),
    ).toBe(false);
  });
});

describe('canDropPlannedExpense', () => {
  it('routes validation to the correct drag kind', () => {
    expect(
      canDropPlannedExpense(
        { expenseId: trip.id, kind: 'target', fromMonth: '2026-08' },
        trip,
        '2026-10',
        CURRENT,
        payments,
        [],
      ),
    ).toBe(true);

    expect(
      canDropPlannedExpense(
        {
          expenseId: trip.id,
          kind: 'early-payment',
          fromMonth: '2026-06',
          paymentId: 'pay-jun',
        },
        trip,
        '2026-05',
        CURRENT,
        payments,
        [],
      ),
    ).toBe(true);
  });
});
