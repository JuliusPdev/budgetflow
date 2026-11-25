import { describe, expect, it } from 'vitest';
import { buildColumns } from './columns';
import { buildFillUp, buildFillUpView } from './fillUp';
import { planSetAside } from './plan';
import { planningView } from './timing';
import type { Envelope } from './types';

// Made-up amounts. Payday on the 21st; four paychecks from 21 Oct to 21 Jan.
const PAYDAY = 21;
const TODAY = '2026-11-20';
const gifts: Envelope = { id: 'gifts', name: 'Gifts', targetCents: 30_000, dueMonth: '2026-12', savedCents: 0 };
const trip: Envelope = { id: 'trip', name: 'Trip', targetCents: 80_000, dueMonth: '2027-01', dueDate: '2027-01-25', savedCents: 0 };
const plan = planSetAside(planningView([gifts, trip], PAYDAY), '2026-10');
const layout = buildColumns(plan, [gifts, trip], PAYDAY, TODAY);

function rows(envelopes: Envelope[]) {
  if (layout === null) throw new Error('no layout');
  return buildFillUp(layout, envelopes);
}

const round = (x: number) => Number(x.toFixed(3));

describe('how each expense fills up', () => {
  it('puts a dot on every payday that sets money aside for it, and ends at its due day', () => {
    const [, tripRow] = rows([gifts, trip]);
    expect(tripRow.dots.map((dot) => round(dot.x))).toEqual([0, 0.25, 0.5, 0.75]);
    expect(tripRow.dots[0].isCurrent).toBe(true);
    // 25 Jan: 4 of 31 days into the last of four paychecks.
    expect(round(tripRow.end)).toBe(round((3 + 4 / 31) / 4));
    expect(tripRow.due.date).toBe('2027-01-25');
  });

  it('ends an "any day" expense where its month begins, with the month as its due stretch', () => {
    const [giftsRow] = rows([gifts, trip]);
    expect(giftsRow.due.date).toBeUndefined();
    expect(round(giftsRow.end)).toBe(round(giftsRow.due.from));
    expect(giftsRow.due.to).toBeGreaterThan(giftsRow.due.from);
  });

  it('fills the track as far as the money in the pot reaches', () => {
    const [giftsRow] = rows([{ ...gifts, savedCents: 15_000 }, trip]);
    expect(giftsRow.start).toBe(0);
    expect(round(giftsRow.filledTo)).toBe(round(giftsRow.end / 2));
    expect(giftsRow.inPotCents).toBe(15_000);
  });

  it('leaves out expenses already paid', () => {
    expect(rows([{ ...gifts, paidMonth: '2026-11' }, trip]).map((row) => row.id)).toEqual(['trip']);
  });

  it('lists the closest due day first', () => {
    expect(rows([trip, gifts]).map((row) => row.id)).toEqual(['gifts', 'trip']);
  });

  it('puts month lines and today on the same ruler as the bars', () => {
    if (layout === null) throw new Error('no layout');
    const view = buildFillUpView(layout, [gifts, trip]);
    expect(Object.keys(view.rows)).toEqual(['gifts', 'trip']);
    expect(view.paychecks).toBe(4);
    // 1 Nov: 11 of 31 days into the first of four paychecks.
    expect(round(view.monthLines[0].x)).toBe(round(11 / 31 / 4));
    // Today, 20 Nov: the last day of the first paycheck.
    expect(round(view.today)).toBe(round(30 / 31 / 4));
  });

  it('lists each paycheck with what it asks and what goes out in it', () => {
    if (layout === null) throw new Error('no layout');
    const view = buildFillUpView(layout, [gifts, trip]);
    const spans = view.paycheckSpans;
    expect(spans.map((span) => [span.from, span.last])).toEqual([
      ['2026-10-21', '2026-11-20'],
      ['2026-11-21', '2026-12-20'],
      ['2026-12-21', '2027-01-20'],
      ['2027-01-21', '2027-02-20'],
    ]);
    expect(spans.map((span) => span.isCurrent)).toEqual([true, false, false, false]);
    expect(spans.map((span) => span.putAsideCents)).toEqual(plan.map((month) => month.totalCents));
    // Gifts leave in the paycheck that pays December; the trip on 25 Jan, in the last one.
    expect(spans.map((span) => span.goingOutCents)).toEqual([0, 30_000, 0, 80_000]);
    expect(spans.map((span) => round(span.x))).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it('places a finished expense on the day it was done', () => {
    const finished = buildColumns(plan, [gifts, trip], PAYDAY, TODAY, undefined, [
      { expenseId: 'party', name: 'Party', date: '2026-11-10', costCents: 5_000, plannedCents: 5_000 },
    ]);
    if (finished === null) throw new Error('no layout');
    const view = buildFillUpView(finished, [gifts, trip]);
    // 10 Nov: 20 of 31 days into the first paycheck.
    expect(round(view.done.party.x)).toBe(round(20 / 31 / 4));
    expect(view.paycheckSpans[0].goingOutCents).toBe(5_000);
  });
});
