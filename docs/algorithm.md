# BudgetFlow: Smoothing Algorithm v2.0

---

## Core Principle

The algorithm maximizes free budget while guaranteeing every expense is fully funded by its deadline. It never over-saves. The pot (accumulated set-aside minus paid expenses) ends at zero after the last expense.

---

## Inputs

- A = available per month (income minus fixed expenses minus Mode B savings contributions)
- List of planned expenses, each with an amount and a target month. Mode A savings goals are included here (treated as expenses at their target date for the remaining amount).
- Current month (start of planning window)
- Locked amounts for past months and the current month (facts about money already transferred)

---

## The Algorithm

### Handling past months

Past months (before current month) have permanent locked amounts. Calculate the pot carry-forward: sum of all locked amounts from past months, minus all expenses that hit in those past months. This pot balance is a starting input for the current planning window.

### For current month and future months

**Step 1: Determine planning window**

From current month through the last month that has a planned expense. Minimum 9 months ahead if no expenses exist beyond that.

**Step 2: Calculate net amount needed**

Total all remaining expenses within the window. Subtract the pot carry-forward from past months. This is the net amount that needs to be saved.

**Step 3: Try equal distribution**

Ideal set-aside rate = net amount needed / number of months in window.

Free budget = A - ideal rate.

**Step 4: Feasibility check**

Simulate month by month, starting with the carried pot balance. Each month, add the set-aside rate to the pot. In the target month of an expense, the contribution is added BEFORE the expense is paid (the target month is a saving month too). Check that the pot never goes negative after paying any expense.

If the pot stays non-negative throughout: done. Equal free budget, zero over-saving.

**Step 5: If pot goes negative — find binding constraint**

For each expense deadline D (counting from start of window), calculate:

(cumulative expenses through D - pot carry-forward) / number of months through D

The deadline with the highest ratio is the binding constraint. This is the minimum set-aside rate for the months up to and including that deadline.

**Step 6: Split and re-equalize**

Set the rate for months up to the binding deadline to the binding rate. Calculate the pot balance after this first segment. For remaining months: remaining expenses minus pot balance = amount still needed. Distribute over remaining months.

**Step 7: Recursively check remaining segment**

Apply steps 3-6 to the remaining months. If another deadline is too tight, split again. Repeat until all segments are feasible.

**Step 8: Verify**

Simulate the full timeline with final set-aside amounts. Pot must never go negative. Pot should end at zero (or very close) after the last expense.

---

## Current Month and Lock-In

The current month is NEVER frozen in the algorithm. It participates like any other month.

When the user has locked an amount for the current month and the algorithm recalculates:

1. The engine calculates the optimal set-aside for the current month as part of the full recalculation.
2. It compares the new optimal amount against the locked amount.
3. Three outcomes:
   - New rate = locked: "You're on track."
   - New rate > locked: "You've set aside €X. New plan needs €Y. Set aside an additional €Z." User can lock the additional amount.
   - New rate < locked: "You've set aside €X. New plan only needs €Y. You can free up €Z." Free budget does NOT increase until user clicks "Free up."

**A month becomes truly done when the calendar moves past it.** At that point, its locked amount becomes a permanent historical fact feeding the pot carry-forward.

**Multiple lock-ins per month are supported.** Each adds to the total locked for that month.

**Free budget reflects locked reality:** Free budget = A - locked amount - pending set-aside (for items not yet locked). It does not change based on theoretical recalculations until the user acts (locks more or frees up).

---

## Verification Examples

### Example A: Back-loaded expenses (equal distribution works)

Available: €1,000/month. Expenses: €100 month 2, €500 month 5, €2,000 month 8. No pot carry.

- Total: €2,600 / 8 months = €325/month
- Pot: M1=325, M2=650-100=550, M3=875, M4=1200, M5=1525-500=1025, M6=1350, M7=1675, M8=2000-2000=0
- All non-negative. Pot ends at 0.
- **Result: €325/month set-aside. €675 free budget every month.**

### Example B: Front-loaded expenses (constraint forces split)

Available: €1,000/month. Expenses: €800 month 2, €600 month 5, €400 month 8. No pot carry.

- Ideal: €1,800 / 8 = €225/month. Pot at M2: 450-800 = -350. FAIL.
- Binding constraint at M2: €800/2 = €400/month.
- Segment 1 (M1-M2): €400/month. Free = €600. Pot after M2 = 0.
- Remaining: €1,000 / 6 = €167/month. Pot at M5: 501-600 = -99. FAIL.
- Second binding at M5: €600/3 = €200/month.
- Segment 2 (M3-M5): €200/month. Free = €800. Pot after M5 = 0.
- Segment 3 (M6-M8): €400/3 = €133/month. Free = €867. Pot at M8 = 0.
- **Result: M1-2: €600 free. M3-5: €800 free. M6-8: €867 free. Pot ends at 0.**

