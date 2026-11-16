// The shapes of all data BudgetFlow works with.
// Nothing in this file *does* anything — it only describes what data looks like,
// so TypeScript can catch mistakes before the app runs.

/**
 * A calendar month written as "YYYY-MM", e.g. "2027-01" for January 2027.
 * Year-first so that sorting the text also sorts by date.
 */
export type Month = string;

/**
 * Money is always stored in whole cents (€12.50 → 1250), never as decimals,
 * because computers add decimals inexactly (0.1 + 0.2 ≠ 0.3).
 */
export type Cents = number;

/**
 * One known future one-off expense, and the money set aside for it so far.
 * Only facts are stored here; the monthly share is always recalculated,
 * so it can never go stale or contradict the facts.
 */
export interface Envelope {
  /** Permanent serial number; stays the same even if the name changes. */
  id: string;
  name: string;
  /** The full amount you'll need to pay. */
  targetCents: Cents;
  /**
   * The latest month the money is needed (for a trip: the trip month).
   * This month's own set-aside still counts toward it.
   */
  dueMonth: Month;
  /**
   * How much you have put toward this expense so far. Paying the bill does
   * not change this — it only moves money out of the savings account.
   */
  savedCents: Cents;
  /**
   * The month the bill was actually paid; empty means not paid yet.
   * Paying before the envelope is full borrows the gap from savings,
   * which the plan then repays by `dueMonth`.
   */
  paidMonth?: Month;
}

/** An envelope's own details, without its id — what a form edits. */
export type EnvelopeFields = Omit<Envelope, 'id'>;

/** A calendar day written as "YYYY-MM-DD". */
export type Day = string;

/**
 * Money moved into savings, and exactly how it was split across envelopes —
 * remembered so that deleting the entry can undo precisely what it did.
 */
export interface SetAsideEntry {
  id: string;
  kind: 'set-aside';
  date: Day;
  month: Month;
  amountCents: Cents;
  /** Cents added to each envelope, by envelope id. */
  split: Record<string, Cents>;
}

/** Money taken out for something unplanned, recorded as a loan envelope to repay. */
export interface WithdrawalEntry {
  id: string;
  kind: 'withdrawal';
  date: Day;
  month: Month;
  amountCents: Cents;
  /** The loan envelope this withdrawal created. */
  envelopeId: string;
}

export type LogEntry = SetAsideEntry | WithdrawalEntry;

/** Everything about your budget: the envelopes, and the log of what you actually did. */
export interface BudgetData {
  envelopes: Envelope[];
  log: LogEntry[];
}

/**
 * Everything BudgetFlow saves. The version number lets the app recognize data
 * written in an older shape and convert it instead of crashing:
 *   1 — envelopes only (read as an empty log)
 *   2 — envelopes and the savings log
 */
export interface SavedData extends BudgetData {
  version: 2;
}
