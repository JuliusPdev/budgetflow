# BudgetFlow: CSV Import Spec — C24 Bank (MVP)

Add to project as `docs/spec-csv-import.md`.

---

## Overview

The CSV import is the primary mechanism for month-end reconciliation. It replaces live expense logging during the month. The user exports a CSV from C24 Bank at month end, imports it into BudgetFlow, reviews every line, and the app updates all balances accordingly.

For MVP, the C24 format is hardcoded. No column mapping setup required. Configurable multi-bank support is deferred to a later version.

---

## C24 Bank CSV Format

The bank exports a CSV with the following columns (in order):

| Column | Key | Notes |
|--------|-----|-------|
| Transaktionstyp | type | Transaction type |
| Buchungsdatum | bookingDate | Format: DD.MM.YYYY |
| Karteneinsatz | cardDate | Optional, can be null |
| Betrag | amount | German decimal (comma separator). Positive = incoming, negative = outgoing |
| Zahlungsempfänger | payee | Recipient/merchant name |
| IBAN | iban | Can be null |
| BIC | bic | Can be null |
| Verwendungszweck | reference | Payment reference, can be null |
| Beschreibung | description | Additional description, can be null |
| Kontonummer | accountNumber | Numeric account ID |
| Kontoname | accountName | Human-readable sub-account name — PRIMARY CATEGORIZATION SIGNAL |
| Kategorie | category | Bank-assigned category |
| Unterkategorie | subcategory | Bank-assigned subcategory |
| Bargeldabhebung | cashWithdrawal | Cash withdrawal type, can be null |

### Key parsing notes

- Delimiter: semicolon (;) — common for German bank exports. If comma-delimited, detect automatically.
- Decimal separator: comma (e.g., -16,22). Must be converted to period before parsing as float.
- Date format: DD.MM.YYYY
- Encoding: UTF-8 or ISO-8859-1 (try UTF-8 first, fallback to ISO-8859-1)
- First row is the header row
- Amounts: negative = money leaving the account, positive = money coming in

### Transaction types (Transaktionstyp)

- `Pocket-Umbuchung` — internal transfer between C24 sub-accounts (pockets)
- `Online-Kartenzahlung` — online card payment
- `Kartenzahlung` — in-person card payment
- `Überweisung` — bank transfer
- `Lastschrift` — direct debit
- `Gutschrift` — credit/incoming transfer (e.g., salary)

---

## Sub-Account to BudgetFlow Mapping

The `Kontoname` column identifies which sub-account a transaction belongs to. The user sets up this mapping once in Settings after their first import (or during onboarding extension). The mapping links a Kontoname value to a BudgetFlow concept.

Example mapping:
- "C24 Pluskonto" → Main checking (free budget account)
- "VERTRÄGE" → Fixed expenses envelope (subscriptions, contracts)
- "Essen" → Food envelope
- "Reisen" → Travel envelope
- "Sparkonto" → Savings / pot account

The mapping is stored in localStorage and reused for every subsequent import.

---

## Pre-Categorization Logic

Using the Kontoname mapping and Transaktionstyp, the app makes a first-pass suggestion for every line:

### Internal transfers (Pocket-Umbuchung)
- From main checking to a savings/pot account → suggest "Pot Transfer (Set aside)" or "Savings contribution"
- From main checking to an envelope → suggest "[Envelope name] transfer"
- Between any accounts → suggest "Internal transfer"

### Transactions on envelope sub-accounts
- Any debit on an envelope sub-account → suggest "[Envelope name] spend"

### Transactions on main checking
- Large incoming amount matching expected income → suggest "Monthly income"
- Debit matching a fixed expense amount + payee → suggest "[Fixed expense name]"
- Debit matching a planned expense amount + timing → suggest "Related to [planned expense name]?"
- All other debits → suggest "Free budget spend"

### Savings/pot sub-account
- Any incoming transfer → suggest "Pot Transfer (Set aside)" or "Savings contribution"

---

## Import Flow (Step by Step)

### Step 1: File upload
- User navigates to "Month-end reconciliation" (new section in Settings or as a prominent button in the management card)
- File picker accepts .csv files only
- After selecting, the app parses the file and shows a preview of detected rows and columns
- If parsing fails, show a clear error message

### Step 2: Month selection
- Ask: "Which month are you reconciling?" (month + year picker)
- Default to the most recently completed month
- Filter imported transactions to only show those within the selected month

### Step 3: Sub-account mapping (first time only)
- If no mapping exists yet, show a one-time setup screen
- List all unique Kontoname values found in the CSV
- For each, ask the user to assign it to a BudgetFlow concept: Main checking / Envelope (pick which) / Pot account / Savings account / Ignore
- Save the mapping to localStorage
- On subsequent imports, skip this step (show a small "Edit mapping" link for changes)