If your implementation doesn't produce these exact results, the algorithm is wrong.

---

## Key Properties

1. **No over-saving.** Pot ends at zero after last expense.
2. **Maximum free budget.** Within each segment, free budget is the highest possible value that meets all deadlines.
3. **Deadline guarantee.** Pot never goes negative after paying an expense.
4. **Target month is a saving month.** The set-aside contribution in the target month is added to the pot before the expense is paid.
5. **Segments are independent.** A tight early deadline doesn't penalize later months more than necessary.

---

## Early payment recovery vs outstanding funding

When the user pays a planned expense early from the savings pot, two separate jobs share one pot:

| Layer | Purpose | Horizon |
|-------|---------|---------|
| **Funding** | Cover **remaining** planned expenses by **their** deadlines | Each open expense's target month |
| **Recovery** | Refill savings after a **fully paid** early payment | Original target month of that expense |

### Physical dip vs algorithm carry

- **`potActual`** (physical pot now) = past locks + envelope surplus − factual pot deductions, **including** the current month's lock and deductions.
- **`potCarry`** (algorithm carry) = past locks + past envelope − past and current-month deductions. It **excludes** the current month's lock because the algorithm treats the current month like any other saving month.

The funding pass uses **`max(0, potCarry)`** as carry — positive savings from past months reduce how much still needs to be saved, but a negative dip from early payments does **not** accelerate funding. Recovery handles the dip separately.

**Recovery debt sizing** uses `max(0, −potCarry)` once payment months are in the past, so adjusting the **current** month's lock does not move the recommended rate (prevents lock-status oscillation). When the payment happened in the **current** month, the current lock is included in the dip (`max(0, −potActualNow)`).

### Recovery scheduling

For each early payment where the expense is **fully paid** (`remainingAmount === 0`):

1. Compute the **physical dip** (see above).
2. Assign each payment's `potDeduction` to a recovery window from the payment month through the expense's **original target month** (inclusive).
3. If assigned recovery exceeds the physical dip, scale down proportionally.
4. Spread each payment's recovery debt at a **uniform rate over the full window length** (payment month → target month). When the calendar advances, the per-month rate stays the same; only months still in the future receive it.

Partial early payments stay on the **funding** timeline for their remaining balance. Recovery applies only after full payment.

### Combining and feasibility

Each month:

```
totalRate = fundingRate + recoveryRate
```

Rates are planned over a **planning window** that may extend back to the earliest recovery payment month (so denominators stay stable when the calendar advances). Feasibility simulates that full window from the actual pot at the planning start, using **real past locks and deductions** for past months and planned rates from the current month forward. If the combined schedule would fail an expense deadline, raise rates using the existing binding-constraint logic (`smooth()` on the combined expense schedule). Deadlines always win.

**Lock status** treats differences under **€1** as on-track so tiny rounding does not flip between “lock more” and “free up”.

Display fields:

- **`setAsideRecommended`** = combined total (minus envelope pot on current month)
- **`setAsideFunding`** = funding portion
- **`setAsideRecovery`** = recovery portion

### Debt clearance after the last expense

Recovery repays the **initial early-payment dip** only. Large expense hits can still leave the forecast pot negative after the last planned expense. To satisfy “pot ends at zero,” a **debt-clearance** pass runs after funding + recovery:

1. Simulate the forecast pot through the display window.
2. If the terminal pot is negative, spread the shortfall evenly over months **after** the last expense month (through the display end).
3. Clearance is added to **`setAsideFunding`** (not recovery).

Past ledger months show **actual locks** in the set-aside row; recovery and funding sub-rows stay empty (·) — no backfill of planned slices onto closed months.

### Example: Splitwise paid early, Soundboks due August

June: €300 locked, €400 Splitwise paid in full (target October), €800 Soundboks still due August. Physical dip = €300 lock − €400 payment = **−€100**.

- **Funding** (Soundboks only, dip ignored): ~€267/mo toward August
- **Recovery** (€100 dip, June → October): ~€20/mo
- **Combined** ~€287/mo fails the August deadline → floor raises to **~€300/mo** (not €400)

Moving Splitwise's target from October to December lowers the recovery slice (~€14/mo vs ~€20/mo) but does **not** change the August floor when Soundboks is the binding constraint.

---

## Edge Cases

- **Expense in current month**: No smoothing. Full amount deducted from free budget directly.
- **Multiple expenses same month**: Combined into one for the algorithm.
- **Expense exceeds monthly available**: Warn that it cannot be fully funded. User needs existing savings or to reduce/postpone.
- **No expenses planned**: Set-aside = 0. Free budget = full available amount.
- **Only one expense**: Total / months = set-aside per month. Equal by definition.
- **Expense removed with locked surplus**: Prompt user to free up or keep locked. Free budget only updates on explicit free-up action.
