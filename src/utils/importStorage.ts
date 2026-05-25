import type {
  ConfirmedTransaction,
  ImportSessions,
  LastSettleMeta,
  ParsedCsvRow,
  SubAccountMappings,
} from '../engine/csvImportTypes';
import { findPriorMatch } from '../engine/importMatching';
import type { Month } from '../engine/types';
import { addMonths } from '../engine/smoothing';

const MAPPINGS_KEY = 'budgetflow-sub-account-mappings';
const SESSIONS_KEY = 'budgetflow-import-sessions';
const LAST_SETTLE_KEY = 'budgetflow-last-settle';

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function loadSubAccountMappings(): SubAccountMappings {
  try {
    const raw = localStorage.getItem(MAPPINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SubAccountMappings;
  } catch {
    return {};
  }
}

export function saveSubAccountMappings(mappings: SubAccountMappings): void {
  try {
    localStorage.setItem(MAPPINGS_KEY, JSON.stringify(mappings));
  } catch {
    // ignore quota errors
  }
}

export function loadImportSessions(): ImportSessions {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ImportSessions;
  } catch {
    return {};
  }
}

export function saveImportSessions(sessions: ImportSessions): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // ignore
  }
}

export function loadLastSettleMeta(): LastSettleMeta | null {
  try {
    const raw = localStorage.getItem(LAST_SETTLE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastSettleMeta;
  } catch {
    return null;
  }
}

export function saveLastSettleMeta(meta: LastSettleMeta): void {
  try {
    localStorage.setItem(LAST_SETTLE_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

export function loadAllPriorConfirmed(): ConfirmedTransaction[] {
  const sessions = loadImportSessions();
  const rows: ConfirmedTransaction[] = [];
  for (const session of Object.values(sessions)) {
    if (session.status === 'complete' && session.confirmedRows) {
      rows.push(...session.confirmedRows);
    }
  }
  return rows;
}

export function getDefaultSettlePeriod(currentMonth: Month): { start: string; end: string } {
  const end = getTodayIso();
  const last = loadLastSettleMeta();
  if (last?.periodEnd) {
    return { start: addDays(last.periodEnd, 1), end };
  }
  const prior = loadAllPriorConfirmed();
  if (prior.length > 0) {
    const maxDate = prior.reduce((max, c) => (c.date > max ? c.date : max), prior[0].date);
    return { start: addDays(maxDate, 1), end };
  }
  const startMonth = addMonths(currentMonth, -3);
  return { start: `${startMonth}-01`, end };
}

export function countOverlapWithPrior(
  rows: ParsedCsvRow[],
  periodStart: string,
  periodEnd: string,
): number {
  const prior = loadAllPriorConfirmed();
  let count = 0;
  for (const row of rows) {
    if (row.bookingDate < periodStart || row.bookingDate > periodEnd) continue;
    if (findPriorMatch(row, prior)) count++;
  }
  return count;
}

export function clearImportData(): void {
  localStorage.removeItem(MAPPINGS_KEY);
  localStorage.removeItem(SESSIONS_KEY);
  localStorage.removeItem(LAST_SETTLE_KEY);
}

export function clearImportSessions(): void {
  localStorage.removeItem(SESSIONS_KEY);
  localStorage.removeItem(LAST_SETTLE_KEY);
}