### Step 4: Line-by-line review
This is the core of the import. Show a table with one row per transaction.

**Each row displays:**
- Date (formatted as "9 May 2026")
- Payee (Zahlungsempfänger)
- Description (Beschreibung, if available)
- Amount (formatted as +€X or -€X)
- Sub-account (Kontoname)
- Suggested category (dropdown, pre-filled with app's suggestion)
- Optional: link to planned expense (shown only for relevant suggestions)

**Category dropdown options:**
- Income
- Fixed expense — [select which one]
- Envelope spend — [select which envelope]
- Pot Transfer (Set aside) (confirms pot contribution; internal id `set-aside-transfer`)
- Savings contribution — [select which goal]
- Planned expense settlement — [select which planned expense]
- Free budget spend (no further action)
- Internal transfer (ignore — no effect on balances)
- Skip (exclude from reconciliation)

**Interaction rules:**
- User must confirm every line (no auto-apply)
- Clicking "Confirm" on a row locks it and moves to the next
- User can go back and change a previously confirmed row
- A progress indicator shows confirmed / total lines
- "Confirm all suggested" button at the top allows bulk-confirming all pre-categorized lines at once, then reviewing only the uncertain ones

### Step 5: Summary before finalizing
After all lines are confirmed, show a reconciliation summary:

**Income:** €X confirmed
**Fixed expenses:** list each with confirmed amount vs. expected amount
**Envelope actuals:**
- Food: planned €400, actual €X → surplus/deficit
- Travel: planned €300, actual €X → surplus/deficit

**Pot transfer confirmed:** €X (or "Not found — did you forget to transfer?")
**Savings confirmed:** €X per goal
**Planned expenses settled:** list each with confirmed amount vs. planned
**Free budget spend:** €X total (no breakdown needed for MVP)
**Unaccounted lines:** any lines marked "Skip" listed here

### Step 6: Handle envelope surplus/deficit
For each envelope with a difference:

**Surplus (actual < planned):**
Modal: "[Food] budget: you spent €X less than planned. What would you like to do with €Y?"
- "Add to pot" → pot balance increases, engine recalculates
- "Add to savings" → pick which goal
- "Carry to next month" → stored as carry-over for next month's management card

**Deficit (actual > planned):**
Message: "You overspent [Food] by €X. This has been deducted from your free budget."
No action needed — already reflected in the numbers.

### Step 7: Handle leftover free budget
Final step after all envelope surpluses are handled.

Message: "You have €X left over from this month's free budget (unspent from your checking account)."
Options:
- "Add to pot" → pot balance increases, engine recalculates future set-aside rates
- "Add to savings" → pick which goal
- "Carry forward to next month" → increases next month's available amount

### Step 8: Close the month
After all steps are complete, show a confirmation screen:
"May 2026 is now reconciled. Here's the summary:"
- Final pot balance
- Savings goal progress update
- Free budget used: €X of €Y available

Button: "Close month" — marks the month as reconciled. Data becomes read-only historical.

---

## Data Model Additions

### Sub-account mapping (stored in localStorage)
```
subAccountMappings: {
  [kontoname: string]: {
    type: 'checking' | 'envelope' | 'pot' | 'savings' | 'ignore'
    linkedId?: string  // envelope id, savings goal id
  }
}
```

### Import session (per reconciled month)
```
importSessions: {
  [month: string]: {  // "YYYY-MM"
    importDate: string
    rawRowCount: number
    confirmedRows: ConfirmedTransaction[]
    envelopeActuals: { [envelopeId: string]: number }
    potTransferAmount: number
    potTransferConfirmed: boolean
    savingsContributions: { [goalId: string]: number }
    settledExpenses: { [expenseId: string]: number }
    leftoverFreeBudget: number
    leftoverAllocation: 'pot' | 'savings' | 'carry' | null
    status: 'in-progress' | 'complete'
  }
}
```

### Confirmed transaction
```
{
  id: string
  date: string
  payee: string
  description: string | null
  amount: number
  subAccount: string
  confirmedCategory: CategoryType
  linkedExpenseId?: string
  linkedEnvelopeId?: string
  linkedSavingsGoalId?: string
}
```

---

## What Does NOT Change

- The smoothing algorithm is unchanged
- The engine recalculates after import completes (pot balance update feeds into carry-forward)
- Past month cards in the grid show reconciled data after the month is closed
- The briefing card and management card update to reflect the new pot balance and savings progress

---

## Out of Scope for MVP

- Multi-bank support (configurable column mapping)
- Auto-remembering past categorizations for recurring payees
- Splitting one transaction across multiple categories
- Importing from formats other than CSV (CAMT.053 XML, MT940)
- Real-time bank API connection
