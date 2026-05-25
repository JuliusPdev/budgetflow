# BudgetFlow Testing Guide

BudgetFlow has two levels of automated tests, defined in `docs/test-flow.md`.

## Engine unit tests (Vitest)

Runs the smoothing engine directly with fixed inputs — no browser, no localStorage.

```bash
npm test
```

Run in watch mode while developing:

```bash
npx vitest
```

Run a single test case by name:

```bash
npx vitest run -t "Test 4: Single expense"
```

### What is covered

All five scenarios from `docs/test-flow.md` → **Engine Unit Tests**:

1. Back-loaded expenses (equal distribution)
2. Front-loaded expenses (constraint forces split)
3. No expenses
4. Single expense
5. Pot carry-forward

Additional edge cases from `docs/algorithm.md` live in the same file.

---

## End-to-end UI tests (Playwright)

Runs the real app in a browser with a **fixed mock date** (`2026-05-17`) so results do not change based on when you run the tests.

```bash
npx playwright test e2e/budgetflow.spec.ts
# or
npm run test:e2e
```

Visual test runner (useful for debugging):

```bash
npx playwright test --ui
```

Run a single block:

```bash
npx playwright test -g "Block 3"
```

Run one test inside a block:

```bash
npx playwright test -g "3.1 Add expense"
```

### Prerequisites

- **Browser:** Locally, tests use your installed Google Chrome. For CI or headless-only runs, install Playwright’s Chromium first:
  ```bash
  npx playwright install chromium
  ```
- Dev server is started automatically by Playwright config on port 5173, or run `npm run dev` yourself first.

### What is covered

All ten blocks from `docs/test-flow.md` → **End-to-End UI Test Flow**:

| Block | Topic |
|-------|--------|
| 1 | Onboarding |
| 2 | Dashboard initial state |
| 3 | Adding a planned expense |
| 4 | Lock-in |
| 5 | Mid-month modal |
| 6 | Advance month (dev toolbar) |
| 7 | Month with planned expense due |
| 8 | Undo |
| 9 | Export and import |
| 10 | Dev toolbar reset |

**Note:** Block 9.1 (Export Data from Settings) is skipped until that button exists in the app. Block 9.2 tests import using a JSON backup written from localStorage during the test.

### Test selectors

Key UI elements use `data-testid` attributes (see `e2e/budgetflow.spec.ts`). When you change labels or layout, update the spec or add a stable `data-testid` rather than relying on fragile CSS classes.

### Updating tests when the UI changes

1. Read the matching block in `docs/test-flow.md` — that is the intended behavior.
2. Run the failing test with `--ui` to see what the browser shows.
3. If behavior changed **on purpose**, update `docs/test-flow.md` first, then update `e2e/budgetflow.spec.ts`.
4. If behavior is wrong, fix the app — do not weaken the test to match a bug.
5. For new interactive elements, add `data-testid` in the component (no other UI behavior change required).

### Environment notes

- Each block clears `localStorage` and reloads before its tests (`docs/test-flow.md`).
- `DEV_MODE` must be `true` in `src/utils/devMode.ts` for Blocks 6 and 7 (dev toolbar).
- Mock date is set in `e2e/helpers.ts` via `installMockDate()`.
