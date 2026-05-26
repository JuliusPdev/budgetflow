import type { ParsedCsvRow, SubAccountMappings } from './csvImportTypes';

/** Stable JSON for mapping records (sorted keys) so key/compare is order-independent. */
export function stableMappingsJson(mappings: SubAccountMappings): string {
  const keys = Object.keys(mappings).sort();
  const sorted: SubAccountMappings = {};
  for (const k of keys) {
    sorted[k] = mappings[k];
  }
  return JSON.stringify(sorted);
}

export function subAccountMappingsEqual(
  a: SubAccountMappings,
  b: SubAccountMappings,
): boolean {
  return stableMappingsJson(a) === stableMappingsJson(b);
}

/**
 * Fingerprint for when review transactions were last built from CSV + mappings.
 * When `selectPeriod` / `saveMappings` see the same key and existing transactions,
 * they skip `buildReviewableTransactions` so per-row `confirmedCategory` edits survive
 * Back → Continue navigation.
 */
export function reviewBuildKey(
  periodStart: string,
  periodEnd: string,
  periodRows: ParsedCsvRow[],
  mappings: SubAccountMappings,
): string {
  const rowSig = periodRows.map(r => r.rowIndex).join(',');
  return `${periodStart}|${periodEnd}|${rowSig}|${stableMappingsJson(mappings)}`;
}
