# Free budget forecast — plan

Agreed 2026-11-25. To build after the header card redesign is done.

## Why

The app plans what goes into the pot, but not what that means for each
paycheck as a whole. The goal is a **forecast**: for every coming paycheck,
how much it has to carry in total (the "load"), and how much is left free. It
answers "when do I hit my limit?" and "how much can I take on per month?".
This paycheck's real number is in the bank account already, so the forecast
matters most for the paychecks ahead.

## Decisions

1. **Income: usual pay + the real amount.** One usual net pay amount in
   Settings, used for every future paycheck. "Log paycheck" asks for the real
   amount, prefilled with the usual one; a logged paycheck uses what really
   arrived. (`PaycheckEntry.amountCents` already exists, unused so far.)
2. **Fixed costs: a short named list.** Rent, phone, insurance… each with a
   monthly amount; the total is shown. Edited in Settings.
3. **Paid straight from one paycheck: an option in the expense form.** When
   adding or editing an expense: "Save ahead" (today's behaviour) or "Pay from
   that paycheck". The second is never saved for: it stays out of the plan and
   the pot, and only adds to that paycheck's load (lowers its free budget).
   Example: a €150 concert in January.
4. **Where: per paycheck, Columns first.** New rows under each paycheck
   column. The timeline may follow later, once we see how it reads in Columns.
   Not in the header card.

## What Columns would show

```
                    Dec      Jan      Feb
Put aside          €380     €250     €250      (already there)
Fixed costs      €1,200   €1,200   €1,200
From this pay         –     €150        –      (concert)
Total load       €1,580   €1,600   €1,450
Free             €1,020   €1,000   €1,150      (of €2,600 pay)
```

- "Total load" = put aside + fixed costs + paid from this pay. It works even
  before any income is entered.
- "Free" appears only once a usual pay is set; below zero it's shown in red
  as over the limit.

## Data changes (storage version 10)

Version 9 was taken in the meantime (each paycheck's saved split), so these
changes become version 10.


- `settings.usualPayCents?: Cents`
- `settings.fixedCosts: { id, name, amountCents }[]`
- `Expense.fromPaycheck?: true` — "pay from that paycheck", never saved for
- Reading older data: none of these exist yet, so defaults are "not set" and
  an empty list. Sync's `CURRENT_DATA_VERSION` goes to 10 (a phone on the old
  app sees "newer app, reload").

## Build order (one step at a time, each committed on its own)

1. **Engine** (built 2026-11-25): `engine/freeBudget.ts` — per paycheck: put aside (from the
   plan), fixed costs, paid-from-paycheck expenses in that paycheck, total
   load, free (when pay is known; a logged paycheck's real amount wins). Tests
   with made-up numbers.
2. **Pay-from-paycheck expenses:** the expense form option; the planner skips
   these expenses (they never enter `planSetAside` or the pot sharing); they
   show in the timeline as plain money going out on their day.
3. **Settings:** usual pay + the fixed-costs list (add, edit, delete).
4. **Log paycheck amount:** the "Log paycheck" window asks for the real
   amount, prefilled.
5. **Columns rows:** Fixed costs, From this pay, Total load, Free.
6. Later, maybe: the same in the timeline; a warning in the add-expense
   preview when a paycheck's free budget would go below zero.

## Open for later

- Timeline display (user unsure how it would look there).
- Whether fixed costs can change over time (e.g. rent goes up in March).
