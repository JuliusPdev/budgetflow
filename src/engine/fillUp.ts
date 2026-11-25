import type { ColumnsLayout, Spot } from './columns';
import { dayBefore } from './months';
import type { Cents, Day, Envelope } from './types';

// How each expense fills up, on one ruler across all paychecks: 0 is the left
// edge of the first paycheck, 1 the end of the last. Built from the Columns
// layout, so dots and due days sit exactly where the Columns view puts them.

export interface FillUpDot {
  /** Where on the ruler: this paycheck's payday. */
  x: number;
  cents: Cents;
  /** The paycheck you're living on now. */
  isCurrent: boolean;
}

export interface FillUpRow {
  id: string;
  name: string;
  targetCents: Cents;
  inPotCents: Cents;
  /** The track: from the first set-aside to the due day (or the start of the due month). */
  start: number;
  end: number;
  /** How far the money already in the pot reaches along the track. */
  filledTo: number;
  dots: FillUpDot[];
  /** A due day is a point; "any day in a month" is a stretch. */
  due: { from: number; to: number; date: string | undefined; month: string };
}

/** A spot as a position on the ruler. */
function onRuler(spot: Spot, brickCount: number): number {
  return (spot.brick + spot.at) / brickCount;
}

/**
 * One row per unpaid expense with a bill in the plan, in due order. `envelopes`
 * carry each expense's share of the pot as `savedCents`.
 */
export function buildFillUp(layout: ColumnsLayout, envelopes: Envelope[]): FillUpRow[] {
  const brickCount = layout.bricks.length;
  return envelopes
    .flatMap((envelope): FillUpRow[] => {
      if (envelope.paidMonth !== undefined) return [];
      const bill = layout.bills.find((candidate) => candidate.envelopeIds.includes(envelope.id));
      if (bill === undefined) return [];

      const dots = layout.bricks.flatMap((brick, index) => {
        const cents = brick.byEnvelope[envelope.id];
        return cents === undefined || cents === 0
          ? []
          : [{ x: index / brickCount, cents, isCurrent: brick.isCurrent }];
      });
      const due = {
        from: onRuler(bill.start, brickCount),
        to: onRuler(bill.end, brickCount),
        date: bill.date,
        month: bill.month,
      };
      const inPotCents = Math.min(envelope.savedCents, envelope.targetCents);
      // Money already in the pot came from before the first paycheck shown.
      const start = inPotCents > 0 || dots.length === 0 ? 0 : dots[0].x;
      const end = Math.max(start, due.from);
      const filledTo = start + ((end - start) * inPotCents) / envelope.targetCents;

      return [{ id: envelope.id, name: envelope.name, targetCents: envelope.targetCents, inPotCents, start, end, filledTo, dots, due }];
    })
    .sort((a, b) => a.due.from - b.due.from || a.name.localeCompare(b.name));
}

/** One paycheck on the ruler, for the lanes' header and footer. */
export interface FillUpPaycheck {
  /** Its first day, and its last: the day before the next payday. */
  from: Day;
  last: Day;
  isCurrent: boolean;
  /** What the plan asks you to put aside from it. */
  putAsideCents: Cents;
  /** What leaves the pot during it: bills, and expenses finished in it. */
  goingOutCents: Cents;
  /** Where it starts on the ruler, and how much of it it takes. */
  x: number;
  width: number;
}

/** A finished expense on the ruler: what it cost, on the day it was done. */
export interface FillUpDone {
  x: number;
  costCents: Cents;
  date: Day;
}

export interface FillUpView {
  /** One bar per expense, by id. */
  rows: Record<string, FillUpRow>;
  /** The paychecks the ruler spans, in order. */
  paycheckSpans: FillUpPaycheck[];
  /** Finished expenses shown on the ruler, by expense id. */
  done: Record<string, FillUpDone>;
  /** Where each month begins on the ruler. */
  monthLines: { month: string; x: number }[];
  /** Where today is on the ruler. */
  today: number;
  /** How many paychecks the ruler spans: each needs room, so long plans scroll. */
  paychecks: number;
}

/** Everything the expense list needs to draw its bars on one shared time axis. */
export function buildFillUpView(layout: ColumnsLayout, envelopes: Envelope[]): FillUpView {
  const brickCount = layout.bricks.length;
  // What leaves the pot in each paycheck: the bills it pays and what finished in it.
  const goingOut = layout.bricks.map(() => 0);
  for (const bill of layout.bills) goingOut[bill.start.brick] += bill.amountCents;
  for (const { mark, spot } of layout.done) goingOut[spot.brick] += mark.costCents;
  return {
    rows: Object.fromEntries(buildFillUp(layout, envelopes).map((row) => [row.id, row])),
    paycheckSpans: layout.bricks.map((brick, index) => ({
      from: brick.from,
      last: dayBefore(brick.next),
      isCurrent: brick.isCurrent,
      putAsideCents: brick.totalCents,
      goingOutCents: goingOut[index],
      x: index / brickCount,
      width: 1 / brickCount,
    })),
    done: Object.fromEntries(
      layout.done.map(({ mark, spot }) => [mark.expenseId, { x: onRuler(spot, brickCount), costCents: mark.costCents, date: mark.date }]),
    ),
    monthLines: layout.monthLines.map((line) => ({ month: line.month, x: onRuler(line, brickCount) })),
    today: onRuler(layout.today, brickCount),
    paychecks: brickCount,
  };
}
