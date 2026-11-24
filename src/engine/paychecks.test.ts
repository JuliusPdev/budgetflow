import { describe, expect, it } from 'vitest';
import { currentPeriod, nextPaycheckMonth } from './paychecks';
import type { LogEntry } from './types';

// Payday usually on the 21st. All dates and amounts are made up.
const PAYDAY = 21;

function paycheck(month: string, date: string): LogEntry {
  return { id: `pay-${month}`, kind: 'paycheck', month, date };
}

describe('which paycheck a press records', () => {
  it('goes to the closest usual payday the very first time', () => {
    expect(nextPaycheckMonth([], '2026-11-19', PAYDAY)).toBe('2026-11');
    expect(nextPaycheckMonth([], '2026-11-24', PAYDAY)).toBe('2026-11');
    expect(nextPaycheckMonth([], '2026-12-02', PAYDAY)).toBe('2026-11');
  });

  it('is the one after the last recorded, however early or late it comes', () => {
    const log = [paycheck('2026-11', '2026-11-19')];
    expect(nextPaycheckMonth(log, '2026-12-18', PAYDAY)).toBe('2026-12');
    expect(nextPaycheckMonth(log, '2026-12-27', PAYDAY)).toBe('2026-12');
  });
});

describe('the current paycheck', () => {
  it('follows the usual payday until a paycheck is recorded', () => {
    expect(currentPeriod([], '2026-11-17', PAYDAY)).toEqual({
      month: '2026-10',
      start: '2026-10-21',
      startIsReal: false,
      nextExpected: '2026-11-21',
      nextIsDue: false,
      daysLate: null,
    });
  });

  it('starts on the day pay really arrived, even before the usual payday', () => {
    const log = [paycheck('2026-11', '2026-11-19')];
    expect(currentPeriod(log, '2026-11-19', PAYDAY)).toMatchObject({ month: '2026-11', start: '2026-11-19', startIsReal: true });
    // Recorded for later: today it hasn't arrived yet.
    expect(currentPeriod(log, '2026-11-18', PAYDAY).month).toBe('2026-10');
  });

  it('waits for the next paycheck instead of switching on the usual payday, and asks', () => {
    const log = [paycheck('2026-11', '2026-11-19')];
    expect(currentPeriod(log, '2026-12-20', PAYDAY)).toMatchObject({ month: '2026-11', nextIsDue: false, daysLate: null });
    // Expected today: not late yet, but the wait has begun.
    expect(currentPeriod(log, '2026-12-21', PAYDAY)).toMatchObject({ month: '2026-11', daysLate: 0 });
    expect(currentPeriod(log, '2026-12-23', PAYDAY)).toMatchObject({
      month: '2026-11',
      nextExpected: '2026-12-21',
      nextIsDue: true,
      daysLate: 2,
    });
  });

  it('moves on once the late paycheck is recorded', () => {
    const log = [paycheck('2026-11', '2026-11-19'), paycheck('2026-12', '2026-12-23')];
    expect(currentPeriod(log, '2026-12-23', PAYDAY)).toMatchObject({ month: '2026-12', start: '2026-12-23', nextIsDue: false, daysLate: null });
  });
});
