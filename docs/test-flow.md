# BudgetFlow: Test Flow

This document defines the full manual test flow for BudgetFlow. It is used as the source of truth for automated end-to-end tests (Playwright) and engine unit tests.

---

## Engine Unit Tests (algorithm.md verification examples)

These must pass before any UI testing begins.

### Test 1: Back-loaded expenses (equal distribution)
- Input: Available €1,000/month. Expenses: €100 month 2, €500 month 5, €2,000 month 8. No pot carry.
- Expected: Set-aside €325/month. Free budget €675 every month. Pot: M2=550, M5=1025, M8=0.

### Test 2: Front-loaded expenses (constraint forces split)
- Input: Available €1,000/month. Expenses: €800 month 2, €600 month 5, €400 month 8. No pot carry.
- Expected: M1-2 set-aside €400 (free €600). M3-5 set-aside €200 (free €800). M6-8 set-aside €133 (free €867). Pot ends at 0.

### Test 3: No expenses
- Input: Available €1,000/month. No expenses.
- Expected: Set-aside €0. Free budget €1,000.

### Test 4: Single expense
- Input: Available €1,000/month. One expense €600 in month 3.
- Expected: Set-aside €200/month (600/3). Free budget €800. Pot ends at 0.

### Test 5: Pot carry-forward
- Input: Available €1,000/month. Pot carry €400 from past months. Expense €600 in month 2.
- Expected: Only €200 still needed. Set-aside €100/month. Free budget €900.

---

## End-to-End UI Test Flow

### Block 1: Onboarding

**1.1 Fresh start**
- Clear localStorage
- Reload app
- Assert: onboarding screen visible with "Start fresh" and "Import backup" buttons

**1.2 Complete onboarding**
- Click "Start fresh"
- Enter income: €3,000
- Add fixed expense: Rent €900 (hard fixed)
- Add fixed expense: Insurance €150 (hard fixed)
- Add envelope: Food €400 (isEnvelope: true)
- Add savings goal: Emergency Fund, target €5,000, deadline 12 months from now (Mode A)
- Assert: summary screen shows a free budget greater than €0
- Click through to dashboard

---

### Block 2: Dashboard Initial State

**2.1 Briefing card**
- Assert: free budget number is visible and large
- Assert: "Currently saving for" section shows "No upcoming expenses planned"
- Assert: savings goal (Emergency Fund) appears with progress bar
- Assert: status message is visible
- Assert: no buttons in the briefing card

**2.2 Management card**
- Assert: income (€3,000) is visible
- Assert: fixed expenses total visible and expandable
- Assert: Food envelope visible separately
- Assert: set-aside section shows a recommended amount
- Assert: "Lock in" button visible
- Assert: pot balance shows €0

**2.3 Monthly grid**
- Assert: at least 3 past month cards visible (muted)
- Assert: current month card has "NOW" badge
- Assert: at least 11 future month cards visible
- Assert: past month cards have no edit controls
- Assert: future month cards have "+ Add expense" button
- Assert: grid auto-scrolled to current month on load

---

### Block 3: Adding a Planned Expense

**3.1 Add expense to future month**
- Click "+ Add expense" on a card 3 months from now
- Enter name: "Summer trip", amount: €800
- Click "Add"
- Assert: expense appears on that month's card
- Assert: "Currently saving for" in briefing now shows "Summer trip"
- Assert: set-aside amounts updated across months
- Assert: free budget decreased

**3.2 Financial guardrail**
- Add a very large expense (€50,000) to a future month
- Assert: red warning shown ("This would push your free budget negative")
- Remove the expense

---

### Block 4: Lock-In

**4.1 Lock in current month**
- In management card, click "Lock in €X"
- Assert: button changes to show "Locked €X (planned)"
- Assert: pot balance on current month card updated
- Assert: free budget unchanged (already reflected set-aside)

**4.2 No double-deduction**
- Assert: free budget after lock-in equals free budget before lock-in

---

### Block 5: Mid-Month Modal

**5.1 Modal appears after lock-in**
- With current month locked, click "+ Add expense" on a future month card
- Enter name: "New laptop", amount: €600, target 4 months from now
- Assert: mid-month modal appears before saving
- Assert: two options shown with calculated implications
- Assert: Option 1 shows additional amount for this month + new monthly rate
- Assert: Option 2 shows monthly rate starting next month only
- Assert: amounts are different between the two options

**5.2 Choose "Start from next month"**
- Select Option 2
- Assert: expense saved
- Assert: current month set-aside unchanged
- Assert: future months show updated set-aside rate

**5.3 Choose "Include this month"**
- Add another planned expense with current month locked
- Select Option 1 in the modal
- Assert: management card shows "Lock in additional €X"
- Assert: current month set-aside recommendation increased

---

### Block 6: Advance Month (Dev Toolbar)

**6.1 Advance one month**
- Click "Next month" in dev toolbar
- Assert: colored simulation banner visible
- Assert: previous current month is now a past month card (muted, read-only)
- Assert: new month has "NOW" badge
- Assert: set-aside rates recalculated for new window
- Assert: pot balance carried forward correctly

**6.2 Lock in new month**
- Lock in set-aside for new current month
- Assert: shows "Locked €X (planned)"

---

### Block 7: Month with Planned Expense Due

**7.1 Advance to trip month**
- Use dev toolbar to advance to the month where "Summer trip" is due
- Assert: "Summer trip" appears in management card as pending settlement
- Assert: briefing status message mentions unsettled expense

**7.2 Savings goal progress**
- Assert: Emergency Fund progress bar has moved from initial state
- Assert: on track / behind / ahead indicator is showing

---

### Block 8: Undo

**8.1 Undo expense addition**
- Add a planned expense
- Assert: undo button appears in header
- Click undo
- Assert: expense removed
- Assert: all numbers reverted to pre-addition state
- Assert: undo button disappears

---

### Block 9: Export and Import

**9.1 Export**
- Go to Settings
- Click "Export Data"
- Assert: JSON file downloaded

**9.2 Import**
- Clear localStorage
- Reload app
- Assert: "Import backup" option visible on onboarding screen
- Click "Import backup", select the exported file
- Assert: dashboard loads with all data restored
- Assert: income, expenses, savings goals, lock-in records all match original

---

### Block 10: Dev Toolbar Reset

**10.1 Reset simulation**
- With a simulated month active, click "Reset"
- Assert: simulation banner disappears
- Assert: app returns to real current month
- Assert: all data intact

---

## Test Environment Notes

- Use a fixed "today" date in tests to avoid flaky date-dependent assertions
- Clear localStorage before each test block
- The dev toolbar DEV_MODE must be enabled for Block 6 and 7 tests
- Engine unit tests run independently of the browser (no localStorage needed)
