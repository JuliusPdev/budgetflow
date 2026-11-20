import type { ColumnsLayout, Spot } from './columns';
import type { Cents, Envelope } from './types';

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

export interface FillUpView {
  /** One bar per expense, by id. */
  rows: Record<string, FillUpRow>;
  /** Where each month begins on the ruler. */
  monthLines: { month: string; x: number }[];
  /** Where today is on the ruler. */
  today: number;
}

/** Everything the expense list needs to draw its bars on one shared time axis. */
export function buildFillUpView(layout: ColumnsLayout, envelopes: Envelope[]): FillUpView {
  const brickCount = layout.bricks.length;
  return {
    rows: Object.fromEntries(buildFillUp(layout, envelopes).map((row) => [row.id, row])),
    monthLines: layout.monthLines.map((line) => ({ month: line.month, x: onRuler(line, brickCount) })),
    today: onRuler(layout.today, brickCount),
  };
}
