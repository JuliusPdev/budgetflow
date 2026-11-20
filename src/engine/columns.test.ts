import { describe, expect, it } from 'vitest';
import { buildColumns, type Spot } from './columns';
import { planSetAside } from './plan';
import { planningView } from './timing';
import type { Envelope } from './types';

// Made-up amounts. Payday on the 21st; today is 20 Nov, the last day of the 21 Oct paycheck.
const PAYDAY = 21;
const TODAY = '2026-11-20';
const gifts: Envelope = { id: 'gifts', name: 'Gifts', targetCents: 30_000, dueMonth: '2026-12', savedCents: 0 };
const show: Envelope = { id: 'show', name: 'Show', targetCents: 22_000, dueMonth: '2026-12', savedCents: 0 };
const trip: Envelope = { id: 'trip', name: 'Trip', targetCents: 80_000, dueMonth: '2027-01', dueDate: '2027-01-25', savedCents: 0 };
const envelopes = [gifts, show, trip];
const plan = planSetAside(planningView(envelopes, PAYDAY), '2026-10');

/** A spot rounded to two decimals, as "brick@fraction", e.g. "1@0.33". */
function where({ brick, at }: Spot): string {
  return `${brick}@${at.toFixed(2)}`;
}

describe('the columns layout', () => {
  const layout = buildColumns(plan, envelopes, PAYDAY, TODAY);

  it('makes one brick per paycheck, from payday to the next payday', () => {
    expect(layout?.bricks.map((brick) => `${brick.from} → ${brick.next}`)).toEqual([
      '2026-10-21 → 2026-11-21',
      '2026-11-21 → 2026-12-21',
      '2026-12-21 → 2027-01-21',
      '2027-01-21 → 2027-02-21',
    ]);
    expect(layout?.bricks[0].isCurrent).toBe(true);
  });

  it('draws a line where each month begins, inside the paycheck that covers it', () => {
    // 1 Nov is 11 of the 31 days into the 21 Oct paycheck.
    expect(layout?.firstMonth).toBe('2026-10');
    expect(layout?.monthLines.map((line) => `${line.month} ${where(line)}`)).toEqual([
      '2026-11 0@0.35',
      '2026-12 1@0.33',
      '2027-01 2@0.35',
      '2027-02 3@0.35',
    ]);
  });

  it('puts bills on their real day, grouping "any day" bills of the same month', () => {
    expect(
      layout?.bills.map((bill) => `${bill.envelopeIds.join('+')} ${bill.amountCents} ${where(bill.start)}–${where(bill.end)}`),
    ).toEqual([
      // Any day in December: from 1 Dec (in the 21 Nov paycheck) to the end of 31 Dec (in the 21 Dec one).
      'gifts+show 52000 1@0.33–2@0.35',
      // 25 Jan: 4 days into the 21 Jan paycheck.
      'trip 80000 3@0.13–3@0.13',
    ]);
  });

  it('places today, and keeps it at the end of the current paycheck while the next one is late', () => {
    expect(where(layout?.today ?? { brick: -1, at: 0 })).toBe('0@0.97');
    expect(buildColumns(plan, envelopes, PAYDAY, '2026-11-25')?.today).toEqual({ brick: 0, at: 1 });
  });

  it('starts the current brick on the day the paycheck really arrived', () => {
    expect(buildColumns(plan, envelopes, PAYDAY, TODAY, '2026-10-23')?.bricks[0].from).toBe('2026-10-23');
  });

  it('has nothing to lay out without a plan', () => {
    expect(buildColumns([], envelopes, PAYDAY, TODAY)).toBeNull();
  });
});
