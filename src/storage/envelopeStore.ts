import { DEFAULT_PAYDAY } from '../engine/timing';
import type { AdjustmentEntry, BudgetData, BudgetSettings, Expense, LogEntry, SavedData, SetAsideEntry } from '../engine/types';

// The one place that knows where your budget (envelopes and savings log) is kept. Everything else asks this
// door to load or save, and waits for the answer (a Promise). Today the answer
// comes from the browser's localStorage, instantly; later it can come from a
// server without the rest of the app changing.

export interface EnvelopeStore {
  load(): Promise<BudgetData>;
  save(data: BudgetData): Promise<void>;
}

const DEFAULT_SETTINGS: BudgetSettings = { payday: DEFAULT_PAYDAY };
const EMPTY: BudgetData = { envelopes: [], log: [], settings: DEFAULT_SETTINGS };

/** The two things the store needs from a drawer — localStorage has both. */
export interface KeyValueDrawer {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORAGE_KEY = 'budgetflow.envelopes';
/** Where unreadable data is copied before starting fresh, so nothing is lost. */
export const UNREADABLE_BACKUP_KEY = 'budgetflow.envelopes.unreadable';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isWholeCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_PATTERN.test(value);
}

function isDay(value: unknown): value is string {
  return typeof value === 'string' && DAY_PATTERN.test(value);
}

/** Checks that a value read from storage really has the shape of an expense. */
export function isExpense(value: unknown): value is Expense {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    isWholeCents(candidate.targetCents) &&
    isMonth(candidate.dueMonth) &&
    (candidate.paidMonth === undefined || isMonth(candidate.paidMonth)) &&
    // An exact date must be a real-looking day inside the due month.
    (candidate.dueDate === undefined ||
      (isDay(candidate.dueDate) && (candidate.dueDate as string).slice(0, 7) === candidate.dueMonth))
  );
}

/** Checks that a value read from storage really has the shape of a log entry. */
export function isLogEntry(value: unknown): value is LogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string') return false;
  if (candidate.kind === 'set-aside') {
    return isDay(candidate.date) && isMonth(candidate.month) && isWholeCents(candidate.amountCents);
  }
  if (candidate.kind === 'withdrawal') {
    return (
      isDay(candidate.date) &&
      isMonth(candidate.month) &&
      isWholeCents(candidate.amountCents) &&
      (candidate.amountCents as number) > 0 &&
      typeof candidate.reason === 'string'
    );
  }
  if (candidate.kind === 'paycheck') {
    return (
      isDay(candidate.date) &&
      isMonth(candidate.month) &&
      (candidate.amountCents === undefined || isWholeCents(candidate.amountCents))
    );
  }
  if (candidate.kind === 'adjustment') {
    return (
      // A correction can take money away, so it may be below zero.
      Number.isInteger(candidate.amountCents) &&
      (candidate.date === undefined || isDay(candidate.date)) &&
      (candidate.note === undefined || typeof candidate.note === 'string')
    );
  }
  return false;
}

function isSettings(value: unknown): value is BudgetSettings {
  if (typeof value !== 'object' || value === null) return false;
  const payday = (value as Record<string, unknown>).payday;
  return typeof payday === 'number' && Number.isInteger(payday) && payday >= 1 && payday <= 31;
}

// ─── Versions 1–3: each expense held its own saved money ─────────────────────

/** An expense as versions 1–3 stored it: with its own saved money. */
type OldExpense = Expense & { savedCents: number };
/** A log entry as versions 2–3 stored it. */
type OldLogEntry =
  | (SetAsideEntry & { split: Record<string, number> })
  | { id: string; kind: 'withdrawal'; date: string; month: string; amountCents: number; envelopeId: string };

function isOldExpense(value: unknown): value is OldExpense {
  return isExpense(value) && isWholeCents((value as unknown as Record<string, unknown>).savedCents);
}

function isSplit(value: unknown): value is Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(isWholeCents);
}

function isOldLogEntry(value: unknown): value is OldLogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const common =
    typeof candidate.id === 'string' &&
    isDay(candidate.date) &&
    isMonth(candidate.month) &&
    isWholeCents(candidate.amountCents);
  if (!common) return false;
  if (candidate.kind === 'set-aside') return isSplit(candidate.split);
  if (candidate.kind === 'withdrawal') return typeof candidate.envelopeId === 'string';
  return false;
}

/** The fixed id of the starting balance, so every device converts to exactly the same data. */
export const STARTING_BALANCE_ID = 'starting-balance';

