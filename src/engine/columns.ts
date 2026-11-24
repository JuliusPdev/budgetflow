import { addMonths } from './months';
import type { MonthPlan } from './plan';
import { paycheckDates } from './timing';
import { whenBillLeaves, type DoneMark } from './timeline';
import type { Cents, Day, Expense, Month } from './types';

// The plan as a wall planner: one equally wide column ("brick") per paycheck,
// from payday to the day before the next one. Money is put aside at the left
// edge, on payday. Months are lines inside the bricks, and bills sit on their
// real day. Positions are "which brick, and how far along it" (0 to 1), so the
// screen can place them with percentages.

export interface Brick {
  paycheck: Month;
  /** Payday, or the day you really recorded this paycheck. */
  from: Day;
  /** The next payday: the brick lasts until the day before. */
  next: Day;
  isCurrent: boolean;
  totalCents: Cents;
  byEnvelope: Record<string, Cents>;
}

export interface Spot {
  brick: number;
  /** 0 = payday, 1 = the next payday. */
  at: number;
}

export interface MonthLine extends Spot {
  month: Month;
}

export interface BillMark {
  envelopeIds: string[];
  amountCents: Cents;
  /** The exact day, or missing for "any day" in `month`. */
  date: Day | undefined;
  month: Month;
  start: Spot;
  /** Equal to `start` for an exact day; the end of the month for "any day". */
  end: Spot;
}

export interface ColumnsLayout {
  bricks: Brick[];
  /** The month the first brick starts in, named at its left edge. */
  firstMonth: Month;
  monthLines: MonthLine[];
  bills: BillMark[];
  /** Expenses finished on a day the bricks show. */
  done: { mark: DoneMark; spot: Spot }[];
  today: Spot;
}

const DAY_MS = 86_400_000;

function dayNumber(day: Day): number {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS;
}

export function buildColumns(
  plan: MonthPlan[],
  envelopes: Expense[],
  payday: number,
  today: Day,
  currentStart?: Day,
  done: DoneMark[] = [],
): ColumnsLayout | null {
  if (plan.length === 0) return null;

  const bricks: Brick[] = plan.map((monthPlan, index) => {
    const dates = paycheckDates(monthPlan.month, payday);
    const isCurrent = index === 0;
    return {
      paycheck: monthPlan.month,
      from: isCurrent && currentStart !== undefined ? currentStart : dates.last,
      next: dates.next,
      isCurrent,
      totalCents: monthPlan.totalCents,
      byEnvelope: monthPlan.byEnvelope,
    };
  });
  const lastBrick = bricks.length - 1;
  const rangeStart = bricks[0].from;
  const rangeEnd = bricks[lastBrick].next;

  /** Where a day falls; days outside the bricks are pinned to the nearest edge. */
  function spotOf(day: Day): Spot {
    if (day < rangeStart) return { brick: 0, at: 0 };
    if (day >= rangeEnd) return { brick: lastBrick, at: 1 };
    const brick = bricks.findIndex((candidate) => day >= candidate.from && day < candidate.next);
    const { from, next } = bricks[brick];
    return { brick, at: (dayNumber(day) - dayNumber(from)) / (dayNumber(next) - dayNumber(from)) };
  }

  /** The end of a day: just before the next one starts. */
  function spotAfter(day: Day): Spot {
    const spot = spotOf(day);
    const { from, next } = bricks[spot.brick];
    if (day < rangeStart || day >= rangeEnd) return spot;
    return { brick: spot.brick, at: Math.min(1, spot.at + 1 / (dayNumber(next) - dayNumber(from))) };
  }

  const firstMonth = rangeStart.slice(0, 7);
  const monthLines: MonthLine[] = [];
  for (let month = addMonths(firstMonth, 1); `${month}-01` < rangeEnd; month = addMonths(month, 1)) {
    monthLines.push({ month, ...spotOf(`${month}-01`) });
  }

  // Bills on their real day, grouped when they share a day (or an "any day" month).
  const thisMonth = today.slice(0, 7);
  const byId = new Map(envelopes.map((envelope) => [envelope.id, envelope]));
  const groups = new Map<string, BillMark>();
  for (const monthPlan of plan) {
    for (const [envelopeId, amountCents] of Object.entries(monthPlan.billsOut)) {
      const envelope = byId.get(envelopeId);
      if (envelope === undefined) continue;
      const when = whenBillLeaves(envelope, thisMonth);
      if (when === null) continue;
      // Payments from before the paychecks shown are in the earlier ones.
      if (envelope.paidMonth !== undefined && when.date !== undefined && when.date < rangeStart) continue;
      const { month, date } = when;
      const key = date ?? `any ${month}`;
      const existing = groups.get(key);
      if (existing !== undefined) {
        existing.envelopeIds.push(envelopeId);
        existing.amountCents += amountCents;
        continue;
      }
      const lastOfMonth = lastDayOf(month);
      groups.set(key, {
        envelopeIds: [envelopeId],
        amountCents,
        date,
        month,
        start: spotOf(date ?? `${month}-01`),
        end: date === undefined ? spotAfter(lastOfMonth) : spotOf(date),
      });
    }
  }
  const bills = [...groups.values()].sort(
    (a, b) => a.start.brick - b.start.brick || a.start.at - b.start.at,
  );

  // While the next paycheck is late, today stays at the end of the current brick.
  const todaySpot = today >= bricks[0].next ? { brick: 0, at: 1 } : spotOf(today);

  const doneSpots = done.filter((mark) => mark.date >= rangeStart && mark.date < rangeEnd).map((mark) => ({ mark, spot: spotOf(mark.date) }));

  return { bricks, firstMonth, monthLines, bills, done: doneSpots, today: todaySpot };
}

/** The last day of a month: "2026-12" → "2026-12-31". */
function lastDayOf(month: Month): Day {
  const firstOfNext = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1);
  return new Date(firstOfNext - DAY_MS).toISOString().slice(0, 10);
}
