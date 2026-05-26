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

## Financial baseline (no bank API)

When the user cannot connect a bank, they may enter a **financial baseline** in onboarding or Settings:

| Field | Effect |
|-------|--------|
| `checkingBalance` | Anchors current-month free budget: `max(theoretical, checking − freeSpent)` |
| `potBalance` | Seeds pot carry (minus this month's lock-ins to avoid double-counting) |
| `setAsideTransferredThisMonth` | Creates a planned lock-in for the baseline month |
| `incomeReceivedThisMonth` | Overrides income for that month via `incomeByMonth` |
| `fixedPaidThisMonth` | Reduces theoretical available for the baseline month |
| `freeSpentThisMonth` | Reduces the checking anchor |

Baseline applies only when `financialBaseline.asOfMonth === currentMonth`. If the calendar month moves on, the UI prompts an update; stale baselines do not inflate free budget.

---

## Early planned-expense payments (payback model)

When you pay toward a planned expense **before** its target month, the engine does **not** lower future set-aside rates. The monthly rate is still computed from the **full planned amount** in the funding window.

Each early payment splits into:

- **Pot portion** (`potDeduction`): money already saved in the pot. No payback — it reduced the physical pot when paid.
- **Free-budget portion** (`amount - potDeduction`): money spent from checking that was not in the pot. This creates **recovery owed**.

Each month’s recommended set-aside is split:

1. **Recovery slice** — repays free-budget advances (does not increase the pot).
2. **Funding slice** — saves toward the planned expense (increases the pot toward the target month).

Only the funding slice participates in pot simulation. While recovery is owed, displayed set-aside rates stay on the first-pass schedule (full plan amount); they are not recomputed from a lower “remaining to fund” figure.

**Example:** Trip €800 due in 4 months → ~€200/mo set-aside. Pay €400 early (€200 pot + €200 free budget). Recovery owed = €200. Set-aside stays ~€200/mo; June might allocate €200 recovery then funding slices in later months until recovery is complete.

---

## Edge Cases

- **Expense in current month**: No smoothing. Full amount deducted from free budget directly.
- **Multiple expenses same month**: Combined into one for the algorithm.
- **Expense exceeds monthly available**: Warn that it cannot be fully funded. User needs existing savings or to reduce/postpone.
- **No expenses planned**: Set-aside = 0. Free budget = full available amount.
- **Only one expense**: Total / months = set-aside per month. Equal by definition.
- **Expense removed with locked surplus**: Prompt user to free up or keep locked. Free budget only updates on explicit free-up action.
