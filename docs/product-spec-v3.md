# Claude Code Prompt — Docs Consolidation + Mid-Month Modal

## CRITICAL: Do NOT change any files in src/engine/ calculations or TypeScript types unless explicitly stated below. No UI changes unless explicitly stated.

---

## Step 1: Read the new spec

Read `docs/product-spec.md` (the newly replaced file). Summarize the three most important changes from what you previously knew about the app before writing any code.

---

## Step 2: Audit what currently exists vs. what the spec says

Before touching any code, list:
1. Features that exist in the app but are now removed per the new spec (e.g., live unplanned expense logging)
2. Features that are new and don't exist yet (e.g., mid-month modal, CSV import, lock-in states)
3. Features that exist but need updating (e.g., lock-in now has planned/confirmed states)

Do not implement anything yet. Just give me the audit.

---

## Step 3: Remove live unplanned expense entry

**IMPORTANT: No logic changes. UI changes only.**

The "Add expense" button in the current month management card that adds unplanned expenses live during the month must be removed. Unplanned spending is now captured retrospectively during CSV import.

Also remove any unplanned expense list/section from the current month management card.

The "+ Add expense" button on monthly grid cards for FUTURE months stays (this adds planned expenses). Only remove the live current-month unplanned expense entry.

Explain what you removed and from which files.

---

## Step 4: Update lock-in to have two states

Update the lock-in data model and UI to reflect two states:

**Planned:** User recorded intent to transfer (current behavior — clicking "Lock in" in the app).
**Confirmed:** Verified by CSV import (not yet built, but the data model needs to support it now).

In the TypeScript types, update the Monthly Lock-In Record to include:
- lockState: "planned" | "confirmed"

In the UI, show a subtle visual difference:
- Planned lock-in: "Locked €X (planned)"
- Confirmed lock-in: "Locked €X ✓" with a stronger visual treatment

Default all existing lock-ins to "planned" state.

Explain the type change and the UI difference.

---

## Step 5: Implement the mid-month modal

When a planned expense is added after the current month already has a lock-in (any amount locked, planned or confirmed), show a modal before saving the expense.

**Modal content:**

Title: "How do you want to fund [expense name]?"

Show two options with live-calculated implications:

Option 1 — "Include this month":
Calculate: additional set-aside needed this month + new monthly rate for remaining months
Display: "Set aside an additional €X this month, then €Y/month for [N] months."

Option 2 — "Start from next month":
Calculate: new monthly rate starting next month (current month excluded from the distribution)
Display: "€Z/month for [M] months. Nothing additional this month."

**Edge case:** If Option 2 is mathematically infeasible (pot goes negative before the deadline), show a warning next to Option 2: "Starting next month leaves only [N] months — you'd need €Z/month which may be very tight." Keep Option 2 selectable regardless.

**Buttons:** "Include this month" (primary) and "Start from next month" (secondary). No default selection — user must actively choose.

**What happens after choosing:**
- Option 1: save the expense, flag the current month as needing additional set-aside, engine recalculates
- Option 2: save the expense with the constraint that the current month's set-aside is excluded from this expense's distribution, engine recalculates from next month only

The engine already handles the pot carry-forward logic. The only new thing here is: when Option 2 is chosen, treat the current month's locked amount as fixed and distribute only across future months.

Explain how you're calculating the two options and how Option 2 interacts with the engine.

---

## Early planned-expense payback (implemented)

**User-facing invariant:** Paying early does **not** lower your monthly set-aside plan unless you edit the planned expense amount.

- Set-aside rate is based on the **full** planned amount over the funding window.
- Early payments from the **pot** need no payback.
- Early payments from **free budget** create **recovery owed**, repaid through future set-aside **recovery** slices before **funding** slices.
- UI shows recovery vs funding on set-aside rows and “recovery owed” on planned expense progress (not on the rate).
- CSV reconciliation summary shows plan amount unchanged, amount paid, and recovery owed/repaid.