/**
 * Converts versions 1–3 to one pot. The money inside the expenses becomes the
 * starting balance — minus what logged set-asides put into them, since those
 * stay in the log and count on their own. Money a set-aside didn't put into
 * any expense (the old "extra in the pot") is now counted too.
 *
 * Deterministic on purpose: no random ids, no dates. Each device converts on
 * its own, and they must arrive at exactly the same budget for sync to agree.
 */
function toOnePot(oldExpenses: OldExpense[], oldLog: OldLogEntry[], settings: BudgetSettings): BudgetData {
  const setAsides: SetAsideEntry[] = [];
  let putInByLog = 0;
  for (const entry of oldLog) {
    // Withdrawals were never released; their loan expense already accounts for the money.
    if (entry.kind !== 'set-aside') continue;
    putInByLog += Object.values(entry.split).reduce((sum, cents) => sum + cents, 0);
    setAsides.push({ id: entry.id, kind: 'set-aside', date: entry.date, month: entry.month, amountCents: entry.amountCents });
  }
  const startingCents = oldExpenses.reduce((sum, expense) => sum + expense.savedCents, 0) - putInByLog;
  const starting: AdjustmentEntry[] =
    startingCents === 0 ? [] : [{ id: STARTING_BALANCE_ID, kind: 'adjustment', amountCents: startingCents, note: 'Starting balance' }];

  const envelopes = oldExpenses.map(onlyExpenseFields);
  return { envelopes, log: [...starting, ...setAsides], settings };
}

/**
 * Reads saved data in any version this app knows:
 *   1 — expenses only, read as an empty log
 *   2 — plus the savings log
 *   3 — plus exact due dates and settings
 *   4 — one pot
 *   5 — plus paychecks in the log
 *   6 — plus withdrawals in the log
 * Versions 1–3 are converted to one pot; versions 1–2 get payday on the 1st,
 * which keeps their calculations as they were.
 */
function parseSavedData(raw: string): BudgetData | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const data = parsed as Record<string, unknown>;
    if (!Array.isArray(data.envelopes)) return null;

    // Versions 5 and 6 only added kinds of log entry, so all three read the same way.
    if (data.version === 4 || data.version === 5 || data.version === 6) {
      if (!data.envelopes.every(isExpense)) return null;
      if (!Array.isArray(data.log) || !data.log.every(isLogEntry) || !isSettings(data.settings)) return null;
      return { envelopes: data.envelopes.map(onlyExpenseFields), log: data.log, settings: data.settings };
    }

    if (!data.envelopes.every(isOldExpense)) return null;
    if (data.version === 1) return toOnePot(data.envelopes, [], DEFAULT_SETTINGS);
    if (!Array.isArray(data.log) || !data.log.every(isOldLogEntry)) return null;
    if (data.version === 2) return toOnePot(data.envelopes, data.log, DEFAULT_SETTINGS);
    if (data.version === 3 && isSettings(data.settings)) return toOnePot(data.envelopes, data.log, data.settings);
    return null;
  } catch {
    return null;
  }
}

/** Drops anything an expense shouldn't carry, so stray fields can't sneak back in. */
function onlyExpenseFields(expense: Expense): Expense {
  const { id, name, targetCents, dueMonth, dueDate, paidMonth } = expense;
  return { id, name, targetCents, dueMonth, dueDate, paidMonth };
}

/** Always writes the newest version. */
function toSavedData(data: BudgetData): SavedData {
  return { version: 6, envelopes: data.envelopes, log: data.log, settings: data.settings };
}

/**
 * The text of a backup file: the same shape as saved data, spread over lines
 * so it stays readable in a text editor.
 */
export function serializeBackup(data: BudgetData): string {
  return JSON.stringify(toSavedData(data), null, 2);
}

/** The budget in a backup file, or null if it isn't a valid BudgetFlow backup. */
export function parseBackup(text: string): BudgetData | null {
  // Same checks as reading the browser's storage, so both agree on what's valid.
  return parseSavedData(text);
}

export function createLocalStore(drawer: KeyValueDrawer): EnvelopeStore {
  return {
    async load() {
      const raw = drawer.getItem(STORAGE_KEY);
      if (raw === null) return EMPTY;

      const data = parseSavedData(raw);
      if (data === null) {
        // Keep a copy before the next save overwrites it.
        drawer.setItem(UNREADABLE_BACKUP_KEY, raw);
        return EMPTY;
      }
      return data;
    },

    async save(data) {
      drawer.setItem(STORAGE_KEY, JSON.stringify(toSavedData(data)));
    },
  };
}
