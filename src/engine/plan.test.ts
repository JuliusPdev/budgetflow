import { describe, expect, it } from 'vitest';
import { addMonths, dayOfDate, monthOfDate, monthRange, monthsInclusive } from './months';
import { loanCents, planSetAside, type MonthPlan } from './plan';
import type { Envelope } from './types';

// All amounts are made up — this repository is public.

function envelope(fields: Partial<Envelope> & Pick<Envelope, 'id' | 'targetCents' | 'dueMonth'>): Envelope {
  return { name: fields.id, savedCents: 0, ...fields };
}

function totalsOf(plan: MonthPlan[]): number[] {
  return plan.map((month) => month.totalCents);
}

/** How much one envelope receives across the plan, up to and including `untilMonth`. */
function receivedBy(plan: MonthPlan[], id: string, untilMonth: string): number {
  return plan
    .filter((month) => month.month <= untilMonth)
    .reduce((sum, month) => sum + (month.byEnvelope[id] ?? 0), 0);
}

describe('month helpers', () => {
  it('counts both ends of a range', () => {
    expect(monthsInclusive('2026-11', '2027-01')).toBe(3);
  });

  it('adds across a year boundary', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(monthRange('2026-12', '2027-01')).toEqual(['2026-12', '2027-01']);
  });

  it('finds the month a date falls in', () => {
    expect(monthOfDate(new Date(2026, 10, 15))).toBe('2026-11');
    expect(dayOfDate(new Date(2026, 10, 6))).toBe('2026-11-06');
  });
});

describe('planSetAside', () => {
  it('keeps one flat amount when a far deadline drives the plan', () => {
    const plan = planSetAside(
      [
        envelope({ id: 'flights', targetCents: 30_000, dueMonth: '2027-01' }),
        envelope({ id: 'laptop', targetCents: 240_000, dueMonth: '2027-09' }),
      ],
      '2026-11',
    );

    // €2,700 over 11 months = €245.45…; the 5 leftover cents go to the first months.
    expect(totalsOf(plan)).toEqual([...Array(5).fill(24_546), ...Array(6).fill(24_545)]);
    expect(receivedBy(plan, 'flights', '2027-01')).toBe(30_000);
    expect(receivedBy(plan, 'laptop', '2027-09')).toBe(240_000);
  });

  it('raises the rate until a near deadline that needs more, then drops', () => {
    const plan = planSetAside(
      [
        envelope({ id: 'flights', targetCents: 120_000, dueMonth: '2027-01' }),
        envelope({ id: 'laptop', targetCents: 120_000, dueMonth: '2027-09' }),
      ],
      '2026-11',
    );

    expect(totalsOf(plan)).toEqual([...Array(3).fill(40_000), ...Array(8).fill(15_000)]);
    expect(receivedBy(plan, 'flights', '2027-01')).toBe(120_000);
  });

  it('keeps the same rate after paying early; it now repays the loan', () => {
    // Flights due in January, €400 saved, booked in November for €1,200.
    const flights = envelope({
      id: 'flights',
      targetCents: 120_000,
      dueMonth: '2027-01',
      savedCents: 40_000,
      paidMonth: '2026-11',
    });

    expect(loanCents(flights)).toBe(80_000);
    expect(totalsOf(planSetAside([flights], '2026-12'))).toEqual([40_000, 40_000]);
  });

  it('repays a loan before another bill needs that money', () => {
    // Flights were paid early with money that was partly saved for the laptop.
    const plan = planSetAside(
      [
        envelope({ id: 'laptop', targetCents: 60_000, dueMonth: '2027-01', savedCents: 40_000 }),
        envelope({
          id: 'flights',
          targetCents: 120_000,
          dueMonth: '2027-03',
          savedCents: 40_000,
          paidMonth: '2026-11',
        }),
      ],
      '2026-12',
    );

    // Savings are €400 short now; the laptop bill (€600) arrives in January.
    // Spreading the €1,000 still owed evenly to March would leave savings short then,
    // so the full amount comes in before the laptop bill instead.
    expect(totalsOf(plan)).toEqual([50_000, 50_000, 0, 0]);
  });

  it('treats a missed deadline as due this month', () => {
    const plan = planSetAside(
      [envelope({ id: 'gift', targetCents: 10_000, dueMonth: '2026-10' })],
      '2026-11',
    );

    expect(plan).toEqual([
      { month: '2026-11', totalCents: 10_000, byEnvelope: { gift: 10_000 }, billsOut: { gift: 10_000 } },
    ]);
  });

  it('shows each bill in the month it leaves savings', () => {
    const plan = planSetAside(
      [
        envelope({ id: 'flights', targetCents: 90_000, dueMonth: '2027-01', savedCents: 30_000, paidMonth: '2026-11' }),
        envelope({ id: 'tyres', targetCents: 48_000, dueMonth: '2026-12' }),
      ],
      '2026-11',
    );

    // Paid flights went out when booked, not at the trip; unpaid tyres go out at their deadline.
    expect(plan.map((month) => month.billsOut)).toEqual([{ flights: 90_000 }, { tyres: 48_000 }, {}]);
  });

  describe('splitting each month across envelopes', () => {
    it('gives the near goal a steady share and the far goal the rest', () => {
      const plan = planSetAside(
        [
          envelope({ id: 'flights', targetCents: 30_000, dueMonth: '2027-01' }),
          envelope({ id: 'laptop', targetCents: 240_000, dueMonth: '2027-09' }),
        ],
        '2026-11',
      );

      expect(plan[0].byEnvelope).toEqual({ flights: 10_000, laptop: 14_546 });
      expect(plan[2].byEnvelope).toEqual({ flights: 10_000, laptop: 14_546 });
      // Once the flights are covered, the laptop takes over the whole amount.
      expect(plan[3].byEnvelope).toEqual({ laptop: 24_546 });
      expect(plan[10].byEnvelope).toEqual({ laptop: 24_545 });
    });

    it('shares every month steadily between goals with the same deadline', () => {
      const plan = planSetAside(
        [
          envelope({ id: 'concert', targetCents: 60_000, dueMonth: '2027-01' }),
          envelope({ id: 'gift', targetCents: 30_000, dueMonth: '2027-01' }),
        ],
        '2026-11',
      );

      for (const month of plan) {
        expect(month.byEnvelope).toEqual({ concert: 20_000, gift: 10_000 });
      }
    });

    it('starts a far goal only once a tight near deadline leaves room', () => {
      const plan = planSetAside(
        [
          envelope({ id: 'flights', targetCents: 120_000, dueMonth: '2027-01' }),
          envelope({ id: 'laptop', targetCents: 120_000, dueMonth: '2027-09' }),
        ],
        '2026-11',
      );

      expect(plan[0].byEnvelope).toEqual({ flights: 40_000 });
      expect(plan[3].byEnvelope).toEqual({ laptop: 15_000 });
    });
  });

  it('has nothing to plan without envelopes', () => {
    expect(planSetAside([], '2026-11')).toEqual([]);
  });
});
