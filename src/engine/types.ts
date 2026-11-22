// The shapes of all data BudgetFlow works with.
// Nothing in this file *does* anything — it only describes what data looks like,
// so TypeScript can catch mistakes before the app runs.

/**
 * A calendar month written as "YYYY-MM", e.g. "2027-01" for January 2027.
 * Year-first so that sorting the text also sorts by date.
 */
export type Month = string;

/** A calendar day written as "YYYY-MM-DD". */
export type Day = string;

/**
 * Money is always stored in whole cents (€12.50 → 1250), never as decimals,
 * because computers add decimals inexactly (0.1 + 0.2 ≠ 0.3).
 */
export type Cents = number;

/**
 * One known future one-off expense — only facts you entered. How much of your
 * pot is meant for it is calculated fresh every time (engine/pot.ts),
 * so deleting or adding an expense re-shares the pot automatically.
 */
export interface Expense {
  /** Permanent serial number; stays the same even if the name changes. */
  id: string;
  name: string;
  /** The full amount you'll need to pay. */
  targetCents: Cents;
  /**
   * The calendar month the money is needed in. On its own it means "ready when
   * this month starts"; with `dueDate` it's simply that date's month.
   */
  dueMonth: Month;
  /** The exact day, when known. A week is entered as its first day. */
  dueDate?: Day;
  /**
   * Only on calculated parts, never stored: the month this part was paid. A
   * paid part has left the pot. Paid before its due month, the plan refills the
   * pot by then. Payments live in the log; engine/payments.ts turns them into parts.
   */
  paidMonth?: Month;
  /** Only on calculated parts, never stored: the expense this part belongs to. */
  partOf?: string;
}

/** An expense's own details, without its id — what a form edits. */
export type ExpenseFields = Omit<Expense, 'id'>;

/**
 * An expense together with its current share of the pot — what the planning
 * engine and the screens work with. Never stored: shares change with every change.
 */
export interface Envelope extends Expense {
  /** How much of the pot is meant for this expense right now. */
  savedCents: Cents;
}

/** Money you put aside into the pot. */
export interface SetAsideEntry {
  id: string;
  kind: 'set-aside';
  date: Day;
  /** The paycheck period it belongs to. */
  month: Month;
  amountCents: Cents;
}

/**
 * A correction to what's in the pot, so it matches the money really there —
 * also how the pot started when BudgetFlow switched to one pot. Can be negative.
 */
export interface AdjustmentEntry {
  id: string;
  kind: 'adjustment';
  amountCents: Cents;
  /** When you made the correction; the starting balance has none. */
  date?: Day;
  note?: string;
}

/**
 * Your pay actually arrived. It opens a new paycheck on its real date,
 * instead of the payday you usually expect. It never touches the pot: only what
 * you set aside from it does.
 */
export interface PaycheckEntry {
  id: string;
  kind: 'paycheck';
  /** The day the money arrived. */
  date: Day;
  /** Which paycheck this is: the month of the payday it belongs to. */
  month: Month;
  /** How much it was, if you entered it. Kept for later; not used in any calculation yet. */
  amountCents?: Cents;
}

/**
 * Money you took out of the pot for something unplanned. The pot simply holds
 * less: if an expense was counting on that money, your next set-asides put it
 * back before that expense is due.
 */
export interface WithdrawalEntry {
  id: string;
  kind: 'withdrawal';
  date: Day;
  /** The paycheck period it happened in. */
  month: Month;
  /** How much went out; always above zero. */
  amountCents: Cents;
  /** What it was for. */
  reason: string;
}

/**
 * Money paid out of the pot towards one of your expenses: all of it, or a part.
 * The expense then needs that much less, and if it was paid before the money
 * was there, your next set-asides put the difference back by its due date.
 */
export interface PaymentEntry {
  id: string;
  kind: 'payment';
  date: Day;
  /** The expense it paid for. */
  envelopeId: string;
  /** How much went out; always above zero. */
  amountCents: Cents;
  /** What it was for, like "Accommodation". */
  note?: string;
}

export type LogEntry = SetAsideEntry | AdjustmentEntry | PaycheckEntry | WithdrawalEntry | PaymentEntry;

/** Your choices that shape the calculation, shared by all your devices. */
export interface BudgetSettings {
  /** Day of the month your pay usually arrives (1–31). 1 means plain calendar months. */
  payday: number;
}

/** Everything about your budget: your expenses, the log of money in and out, and your settings. */
export interface BudgetData {
  envelopes: Expense[];
  log: LogEntry[];
  settings: BudgetSettings;
}

/**
 * Everything BudgetFlow saves. The version number lets the app recognize data
 * written in an older shape and convert it instead of crashing:
 *   1 — expenses only, each holding its own saved money
 *   2 — plus the log of money put aside (set-asides split across expenses)
 *   3 — plus exact due dates and settings (payday)
 *   4 — one pot: expenses hold no money; the log says what's in the pot
 *   5 — plus paychecks: when your pay really arrived
 *   6 — plus withdrawals: money taken out of the pot
 *   7 — plus payments: money paid towards an expense, in part or in full
 */
export interface SavedData extends BudgetData {
  version: 7;
}
