import { describe, expect, it } from 'vitest';
import { buildHistory, pastTimelineRows } from './history';
import type { Expense, LogEntry } from './types';

// Made-up amounts. Today's paycheck started on 1 Nov (payday on the 1st) unless a test says otherwise.
const gifts: Expense = { id: 'gifts', name: 'Gifts', targetCents: 30_000, dueMonth: '2026-10', done: { date: '2026-10-28', costCents: 25_000 } };
const trip: Expense = { id: 'trip', name: 'Trip', targetCents: 80_000, dueMonth: '2027-02' };

const log: LogEntry[] = [
  { id: 'start', kind: 'adjustment', amountCents: 50_000, note: 'Starting balance' },
  { id: 's1', kind: 'set-aside', date: '2026-09-02', month: '2026-09', amountCents: 20_000 },
  { id: 's2', kind: 'set-aside', date: '2026-10-01', month: '2026-10', amountCents: 31_000 },
  { id: 'p1', kind: 'payment', date: '2026-10-12', envelopeId: 'trip', amountCents: 20_000, fromSpendingCents: 10_000, note: 'Deposit' },
  { id: 'w1', kind: 'withdrawal', date: '2026-10-15', month: '2026-10', amountCents: 5_000, reason: 'Concert' },
  { id: 's3', kind: 'set-aside', date: '2026-11-01', month: '2026-11', amountCents: 32_500 },
];

describe('a paycheck split saved when the next one came', () => {
  it('shows with the paycheck it belongs to', () => {
    const closes = { paycheck: '2026-10', totalCents: 31_000, lines: [{ id: 'trip', name: 'Trip', cents: 31_000 }] };
    const withSplit: LogEntry[] = [...log, { id: 'pay', kind: 'paycheck', date: '2026-11-01', month: '2026-11', closes }];
    const past = buildHistory(withSplit, [gifts, trip], 1, '2026-11', '2026-11-01');
    expect(past.map((paycheck) => paycheck.split?.totalCents)).toEqual([undefined, 31_000]);
  });
});

describe('looking back', () => {
  const past = buildHistory(log, [gifts, trip], 1, '2026-11', '2026-11-01');

  it('has every paycheck from the first with something in it up to the current one', () => {
    expect(past.map((paycheck) => [paycheck.paycheck, paycheck.from, paycheck.next])).toEqual([
      ['2026-09', '2026-09-01', '2026-10-01'],
      ['2026-10', '2026-10-01', '2026-11-01'],
    ]);
  });

  it('adds up what was really put aside, and lists what happened in date order', () => {
    expect(past.map((paycheck) => paycheck.putAsideCents)).toEqual([20_000, 31_000]);
    expect(past[1].events.map((event) => `${event.kind} ${event.date}`)).toEqual([
      'payment 2026-10-12',
      'withdrawal 2026-10-15',
      'done 2026-10-28',
    ]);
    expect(past[1].events[0]).toMatchObject({ name: 'Trip', fromPotCents: 20_000, fromSpendingCents: 10_000, note: 'Deposit' });
  });

  it('leaves out the current paycheck and the undated starting balance', () => {
    expect(past.flatMap((paycheck) => paycheck.events).some((event) => event.date >= '2026-11-01')).toBe(false);
    expect(past.flatMap((paycheck) => paycheck.events).some((event) => event.kind === 'correction')).toBe(false);
  });

  it('is empty before anything has happened', () => {
    expect(buildHistory([log[0]], [trip], 1, '2026-11', '2026-11-01')).toEqual([]);
  });

  it('starts a paycheck on the day you recorded it', () => {
    // Payday on the 21st, October's pay recorded late on the 23rd.
    const withPaycheck: LogEntry[] = [
      { id: 'pay', kind: 'paycheck', date: '2026-10-23', month: '2026-10' },
      { id: 'early', kind: 'set-aside', date: '2026-10-05', month: '2026-09', amountCents: 10_000 },
    ];
    const late = buildHistory(withPaycheck, [], 21, '2026-11', '2026-11-21');
    expect(late.map((paycheck) => [paycheck.paycheck, paycheck.from, paycheck.next])).toEqual([
      ['2026-09', '2026-09-21', '2026-10-23'],
      ['2026-10', '2026-10-23', '2026-11-21'],
    ]);
    expect(late[0].putAsideCents).toBe(10_000);
  });

  it('becomes timeline rows: month lines, each paycheck start, then its events', () => {
    const rows = pastTimelineRows(past).map(({ event, band }) =>
      event.kind === 'month-start'
        ? `month ${event.month}`
        : event.kind === 'past-paycheck'
          ? `paycheck ${event.paycheck} · band ${band}`
          : event.kind === 'past'
            ? `${event.event.kind} · band ${band}`
            : event.kind,
    );
    expect(rows).toEqual([
      'month 2026-09',
      'paycheck 2026-09 · band 2026-09',
      'month 2026-10',
      'paycheck 2026-10 · band 2026-10',
      'payment · band 2026-10',
      'withdrawal · band 2026-10',
      'done · band 2026-10',
    ]);
  });
});
