import { describe, expect, it } from 'vitest';
import { fillByDeadline } from './setAsideProgress';
import type { Expense } from './types';

// Made-up: this paycheck asks €150 for presents, €110 for a musical, €120 for a trip.
const presents: Expense = { id: 'presents', name: 'Presents', targetCents: 30_000, dueMonth: '2026-12' };
const musical: Expense = { id: 'musical', name: 'Musical', targetCents: 22_000, dueMonth: '2026-11', dueDate: '2026-11-28' };
const trip: Expense = { id: 'trip', name: 'Trip', targetCents: 400_000, dueMonth: '2027-04' };
const split = { presents: 15_000, musical: 11_000, trip: 12_000 };

function filled(setAsideCents: number): string[] {
  return fillByDeadline(split, [presents, musical, trip], setAsideCents).map((line) => `${line.id} ${line.filledCents}/${line.plannedCents}`);
}

describe('filling a paycheck by deadline', () => {
  it('puts the closest deadline first', () => {
    expect(filled(0)).toEqual(['musical 0/11000', 'presents 0/15000', 'trip 0/12000']);
  });

  it('fills each line before the next one gets anything', () => {
    expect(filled(11_000)).toEqual(['musical 11000/11000', 'presents 0/15000', 'trip 0/12000']);
    expect(filled(17_000)).toEqual(['musical 11000/11000', 'presents 6000/15000', 'trip 0/12000']);
  });

  it('fills everything, and no more, once the paycheck is done', () => {
    expect(filled(50_000)).toEqual(['musical 11000/11000', 'presents 15000/15000', 'trip 12000/12000']);
  });

  it('counts a month-only deadline from the 1st of its month', () => {
    const early: Expense = { ...presents, dueMonth: '2026-11' };
    expect(fillByDeadline(split, [early, musical, trip], 0).map((line) => line.id)).toEqual(['presents', 'musical', 'trip']);
  });
});
