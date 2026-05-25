import type { Month } from './types';
import { addMonths } from './smoothing';
import type { ConfirmedTransaction, ParsedCsvRow, ReviewableTransaction } from './csvImportTypes';

export function rowFingerprint(parts: {
  date: string;
  amount: number;
  subAccount: string;
  payee: string;
  type: string;
}): string {
  return [parts.date, parts.amount.toFixed(2), parts.subAccount, parts.payee, parts.type].join('|');
}

export function fingerprintParsedRow(row: ParsedCsvRow): string {
  return rowFingerprint({
    date: row.bookingDate,
    amount: row.amount,
    subAccount: row.accountName,
    payee: row.payee,
    type: row.type,
  });
}

export function fingerprintConfirmed(c: ConfirmedTransaction): string {
  return rowFingerprint({
    date: c.date,
    amount: c.amount,
    subAccount: c.subAccount,
    payee: c.payee,
    type: c.transactionType,
  });
}

export function findPriorMatch(
  row: ParsedCsvRow,
  prior: ConfirmedTransaction[],
): ConfirmedTransaction | undefined {
  const fp = fingerprintParsedRow(row);
  return prior.find(p => fingerprintConfirmed(p) === fp);
}

export function bookingMonth(isoDate: string): Month {
  return isoDate.slice(0, 7) as Month;
}

export function latestIncomeDate(rows: ParsedCsvRow[], budgetIncome: number): string | null {
  const tolerance = 0.05;
  let latest: string | null = null;
  for (const row of rows) {
    if (row.amount <= 0) continue;
    if (row.amount < budgetIncome * (1 - tolerance)) continue;
    if (!latest || row.bookingDate > latest) latest = row.bookingDate;
  }
  return latest;
}

export function defaultLockInMonth(
  row: ParsedCsvRow,
  periodRows: ParsedCsvRow[],
  budgetIncome: number,
  currentMonth: Month,
): Month {
  const bookMonth = bookingMonth(row.bookingDate);
  const incomeDate = latestIncomeDate(periodRows, budgetIncome);
  if (incomeDate && bookMonth === currentMonth && row.bookingDate >= incomeDate) {
    return addMonths(bookMonth, 1);
  }
  return bookMonth;
}

export function confirmedForMonth(month: Month, confirmed: ConfirmedTransaction[]): ConfirmedTransaction[] {
  return confirmed.filter(c => {
    if (c.confirmedCategory === 'set-aside-transfer') {
      return (c.lockInMonth ?? bookingMonth(c.date)) === month;
    }
    return c.date.startsWith(month);
  });
}

export function sortedAffectedMonths(confirmed: ConfirmedTransaction[]): Month[] {
  const months = new Set<Month>();
  for (const c of confirmed) {
    if (c.confirmedCategory === 'set-aside-transfer') {
      months.add(c.lockInMonth ?? bookingMonth(c.date));
    } else {
      months.add(bookingMonth(c.date));
    }
  }
  return [...months].sort();
}

export function dedupeConfirmedByFingerprint(confirmed: ConfirmedTransaction[]): ConfirmedTransaction[] {
  const byFp = new Map<string, ConfirmedTransaction>();
  for (const c of confirmed) {
    byFp.set(fingerprintConfirmed(c), c);
  }
  return [...byFp.values()];
}

export function incomeTotalsByMonth(
  confirmed: ConfirmedTransaction[],
): Map<Month, number> {
  const byMonth = new Map<Month, number>();
  for (const c of confirmed) {
    if (c.confirmedCategory !== 'income') continue;
    const m = bookingMonth(c.date);
    byMonth.set(m, (byMonth.get(m) ?? 0) + c.amount);
  }
  return byMonth;
}

/** Pick confirmed income to sync planned monthly income (single budget.income for the engine). */
export function resolvePlannedIncomeUpdate(
  confirmed: ConfirmedTransaction[],
  currentMonth: Month,
  plannedIncome: number,
): { newIncome: number; sourceMonth: Month } | null {
  const totals = incomeTotalsByMonth(confirmed);
  if (totals.size === 0) return null;

  const sourceMonth = totals.has(currentMonth)
    ? currentMonth
    : ([...totals.keys()].sort().at(-1) as Month);
  const newIncome = totals.get(sourceMonth)!;
  if (Math.abs(newIncome - plannedIncome) < 0.01) return null;
  return { newIncome, sourceMonth };
}

export function countNewTransactions(transactions: ReviewableTransaction[]): { newCount: number; settledCount: number } {
  let newCount = 0;
  let settledCount = 0;
  for (const tx of transactions) {
    if (tx.settledPreviously) settledCount++;
    else newCount++;
  }
  return { newCount, settledCount };
}
