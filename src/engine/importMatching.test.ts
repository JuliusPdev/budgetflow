import { describe, expect, it } from 'vitest';
import type { ConfirmedTransaction, ParsedCsvRow } from './csvImportTypes';
import {
  confirmedForMonth,
  dedupeConfirmedByFingerprint,
  findPriorMatch,
  fingerprintParsedRow,
  fingerprintConfirmed,
  sortedAffectedMonths,
} from './importMatching';

function row(overrides: Partial<ParsedCsvRow> = {}): ParsedCsvRow {
  return {
    rowIndex: 1,
    type: 'Gutschrift',
    bookingDate: '2026-05-20',
    cardDate: null,
    amount: 3000,
    payee: 'Employer',
    iban: null,
    bic: null,
    reference: null,
    description: null,
    accountNumber: '1',
    accountName: 'C24 Pluskonto',
    category: null,
    subcategory: null,
    cashWithdrawal: null,
    ...overrides,
  };
}

describe('importMatching', () => {
  it('matches prior row by fingerprint', () => {
    const r = row();
    const prior: ConfirmedTransaction[] = [
      {
        id: 'p1',
        date: r.bookingDate,
        transactionType: r.type,
        payee: r.payee,
        description: null,
        amount: r.amount,
        subAccount: r.accountName,
        confirmedCategory: 'income',
      },
    ];
    expect(findPriorMatch(r, prior)).toBeDefined();
    expect(fingerprintParsedRow(r)).toBe(fingerprintConfirmed(prior[0]));
  });

  it('routes set-aside to lockInMonth not booking month', () => {
    const confirmed: ConfirmedTransaction[] = [
      {
        id: '1',
        date: '2026-05-22',
        transactionType: 'Pocket-Umbuchung',
        payee: '',
        description: null,
        amount: -400,
        subAccount: 'C24 Pluskonto',
        confirmedCategory: 'set-aside-transfer',
        lockInMonth: '2026-06',
      },
    ];
    expect(confirmedForMonth('2026-05', confirmed)).toHaveLength(0);
    expect(confirmedForMonth('2026-06', confirmed)).toHaveLength(1);
    expect(sortedAffectedMonths(confirmed)).toEqual(['2026-06']);
  });

  it('dedupes duplicate fingerprints keeping last', () => {
    const a: ConfirmedTransaction = {
      id: '1',
      date: '2026-04-01',
      transactionType: 'csv',
      payee: 'A',
      description: null,
      amount: -10,
      subAccount: 'X',
      confirmedCategory: 'free-budget-spend',
    };
    const b = { ...a, id: '2', payee: 'B' };
    const out = dedupeConfirmedByFingerprint([a, b]);
    expect(out).toHaveLength(2);
    const c = { ...a, id: '3' };
    const out2 = dedupeConfirmedByFingerprint([a, c]);
    expect(out2).toHaveLength(1);
    expect(out2[0].id).toBe('3');
  });
});
