import type { Cents, EnvelopeFields, Month } from '../engine/types';

// The expense form's logic, kept free of React so it can be tested on its own:
// turning typed text into cents, and checking a draft before it is saved.

/** What the form holds while you type: plain text, exactly as entered. */
export interface Draft {
  name: string;
  amount: string;
  /** How precise the due timing is: just a month, or an exact day. */
  dueMode: 'month' | 'date';
  dueMonth: string;
  dueDate: string;
  saved: string;
  isPaid: boolean;
  paidMonth: string;
}

export type DraftField = keyof Draft;
export type DraftErrors = Partial<Record<DraftField, string>>;

/** Fields in screen order, so the first problem can receive focus. */
export const DRAFT_FIELD_ORDER: DraftField[] = ['name', 'amount', 'dueMonth', 'dueDate', 'saved', 'isPaid', 'paidMonth'];

const AMOUNT_PATTERN = /^\d+([.,]\d{1,2})?$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * "899,50" or "899.50" or "€ 900" → cents. Uses whole-number math only, so no
 * decimal rounding errors. Returns null for anything ambiguous like "1,200.50".
 */
export function parseEurosToCents(text: string): Cents | null {
  const cleaned = text.replace(/[€\s]/g, '');
  if (!AMOUNT_PATTERN.test(cleaned)) return null;
  const [euros, cents = ''] = cleaned.split(/[.,]/);
  return Number(euros) * 100 + Number(cents.padEnd(2, '0'));
}

/** 89950 → "899.50", 90000 → "900" — how an amount appears when editing. */
export function centsToInputText(cents: Cents): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** A fresh draft, or one filled in from an existing expense. */
export function draftFrom(existing: EnvelopeFields | undefined, currentMonth: Month): Draft {
  if (existing === undefined) {
    return {
      name: '',
      amount: '',
      dueMode: 'month',
      dueMonth: '',
      dueDate: '',
      saved: '',
      isPaid: false,
      paidMonth: currentMonth,
    };
  }
  return {
    name: existing.name,
    amount: centsToInputText(existing.targetCents),
    dueMode: existing.dueDate === undefined ? 'month' : 'date',
    dueMonth: existing.dueMonth,
    dueDate: existing.dueDate ?? '',
    saved: existing.savedCents === 0 ? '' : centsToInputText(existing.savedCents),
    isPaid: existing.paidMonth !== undefined,
    paidMonth: existing.paidMonth ?? currentMonth,
  };
}

export type DraftResult = { ok: true; fields: EnvelopeFields } | { ok: false; errors: DraftErrors };

/** Checks a draft. Either clean fields ready to save, or a message per problem field. */
export function validateDraft(draft: Draft): DraftResult {
  const errors: DraftErrors = {};

  const name = draft.name.trim();
  if (name === '') errors.name = 'Give this expense a name';

  const targetCents = parseEurosToCents(draft.amount);
  if (targetCents === null || targetCents === 0) {
    errors.amount = 'Enter an amount like 900 or 899.50';
  }

  if (draft.dueMode === 'month' && !MONTH_PATTERN.test(draft.dueMonth)) {
    errors.dueMonth = "Pick the month it's due, like 2027-01";
  }
  if (draft.dueMode === 'date' && !DAY_PATTERN.test(draft.dueDate)) {
    errors.dueDate = 'Pick the day it\'s due, like 2027-01-28';
  }

  const savedCents = draft.saved.trim() === '' ? 0 : parseEurosToCents(draft.saved);
  if (savedCents === null) {
    errors.saved = 'Enter an amount like 150 or 149.50, or leave it empty';
  } else if (targetCents !== null && savedCents > targetCents) {
    errors.saved = "Saved can't be more than the amount";
  }

  if (draft.isPaid && !MONTH_PATTERN.test(draft.paidMonth)) {
    errors.paidMonth = 'Pick the month you paid, like 2026-11';
  }

  if (Object.keys(errors).length > 0 || targetCents === null || savedCents === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    fields: {
      name,
      targetCents,
      // An exact date decides the month; "Month" mode clears any earlier date.
      dueMonth: draft.dueMode === 'date' ? draft.dueDate.slice(0, 7) : draft.dueMonth,
      dueDate: draft.dueMode === 'date' ? draft.dueDate : undefined,
      savedCents,
      // Always present, so unticking "Already paid" clears an earlier paid month.
      paidMonth: draft.isPaid ? draft.paidMonth : undefined,
    },
  };
}
