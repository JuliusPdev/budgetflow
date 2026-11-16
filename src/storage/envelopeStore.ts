import { DEFAULT_PAYDAY } from '../engine/timing';
import type { BudgetData, BudgetSettings, Envelope, LogEntry, SavedData } from '../engine/types';

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

/** Checks that a value read from storage really has the shape of an envelope. */
export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    isWholeCents(candidate.targetCents) &&
    isMonth(candidate.dueMonth) &&
    isWholeCents(candidate.savedCents) &&
    (candidate.paidMonth === undefined || isMonth(candidate.paidMonth)) &&
    // An exact date must be a real-looking day inside the due month.
    (candidate.dueDate === undefined ||
      (typeof candidate.dueDate === 'string' &&
        DAY_PATTERN.test(candidate.dueDate) &&
        candidate.dueDate.slice(0, 7) === candidate.dueMonth))
  );
}

function isSplit(value: unknown): value is Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(isWholeCents);
}

/** Checks that a value read from storage really has the shape of a log entry. */
export function isLogEntry(value: unknown): value is LogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const common =
    typeof candidate.id === 'string' &&
    typeof candidate.date === 'string' &&
    DAY_PATTERN.test(candidate.date) &&
    isMonth(candidate.month) &&
    isWholeCents(candidate.amountCents);
  if (!common) return false;
  if (candidate.kind === 'set-aside') return isSplit(candidate.split);
  if (candidate.kind === 'withdrawal') return typeof candidate.envelopeId === 'string';
  return false;
}

function isSettings(value: unknown): value is BudgetSettings {
  if (typeof value !== 'object' || value === null) return false;
  const payday = (value as Record<string, unknown>).payday;
  return typeof payday === 'number' && Number.isInteger(payday) && payday >= 1 && payday <= 31;
}

/**
 * Reads saved data in any version this app knows:
 *   1 — envelopes only, read as an empty log
 *   2 — envelopes and the savings log
 *   3 — plus exact due dates and settings
 * Older versions get the default settings (payday on the 1st), which keeps
 * their calculations exactly as they were.
 */
function parseSavedData(raw: string): BudgetData | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const data = parsed as Record<string, unknown>;
    if (!Array.isArray(data.envelopes) || !data.envelopes.every(isEnvelope)) return null;
    if (data.version === 1) return { envelopes: data.envelopes, log: [], settings: DEFAULT_SETTINGS };
    if (!Array.isArray(data.log) || !data.log.every(isLogEntry)) return null;
    if (data.version === 2) return { envelopes: data.envelopes, log: data.log, settings: DEFAULT_SETTINGS };
    if (data.version === 3 && isSettings(data.settings)) {
      return { envelopes: data.envelopes, log: data.log, settings: data.settings };
    }
    return null;
  } catch {
    return null;
  }
}

/** Always writes the newest version. */
function toSavedData(data: BudgetData): SavedData {
  return { version: 3, envelopes: data.envelopes, log: data.log, settings: data.settings };
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
