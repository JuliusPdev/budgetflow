import { describe, expect, it } from 'vitest';
import { centsToInputText, draftFrom, parseEurosToCents, validateDraft, type Draft } from './expenseDraft';

describe('parseEurosToCents', () => {
  it('reads whole euros, dot or comma decimals, and a euro sign', () => {
    expect(parseEurosToCents('1200')).toBe(120_000);
    expect(parseEurosToCents('899.5')).toBe(89_950);
    expect(parseEurosToCents('899,50')).toBe(89_950);
    expect(parseEurosToCents('€ 300')).toBe(30_000);
  });

  it('refuses ambiguous or non-amounts instead of guessing', () => {
    for (const text of ['1,200.50', '12.345', 'abc', '', '-5']) {
      expect(parseEurosToCents(text)).toBeNull();
    }
  });
});

describe('centsToInputText', () => {
  it('shows cents only when there are some', () => {
    expect(centsToInputText(90_000)).toBe('900');
    expect(centsToInputText(89_950)).toBe('899.50');
  });
});

describe('validateDraft', () => {
  const good: Draft = {
    name: '  Made-up concert ',
    amount: '250',
    dueMode: 'month',
    dueMonth: '2027-03',
    dueDate: '',
    isPaid: false,
    paidMonth: '2026-11',
  };

  it('turns a good draft into clean fields', () => {
    expect(validateDraft(good)).toEqual({
      ok: true,
      fields: {
        name: 'Made-up concert',
        targetCents: 25_000,
        dueMonth: '2027-03',
        dueDate: undefined,
        paidMonth: undefined,
      },
    });
  });

  it('keeps the paid month only when "already paid" is ticked', () => {
    const result = validateDraft({ ...good, isPaid: true });
    expect(result.ok && result.fields.paidMonth).toBe('2026-11');
  });

  it('explains every problem, per field', () => {
    const result = validateDraft({ ...good, name: ' ', amount: '0', dueMonth: '' });
    expect(result).toEqual({
      ok: false,
      errors: {
        name: 'Give this expense a name',
        amount: 'Enter an amount like 900 or 899.50',
        dueMonth: "Pick the month it's due, like 2027-01",
      },
    });
  });

  it('round-trips an existing expense through the form unchanged', () => {
    const existing = {
      name: 'Made-up trip',
      targetCents: 89_950,
      dueMonth: '2027-01',
      dueDate: '2027-01-28',
      paidMonth: '2026-11',
    };
    expect(validateDraft(draftFrom(existing, '2026-11'))).toEqual({ ok: true, fields: existing });
  });

  it('takes the month from an exact date, and clears the date in month mode', () => {
    const dated = validateDraft({ ...good, dueMode: 'date', dueDate: '2026-12-05', dueMonth: '' });
    expect(dated.ok && [dated.fields.dueMonth, dated.fields.dueDate]).toEqual(['2026-12', '2026-12-05']);

    const monthOnly = validateDraft({ ...good, dueMode: 'month', dueDate: '2026-12-05' });
    expect(monthOnly.ok && monthOnly.fields.dueDate).toBeUndefined();

    const missingDay = validateDraft({ ...good, dueMode: 'date', dueDate: '' });
    expect(!missingDay.ok && missingDay.errors.dueDate).toMatch(/Pick the day/);
  });
});
