import type { Envelope, SavedData } from '../engine/types';

// The one place that knows where envelopes are kept. Everything else asks this
// door to load or save, and waits for the answer (a Promise). Today the answer
// comes from the browser's localStorage, instantly; later it can come from a
// server without the rest of the app changing.

export interface EnvelopeStore {
  load(): Promise<Envelope[]>;
  save(envelopes: Envelope[]): Promise<void>;
}

/** The two things the store needs from a drawer — localStorage has both. */
export interface KeyValueDrawer {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORAGE_KEY = 'budgetflow.envelopes';
/** Where unreadable data is copied before starting fresh, so nothing is lost. */
export const UNREADABLE_BACKUP_KEY = 'budgetflow.envelopes.unreadable';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

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
    (candidate.paidMonth === undefined || isMonth(candidate.paidMonth))
  );
}

function parseSavedData(raw: string): Envelope[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const data = parsed as Record<string, unknown>;
    if (data.version !== 1 || !Array.isArray(data.envelopes)) return null;
    return data.envelopes.every(isEnvelope) ? data.envelopes : null;
  } catch {
    return null;
  }
}

export function createLocalStore(drawer: KeyValueDrawer): EnvelopeStore {
  return {
    async load() {
      const raw = drawer.getItem(STORAGE_KEY);
      if (raw === null) return [];

      const envelopes = parseSavedData(raw);
      if (envelopes === null) {
        // Keep a copy before the next save overwrites it.
        drawer.setItem(UNREADABLE_BACKUP_KEY, raw);
        return [];
      }
      return envelopes;
    },

    async save(envelopes) {
      const data: SavedData = { version: 1, envelopes };
      drawer.setItem(STORAGE_KEY, JSON.stringify(data));
    },
  };
}
