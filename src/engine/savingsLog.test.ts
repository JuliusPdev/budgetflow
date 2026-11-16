import { describe, expect, it } from 'vitest';
import { planSetAside } from './plan';
import { applySplit, envelopesAtMonthStart, setAsideInMonth, splitSetAside, stillOpenThisMonth } from './savingsLog';
import type { Envelope, LogEntry, SetAsideEntry } from './types';

// All amounts are made up. Smoothing gives a flat €240/month (Nov–Feb). In November
// that's €200 for the flights (due Jan) and €40 for the tyres (due Feb), whose
// share grows once the flights are covered.
const flights: Envelope = { id: 'flights', name: 'Flights', targetCents: 90_000, dueMonth: '2027-01', savedCents: 30_000 };
const tyres: Envelope = { id: 'tyres', name: 'Tyres', targetCents: 48_000, dueMonth: '2027-02', savedCents: 12_000 };
const envelopes = [flights, tyres];
const NOVEMBER = '2026-11';

function setAside(amountCents: number, split: Record<string, number>, month = NOVEMBER): SetAsideEntry {
  return { id: `entry-${amountCents}`, kind: 'set-aside', date: `${month}-16`, month, amountCents, split };
}

describe('splitSetAside', () => {
  const novemberPlan = planSetAside(envelopes, NOVEMBER)[0];

  it('follows this month plan exactly when you set aside the planned amount', () => {
    expect(novemberPlan.byEnvelope).toEqual({ flights: 20_000, tyres: 4_000 });
    expect(splitSetAside(24_000, novemberPlan, envelopes, [])).toEqual({
      split: { flights: 20_000, tyres: 4_000 },
      extraCents: 0,
    });
  });

  it('covers the closest deadline first when you set aside less', () => {
    expect(splitSetAside(22_000, novemberPlan, envelopes, []).split).toEqual({ flights: 20_000, tyres: 2_000 });
  });

  it('sends anything extra towards the next deadlines', () => {
    // Plan shares first (200 + 40), then the extra €100 to flights, the closest deadline.
    expect(splitSetAside(34_000, novemberPlan, envelopes, []).split).toEqual({ flights: 30_000, tyres: 4_000 });
  });

  it('only fills what earlier entries this month left open', () => {
    const earlier: LogEntry[] = [setAside(20_000, { flights: 20_000 })];
    const afterEarlier = applySplit(envelopes, { flights: 20_000 }, 1);
    expect(splitSetAside(4_000, novemberPlan, afterEarlier, earlier).split).toEqual({ tyres: 4_000 });
  });

  it('keeps what no envelope needs as extra in the pot', () => {
    // Everything still needed: flights €600 + tyres €360 = €960.
    expect(splitSetAside(100_000, novemberPlan, envelopes, [])).toEqual({
      split: { flights: 60_000, tyres: 36_000 },
      extraCents: 4_000,
    });
  });
});

describe('this month stays fixed while you log against it', () => {
  it('plans from the envelopes as they were at the start of the month', () => {
    const log = [setAside(24_000, { flights: 20_000, tyres: 4_000 })];
    const now = applySplit(envelopes, { flights: 20_000, tyres: 4_000 }, 1);

    expect(envelopesAtMonthStart(now, log, NOVEMBER)).toEqual(envelopes);
    expect(planSetAside(envelopesAtMonthStart(now, log, NOVEMBER), NOVEMBER)[0].totalCents).toBe(24_000);
    // Last month's entries already count as saved.
    expect(envelopesAtMonthStart(now, log, '2026-12')).toEqual(now);
  });

  it('adds up what was set aside in a month', () => {
    const log = [setAside(20_000, {}), setAside(9_000, {}), setAside(5_000, {}, '2026-10')];
    expect(setAsideInMonth(log, NOVEMBER)).toBe(29_000);
  });
});

describe('applySplit', () => {
  it('adds a split, and takes it back off without going below zero', () => {
    const added = applySplit(envelopes, { flights: 20_000 }, 1);
    expect(added[0].savedCents).toBe(50_000);
    expect(applySplit(added, { flights: 20_000 }, -1)).toEqual(envelopes);
    expect(applySplit(envelopes, { tyres: 50_000 }, -1)[1].savedCents).toBe(0);
  });
});

describe('stillOpenThisMonth', () => {
  it('is the plan minus what was logged, never below zero', () => {
    const novemberPlan = planSetAside(envelopes, NOVEMBER)[0];
    expect(stillOpenThisMonth(novemberPlan, [])).toBe(24_000);
    expect(stillOpenThisMonth(novemberPlan, [setAside(20_000, {})])).toBe(4_000);
    expect(stillOpenThisMonth(novemberPlan, [setAside(30_000, {})])).toBe(0);
    expect(stillOpenThisMonth(undefined, [])).toBe(0);
  });
});
