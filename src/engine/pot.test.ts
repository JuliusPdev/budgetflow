import { describe, expect, it } from 'vitest';
import { planFromPot, REFILL_ID, sharePot, sharePotByPlan, withShares } from './pot';
import type { Envelope } from './types';

// All amounts are made up. savedCents no longer matters: the pot decides.
const NOVEMBER = '2026-11';
const presents: Envelope = { id: 'presents', name: 'Presents', targetCents: 20_000, dueMonth: '2026-12', savedCents: 0 };
const flights: Envelope = { id: 'flights', name: 'Flights', targetCents: 90_000, dueMonth: '2027-01', savedCents: 0 };
const tyres: Envelope = { id: 'tyres', name: 'Tyres', targetCents: 30_000, dueMonth: '2027-06', savedCents: 0 };

function totalsOf(envelopes: Envelope[], potCents: number): number[] {
  return planFromPot(envelopes, potCents, NOVEMBER).map((month) => month.totalCents);
}

describe('sharePot', () => {
  it('fills the closest deadline first', () => {
    expect(sharePot(30_000, [tyres, flights, presents], NOVEMBER)).toEqual({
      shares: { presents: 20_000, flights: 10_000, tyres: 0 },
      extraCents: 0,
      shortfallCents: 0,
    });
  });

  it('counts money no expense needs as extra', () => {
    expect(sharePot(150_000, [presents, flights, tyres], NOVEMBER).extraCents).toBe(10_000);
  });

  it('frees the money of a deleted expense for the others', () => {
    expect(sharePot(30_000, [flights, tyres], NOVEMBER).shares).toEqual({ flights: 30_000, tyres: 0 });
  });

  it('gives a new expense its share of what is already there', () => {
    // €300 for two €150 expenses; then a third, earlier one arrives and is filled first.
    const a: Envelope = { ...flights, id: 'a', targetCents: 15_000, dueMonth: '2027-02' };
    const b: Envelope = { ...flights, id: 'b', targetCents: 15_000, dueMonth: '2027-03' };
    const c: Envelope = { ...flights, id: 'c', targetCents: 10_000, dueMonth: '2027-01' };
    expect(sharePot(30_000, [a, b], NOVEMBER).shares).toEqual({ a: 15_000, b: 15_000 });
    expect(sharePot(30_000, [a, b, c], NOVEMBER).shares).toEqual({ c: 10_000, a: 15_000, b: 5_000 });
  });

  it('lets an expense paid early claim its bill back until its due month', () => {
    // €300 in the pot, then flights (€900) paid in November: the pot is at −€600.
    const paidEarly: Envelope = { ...flights, paidMonth: NOVEMBER };
    expect(sharePot(-60_000, [paidEarly], NOVEMBER)).toEqual({
      shares: { flights: 30_000 },
      extraCents: 0,
      shortfallCents: 0,
    });
  });

  it('settles an expense once it is paid and past due', () => {
    const settled: Envelope = { ...presents, dueMonth: '2026-10', paidMonth: '2026-10' };
    expect(sharePot(10_000, [settled, flights], NOVEMBER).shares).toEqual({ flights: 10_000 });
  });

  it('reports a pot below zero as a shortfall', () => {
    expect(sharePot(-5_000, [flights], NOVEMBER)).toEqual({
      shares: { flights: 0 },
      extraCents: 0,
      shortfallCents: 5_000,
    });
  });
});

describe('planFromPot', () => {
  it('plans what the pot does not cover yet', () => {
    // €300 covers the presents and €100 of the flights: €800 left by January.
    expect(totalsOf([presents, flights], 30_000)).toEqual([26_667, 26_667, 26_666]);
  });

  it('lowers future set-asides when you put in more', () => {
    expect(totalsOf([presents, flights], 60_000)).toEqual([16_667, 16_667, 16_666]);
  });

  it('plans nothing when the pot covers everything', () => {
    expect(totalsOf([presents, flights], 110_000)).toEqual([0, 0, 0]);
  });

  it('repays an early payment by its due month', () => {
    // Same as before the redesign: €600 borrowed for the flights, repaid Nov–Jan.
    expect(totalsOf([{ ...flights, paidMonth: NOVEMBER }], -60_000)).toEqual([20_000, 20_000, 20_000]);
  });

  it('refills a pot below zero right away', () => {
    const envelopes = withShares([flights], sharePot(-5_000, [flights], NOVEMBER), NOVEMBER);
    expect(envelopes.map((envelope) => envelope.id)).toEqual(['flights', REFILL_ID]);
    // The €50 is due now; the flights' €900 spread over Nov–Jan on top.
    const plan = planFromPot([flights], -5_000, NOVEMBER);
    expect(plan[0].byEnvelope[REFILL_ID]).toBe(5_000);
    expect(plan.reduce((sum, month) => sum + month.totalCents, 0)).toBe(95_000);
  });
});

describe('sharePotByPlan', () => {
  // Your example, with made-up names: €1,120 over four paychecks from November,
  // split 150 / 110 / 20 for Nov and Dec, then 0 / 0 / 280.
  const gifts: Envelope = { id: 'gifts', name: 'Presents', targetCents: 30_000, dueMonth: '2026-12', savedCents: 0 };
  const show: Envelope = { id: 'show', name: 'Musical', targetCents: 22_000, dueMonth: '2026-12', savedCents: 0 };
  const trip: Envelope = { id: 'trip', name: 'Trip', targetCents: 60_000, dueMonth: '2027-02', savedCents: 0 };
  const three = [gifts, show, trip];

  it('fills each expense the way the plan splits a paycheck', () => {
    expect(sharePotByPlan(28_000, three, NOVEMBER, NOVEMBER).shares).toEqual({ gifts: 15_000, show: 11_000, trip: 2_000 });
  });

  it('pours money beyond one paycheck into the next in the same proportions', () => {
    // €300: Nov fully, then €20 of December split 150 : 110 : 20.
    expect(sharePotByPlan(30_000, three, NOVEMBER, NOVEMBER).shares).toEqual({ gifts: 16_072, show: 11_786, trip: 2_142 });
  });

  it('keeps growing in the same pattern in the next period', () => {
    // Still planned from November: €560 is exactly Nov + Dec.
    expect(sharePotByPlan(56_000, three, NOVEMBER, '2026-12').shares).toEqual({ gifts: 30_000, show: 22_000, trip: 4_000 });
  });

  it('frees a deleted expense’s money for the others', () => {
    const shares = sharePotByPlan(28_000, [show, trip], NOVEMBER, NOVEMBER).shares;
    expect(shares.show + shares.trip).toBe(28_000);
  });

  it('counts money beyond every expense as extra, and a pot below zero as a shortfall', () => {
    expect(sharePotByPlan(120_000, three, NOVEMBER, NOVEMBER).extraCents).toBe(8_000);
    expect(sharePotByPlan(-5_000, three, NOVEMBER, NOVEMBER).shortfallCents).toBe(5_000);
  });
});
