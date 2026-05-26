import { describe, expect, it } from 'vitest';
import type { ParsedCsvRow, SubAccountMappings } from './csvImportTypes';
import {
  reviewBuildKey,
  stableMappingsJson,
  subAccountMappingsEqual,
} from './reviewBuildKey';

function row(rowIndex: number): ParsedCsvRow {
  return {
    rowIndex,
    type: 'Gutschrift',
    bookingDate: '2026-05-01',
    cardDate: null,
    amount: 100,
    payee: 'Test',
    iban: null,
    bic: null,
    reference: null,
    description: null,
    accountNumber: '1',
    accountName: 'C24 Pluskonto',
    category: null,
    subcategory: null,
    cashWithdrawal: null,
  };
}

const baseMappings: SubAccountMappings = {
  Essen: { type: 'envelope', linkedId: 'env-food' },
};

describe('reviewBuildKey', () => {
  const rows = [row(1), row(2)];

  it('is stable for the same period, rows, and mappings', () => {
    const a = reviewBuildKey('2026-05-01', '2026-05-31', rows, baseMappings);
    const b = reviewBuildKey('2026-05-01', '2026-05-31', rows, baseMappings);
    expect(a).toBe(b);
  });

  it('changes when period start or end changes', () => {
    const base = reviewBuildKey('2026-05-01', '2026-05-31', rows, baseMappings);
    expect(reviewBuildKey('2026-04-01', '2026-05-31', rows, baseMappings)).not.toBe(base);
    expect(reviewBuildKey('2026-05-01', '2026-06-30', rows, baseMappings)).not.toBe(base);
  });

  it('changes when filtered row indices change', () => {
    const base = reviewBuildKey('2026-05-01', '2026-05-31', rows, baseMappings);
    expect(reviewBuildKey('2026-05-01', '2026-05-31', [row(1)], baseMappings)).not.toBe(
      base,
    );
    expect(
      reviewBuildKey('2026-05-01', '2026-05-31', [row(1), row(3)], baseMappings),
    ).not.toBe(base);
  });

  it('changes when sub-account mappings change', () => {
    const base = reviewBuildKey('2026-05-01', '2026-05-31', rows, baseMappings);
    const other: SubAccountMappings = {
      Essen: { type: 'checking' },
    };
    expect(reviewBuildKey('2026-05-01', '2026-05-31', rows, other)).not.toBe(base);
  });

  it('stableMappingsJson ignores mapping key order', () => {
    const a: SubAccountMappings = {
      Z: { type: 'pot' },
      A: { type: 'checking' },
    };
    const b: SubAccountMappings = {
      A: { type: 'checking' },
      Z: { type: 'pot' },
    };
    expect(stableMappingsJson(a)).toBe(stableMappingsJson(b));
    expect(subAccountMappingsEqual(a, b)).toBe(true);
    expect(reviewBuildKey('2026-05-01', '2026-05-31', rows, a)).toBe(
      reviewBuildKey('2026-05-01', '2026-05-31', rows, b),
    );
  });

  it('documents skip-rebuild: equal keys mean allocations are not regenerated', () => {
    const keyBeforeEdit = reviewBuildKey('2026-05-01', '2026-05-31', rows, baseMappings);
    // User edits confirmedCategory in UI; period/rows/mappings unchanged → same key.
    const keyAfterNavigationOnly = reviewBuildKey(
      '2026-05-01',
      '2026-05-31',
      rows,
      baseMappings,
    );
    expect(keyAfterNavigationOnly).toBe(keyBeforeEdit);
    // useCsvImport skips buildReviewableTransactions when key === lastReviewBuildKey
    // and transactions.length > 0, so confirmedCategory on existing rows is preserved.
  });
});
