import { describe, expect, it } from 'vitest';
import { planSetAside } from './plan';
import { buildTimeline, doneMarks, type TimelineRow } from './timeline';
import { planningView } from './timing';
import { withPayments } from './payments';
import type { Envelope, LogEntry } from './types';

// Made-up amounts. Payday on the 21st; today is 20 Nov, still in the 21 Oct paycheck.
const PAYDAY = 21;
const TODAY = '2026-11-20';
const gifts: Envelope = { id: 'gifts', name: 'Gifts', targetCents: 30_000, dueMonth: '2026-12', savedCents: 0 };
const trip: Envelope = { id: 'trip', name: 'Trip', targetCents: 80_000, dueMonth: '2027-01', dueDate: '2027-01-25', savedCents: 0 };
const envelopes = [gifts, trip];
const plan = planSetAside(planningView(envelopes, PAYDAY), '2026-10');

/** One row as "what · when · band", e.g. "out trip 2027-01-25 · band 2027-01". */
function describeRow({ event, band }: TimelineRow): string {
  return `${describeEvent(event)} · band ${band ?? 'none'}`;
}

function describeEvent(event: TimelineRow['event']): string {
  switch (event.kind) {
    case 'month-start':
      return `month ${event.month}`;
    case 'today':
      return `today ${event.date}`;
    case 'paycheck-end':
      return `end ${event.date} (${event.daysLeft} left)`;
    case 'set-aside':
      return `in ${event.date}`;
    case 'bill':
      return `out ${event.envelopeId} ${event.date ?? 'any day'}`;
    case 'done':
      return `done ${event.mark.expenseId} ${event.mark.date}`;
    case 'past-paycheck':
      return `paycheck ${event.paycheck} from ${event.date}: ${event.putAsideCents}`;
    case 'past':
      return `${event.event.kind} ${event.event.date}`;
  }
}

describe('the timeline', () => {
  it('lists everything in date order, with months marking where they begin and paychecks as bands', () => {
    expect(buildTimeline(plan, envelopes, PAYDAY, TODAY).map(describeRow)).toEqual([
      // October begins before the first paycheck shown: no band yet.
      'month 2026-10 · band none',
      'in 2026-10-21 · band 2026-10',
      // The 21 Oct paycheck runs across the November line, up to today.
      'month 2026-11 · band 2026-10',
      'today 2026-11-20 · band 2026-10',
      'in 2026-11-21 · band 2026-11',
      // A month-only bill counts from the 1st: it falls in the 21 Nov paycheck.
      'month 2026-12 · band 2026-11',
      'out gifts any day · band 2026-11',
      'in 2026-12-21 · band 2026-12',
      'month 2027-01 · band 2026-12',
      // The trip on 25 Jan is a January bill, in the 21 Jan paycheck that pays its last part.
      'in 2027-01-21 · band 2027-01',
      'out trip 2027-01-25 · band 2027-01',
    ]);
  });

  it('runs the current paycheck past today to its last day', () => {
    // Payday on the 30th: the 30 Oct paycheck lasts until 29 Nov, 9 days after today.
    const plan30 = planSetAside(planningView(envelopes, 30), '2026-10');
    const rows = buildTimeline(plan30, envelopes, 30, TODAY).map(describeRow);
    expect(rows.slice(rows.indexOf('today 2026-11-20 · band 2026-10'), rows.indexOf('today 2026-11-20 · band 2026-10') + 3)).toEqual([
      'today 2026-11-20 · band 2026-10',
      'end 2026-11-29 (9 left) · band 2026-10',
      'in 2026-11-30 · band 2026-11',
    ]);
  });

  it('starts the current paycheck on the day it really arrived', () => {
    const rows = buildTimeline(plan, envelopes, PAYDAY, TODAY, '2026-10-23');
    expect(rows[1].event).toMatchObject({ kind: 'set-aside', date: '2026-10-23', isCurrent: true });
  });

  it('keeps today in the current paycheck while the next one is late', () => {
    // Today is 25 Nov but the November paycheck isn't recorded yet: the plan still starts in October.
    const rows = buildTimeline(plan, envelopes, PAYDAY, '2026-11-25');
    expect(rows.map(describeRow)).toContain('today 2026-11-25 · band 2026-10');
  });

  it('moves an unpaid bill whose month has passed to now', () => {
    const late: Envelope = { ...gifts, dueMonth: '2026-10' };
    const latePlan = planSetAside(planningView([late], PAYDAY), '2026-10');
    expect(buildTimeline(latePlan, [late], PAYDAY, TODAY).map(describeRow)).toContain(
      'out gifts any day · band 2026-10',
    );
  });

  it('marks an expense done on its day, only within the paycheck shown', () => {
    // The 21 Oct paycheck is shown first: 1 Nov is in it, 15 Oct is before it.
    const marks = doneMarks([
      { ...gifts, done: { date: '2026-11-01', costCents: 25_000 } },
      { ...trip, done: { date: '2026-10-15', costCents: 80_000 } },
    ]);
    const rows = buildTimeline(plan, envelopes, PAYDAY, TODAY, undefined, marks).map(describeRow);
    expect(rows).toContain('done gifts 2026-11-01 · band 2026-10');
    expect(rows.some((row) => row.startsWith('done trip'))).toBe(false);
  });

  it('keeps the totals of the plan unchanged', () => {
    const inCents = buildTimeline(plan, envelopes, PAYDAY, TODAY).reduce(
      (sum, { event }) => sum + (event.kind === 'set-aside' ? event.amountCents : 0),
      0,
    );
    expect(inCents).toBe(plan.reduce((sum, month) => sum + month.totalCents, 0));
  });
});

