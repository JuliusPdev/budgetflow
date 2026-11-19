import { describe, expect, it } from 'vitest';
import { wholeEuros } from './wholeEuros';

describe('wholeEuros', () => {
  it('rounds shares to whole euros and keeps their total', () => {
    expect(wholeEuros({ show: 11_786, gifts: 16_072, trip: 2_142 })).toEqual({ show: 11_800, gifts: 16_100, trip: 2_100 });
  });

  it('gives the missing euro to the biggest fraction', () => {
    // €100 split three ways: €33.34 · €33.33 · €33.33 → €34 · €33 · €33.
    expect(wholeEuros({ a: 3_334, b: 3_333, c: 3_333 })).toEqual({ a: 3_400, b: 3_300, c: 3_300 });
  });

  it('leaves whole amounts alone', () => {
    expect(wholeEuros({ a: 15_000, b: 11_000 })).toEqual({ a: 15_000, b: 11_000 });
  });
});
