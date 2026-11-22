import { describe, expect, it } from 'vitest';
import { isOverdue, overdueExpenses } from './overdue';
import type { Expense } from './types';

// Made-up expenses; today is 22 Nov 2026.
const TODAY = '2026-11-22';
const gifts: Expense = { id: 'gifts', name: 'Gifts', targetCents: 30_000, dueMonth: '2026-11', dueDate: '2026-11-20' };
const tyres: Expense = { id: 'tyres', name: 'Tyres', targetCents: 48_000, dueMonth: '2026-10' };
const party: Expense = { id: 'party', name: 'Party', targetCents: 10_000, dueMonth: '2026-11' };
const concert: Expense = { id: 'concert', name: 'Concert', targetCents: 9_000, dueMonth: '2026-11', dueDate: '2026-11-22' };

describe('overdue expenses', () => {
  it('are the ones whose exact day has passed', () => {
    expect(isOverdue(gifts, TODAY)).toBe(true);
    // Due today is not overdue yet.
    expect(isOverdue(concert, TODAY)).toBe(false);
  });

  it('with only a month, once that month is over', () => {
    expect(isOverdue(tyres, TODAY)).toBe(true);
    expect(isOverdue(party, TODAY)).toBe(false);
  });

  it('never once they are done', () => {
    expect(isOverdue({ ...gifts, done: { date: '2026-11-20', costCents: 30_000 } }, TODAY)).toBe(false);
  });

  it('come longest overdue first', () => {
    expect(overdueExpenses([gifts, party, tyres, concert], TODAY).map((expense) => expense.id)).toEqual(['tyres', 'gifts']);
  });
});