describe('payments in the timeline', () => {
  // Made-up: a €220 musical due in December, paid on 24 Nov, three days into the 21 Nov paycheck.
  const NOW = '2026-11-24';
  const START = '2026-11-21';
  const musical: Envelope = { id: 'musical', name: 'Musical', targetCents: 22_000, dueMonth: '2026-12', savedCents: 0 };
  const log: LogEntry[] = [{ id: 'p', kind: 'payment', date: NOW, envelopeId: 'musical', amountCents: 22_000 }];

  function rowsFor(expense: Envelope): TimelineRow[] {
    const parts = withPayments([gifts, expense], log, PAYDAY);
    return buildTimeline(planSetAside(parts, '2026-11'), parts, PAYDAY, NOW, START, doneMarks([expense]));
  }

  it('sit on the day you paid, after the paycheck began', () => {
    const rows = rowsFor(musical).map(describeRow);
    expect(rows.indexOf('out musical~p 2026-11-24 · band 2026-11')).toBeGreaterThan(rows.indexOf('in 2026-11-21 · band 2026-11'));
  });

  it('are part of the ✓ Done line once the expense is finished', () => {
    const finished: Envelope = { ...musical, done: { date: NOW, costCents: 22_000, paymentId: 'p' } };
    const rows = rowsFor(finished);
    expect(rows.map(describeRow).filter((row) => row.includes('musical'))).toEqual(['done musical 2026-11-24 · band 2026-11']);
  });
});

describe('a day with several things on it', () => {
  it('starts with Today, then money in, then money out', () => {
    // Made-up: the paycheck arrived today, and an expense was finished today.
    const NOW = '2026-11-24';
    const finished: Envelope = { ...gifts, done: { date: NOW, costCents: 30_000 } };
    const rows = buildTimeline(planSetAside([trip], '2026-11'), [finished, trip], PAYDAY, NOW, NOW, doneMarks([finished])).map(describeRow);
    const sameDay = rows.filter((row) => row.includes(NOW));
    expect(sameDay).toEqual(['today 2026-11-24 · band 2026-11', 'in 2026-11-24 · band 2026-11', 'done gifts 2026-11-24 · band 2026-11']);
  });
});
