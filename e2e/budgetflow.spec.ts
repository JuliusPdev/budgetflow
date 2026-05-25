import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  clearStorageAndReload,
  completeOnboarding,
  installMockDate,
  lockInRecommended,
  addPlannedExpense,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await installMockDate(page);
});

// ─── Block 1: Onboarding ──────────────────────────────────────────────────────

test.describe('Block 1: Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorageAndReload(page);
  });

  test('1.1 Fresh start', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Start fresh' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import backup' })).toBeVisible();
  });

  test('1.2 Complete onboarding', async ({ page }) => {
    await completeOnboarding(page);
    await expect(page.getByTestId('management-card')).toBeVisible();
  });
});

// ─── Block 2: Dashboard Initial State ─────────────────────────────────────────

test.describe('Block 2: Dashboard Initial State', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorageAndReload(page);
    await completeOnboarding(page);
  });

  test('2.1 V6 planning surfaces', async ({ page }) => {
    await expect(page.getByTestId('free-budget-number')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Plan another expense' })).toBeVisible();
    await expect(page.locator('.v6-chart')).toHaveAccessibleName('Pot balance and free budget over the planning months');
    await expect(page.getByText('Free budget')).toBeVisible();
    await expect(page.getByText(/The pot ·/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'History' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Goals' })).toHaveCount(0);
  });

  test('2.2 Management card', async ({ page }) => {
    await expect(page.getByTestId('management-card').getByText(/Set-aside/)).toBeVisible();
    await expect(page.getByTestId('lock-in-button')).toBeVisible();
    await expect(page.getByTestId('management-card').getByText('€0').first()).toBeVisible();
  });

  test('2.3 Backup workspace removed', async ({ page }) => {
    await expect(page.getByText('Current month workspace')).toHaveCount(0);
    await expect(page.getByText('Month editor')).toHaveCount(0);
    await expect(page.locator('.month-card')).toHaveCount(0);
  });
});

// ─── Block 3: Adding a Planned Expense ────────────────────────────────────────

test.describe('Block 3: Adding a Planned Expense', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorageAndReload(page);
    await completeOnboarding(page);
  });

  test('3.1 Add expense to future month', async ({ page }) => {
    const freeBefore = await page.getByTestId('free-budget-number').textContent();

    await addPlannedExpense(page, 'August 2026', 'Summer trip', 800);
    await expect(page.locator('.v6-ledger-planned-name').filter({ hasText: 'Summer trip' })).toBeVisible();
    await expect(page.locator('.v6-chart')).toBeVisible();
    await expect(page.locator('.v6-chart').getByText('Summer trip')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Plan another expense' })).toBeVisible();
    await expect(page.getByTestId('management-card').getByText(/Set-aside/)).toBeVisible();

    const freeAfter = await page.getByTestId('free-budget-number').textContent();
    const beforeNum = parseInt(freeBefore?.replace(/[^\d]/g, '') ?? '0', 10);
    const afterNum = parseInt(freeAfter?.replace(/[^\d]/g, '') ?? '0', 10);
    expect(afterNum).toBeLessThan(beforeNum);
  });

  test('3.2 V6 planner opens and can be cancelled', async ({ page }) => {
    await page.getByRole('button', { name: '+ Plan another expense' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Plan another expense' })).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Expense name' }).fill('Huge purchase');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Huge purchase')).toHaveCount(0);
  });

  test('3.3 Remove expense from ledger', async ({ page }) => {
    await addPlannedExpense(page, 'August 2026', 'Summer trip', 800);

    const ledgerRow = page.locator('.v6-ledger-planned-name').filter({ hasText: 'Summer trip' });
    await expect(ledgerRow).toBeVisible();
    await ledgerRow.getByRole('button', { name: 'Remove Summer trip' }).click();

    await expect(ledgerRow).toHaveCount(0);
    await expect(page.locator('.v6-chart').getByText('Summer trip')).toHaveCount(0);
  });

  test('3.4 Edit planned expense amount from ledger', async ({ page }) => {
    await addPlannedExpense(page, 'August 2026', 'Summer trip', 800);

    const ledgerRow = page.locator('.v6-ledger-planned-name').filter({ hasText: 'Summer trip' });
    await expect(ledgerRow).toBeVisible();
    await page.getByRole('button', { name: 'Edit amount for Summer trip in August 2026' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Edit planned expense' })).toBeVisible();
    await dialog.getByRole('spinbutton', { name: 'Amount' }).fill('600');
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('button', { name: 'Edit amount for Summer trip in August 2026' })).toHaveText('-600');
    await expect(page.locator('.v6-chart').getByText('-€600')).toBeVisible();
  });

  test('3.5 Planned expenses are shown by deadline', async ({ page }) => {
    await addPlannedExpense(page, 'December 2026', 'Later conference', 300);
    await addPlannedExpense(page, 'July 2026', 'Earlier renewal', 150);

    const ledgerNames = await page.locator('.v6-ledger-planned-name span:not(.v6-ledger-dot)').allTextContents();
    expect(ledgerNames).toEqual(['Earlier renewal', 'Later conference']);
  });

  test('3.6 Ledger month add button preselects the month', async ({ page }) => {
    await page.getByRole('button', { name: 'Plan expense for August 2026' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Plan another expense' })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Target month' })).toHaveValue('2026-08');

    await dialog.getByRole('textbox', { name: 'Expense name' }).fill('Ledger trip');
    await dialog.getByRole('spinbutton', { name: 'Amount' }).fill('450');
    await dialog.getByRole('button', { name: 'Add to plan' }).click();

    await expect(page.locator('.v6-ledger-planned-name').filter({ hasText: 'Ledger trip' })).toBeVisible();
  });
});

// ─── Block 4: Lock-In ─────────────────────────────────────────────────────────

test.describe('Block 4: Lock-In', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorageAndReload(page);
    await completeOnboarding(page);
    await addPlannedExpense(page, 'August 2026', 'Summer trip', 800);
  });

  test('4.1 Lock in current month', async ({ page }) => {
    const freeBefore = await page.getByTestId('free-budget-number').textContent();
    const potCard = page.locator('.v6-hero-card').filter({ hasText: 'Pot balance' });
    const potBefore = await potCard.locator('.v6-hero-number').textContent();

    await lockInRecommended(page);

    await expect(page.getByText('Locked (planned)')).toBeVisible();
    const potAfter = await potCard.locator('.v6-hero-number').textContent();
    expect(potAfter).not.toBe(potBefore);

    const freeAfter = await page.getByTestId('free-budget-number').textContent();
    expect(freeAfter).toBe(freeBefore);
  });

  test('4.2 No double-deduction', async ({ page }) => {
    const freeBefore = await page.getByTestId('free-budget-number').textContent();
    await lockInRecommended(page);
    const freeAfter = await page.getByTestId('free-budget-number').textContent();
    expect(freeAfter).toBe(freeBefore);
  });
});

// ─── Block 5: Mid-Month Modal ─────────────────────────────────────────────────

test.describe('Block 5: Mid-Month Modal', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorageAndReload(page);
    await completeOnboarding(page);
    await lockInRecommended(page);
  });

  test('5.1 Modal appears after lock-in', async ({ page }) => {
    await addPlannedExpense(page, 'September 2026', 'New laptop', 600);
    await expect(page.getByTestId('mid-month-modal')).toBeVisible();
    await expect(page.getByTestId('modal-option-1')).toBeVisible();
    await expect(page.getByTestId('modal-option-2')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose an option' })).toBeDisabled();

    const opt1Text = await page.getByTestId('modal-option-1').textContent();
    const opt2Text = await page.getByTestId('modal-option-2').textContent();
    expect(opt1Text).not.toBe(opt2Text);
    expect(opt1Text).toMatch(/additional|month/i);
    expect(opt2Text).toMatch(/month/i);
  });

  test('5.2 Choose "Start from next month"', async ({ page }) => {
    const setAsideBefore = await page.getByTestId('management-card').locator('.cmm-amount').textContent();

    await addPlannedExpense(page, 'September 2026', 'New laptop', 600);
    await page.getByTestId('modal-option-2').click();
    await page.getByRole('button', { name: 'Confirm funding choice' }).click();

    await expect(page.locator('.v6-ledger-planned-name').filter({ hasText: 'New laptop' })).toBeVisible();
    const setAsideAfter = await page.getByTestId('management-card').locator('.cmm-amount').textContent();
    expect(setAsideAfter).toBe(setAsideBefore);
  });

  test('5.3 Choose "Include this month"', async ({ page }) => {
    await addPlannedExpense(page, 'October 2026', 'Winter coat', 400);
    await page.getByTestId('modal-option-1').click();
    await page.getByRole('button', { name: 'Confirm funding choice' }).click();

    await expect(page.locator('.v6-ledger-planned-name').filter({ hasText: 'Winter coat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lock additional' })).toBeVisible();
  });
});

// ─── Block 6: Advance Month (Dev Toolbar) ─────────────────────────────────────

test.describe('Block 6: Advance Month (Dev Toolbar)', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorageAndReload(page);
    await completeOnboarding(page);
    await addPlannedExpense(page, 'August 2026', 'Summer trip', 800);
  });

  test('6.1 Advance one month', async ({ page }) => {
    await page.getByTestId('dev-next-month').click();
    await expect(page.locator('.dev-toolbar--active')).toBeVisible();
    await expect(page.getByText(/June 2026/).first()).toBeVisible();
  });

  test('6.2 Lock in new month', async ({ page }) => {
    await page.getByTestId('dev-next-month').click();
    await lockInRecommended(page);
    await expect(page.getByText('Locked (planned)')).toBeVisible();
  });
});

// ─── Block 7: Month with Planned Expense Due ──────────────────────────────────

test.describe('Block 7: Month with Planned Expense Due', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorageAndReload(page);
    await completeOnboarding(page);
    await addPlannedExpense(page, 'August 2026', 'Summer trip', 800);

    // Advance from May → August (3 clicks)
    await page.getByTestId('dev-next-month').click();
    await page.getByTestId('dev-next-month').click();
    await page.getByTestId('dev-next-month').click();
  });

  test('7.1 Advance to trip month', async ({ page }) => {
    await expect(page.locator('.v6-ledger-planned-name').filter({ hasText: 'Summer trip' })).toBeVisible();
  });

  test('7.2 No duplicate lower pot card', async ({ page }) => {
    await expect(page.getByText(/The pot ·/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Plan another expense' })).toBeVisible();
  });
});

// ─── Block 8: Undo ────────────────────────────────────────────────────────────

test.describe('Block 8: Undo', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorageAndReload(page);
    await completeOnboarding(page);
  });

  test('8.1 Undo expense addition', async ({ page }) => {
    const freeBefore = await page.getByTestId('free-budget-number').textContent();
    await addPlannedExpense(page, 'August 2026', 'Weekend away', 250);

    await expect(page.getByTestId('undo-button')).toBeVisible();
    await page.getByTestId('undo-button').click();

    await expect(page.locator('.v6-ledger-planned-name').filter({ hasText: 'Weekend away' })).toHaveCount(0);
    await expect(page.getByTestId('free-budget-number')).toHaveText(freeBefore ?? '');
    await expect(page.getByTestId('undo-button')).not.toBeVisible();
  });
});

// ─── Block 9: Export and Import ───────────────────────────────────────────────

test.describe('Block 9: Export and Import', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorageAndReload(page);
  });

  test.skip('9.1 Export', async () => {
    // Export Data is not yet implemented in Settings — see TESTING.md
  });

  test('9.2 Import', async ({ page }) => {
    await completeOnboarding(page);
    await lockInRecommended(page);

    const budget = await page.evaluate(() => {
      const raw = localStorage.getItem('budgetflow-v1');
      if (!raw) return null;
      const app = JSON.parse(raw) as { budget: unknown };
      return app.budget;
    });
    expect(budget).not.toBeNull();

    const tmpFile = path.join(os.tmpdir(), `budgetflow-backup-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(budget, null, 2));

    await clearStorageAndReload(page);
    await expect(page.getByRole('button', { name: 'Import backup' })).toBeVisible();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import backup' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(tmpFile);

    await expect(page.getByTestId('free-budget-number')).toBeVisible();
    await expect(page.getByTestId('management-card')).toBeVisible();
    await expect(page.getByText('Locked (planned)')).toBeVisible();

    fs.unlinkSync(tmpFile);
  });
});

// ─── Block 10: Dev Toolbar Reset ──────────────────────────────────────────────

test.describe('Block 10: Dev Toolbar Reset', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorageAndReload(page);
    await completeOnboarding(page);
    await page.getByTestId('dev-next-month').click();
  });

  test('10.1 Reset simulation', async ({ page }) => {
    await expect(page.locator('.dev-toolbar--active')).toBeVisible();
    await expect(page.getByText(/June 2026/).first()).toBeVisible();

    await page.getByTestId('dev-reset').click();
    await expect(page.locator('.dev-toolbar--active')).not.toBeVisible();
    await expect(page.getByText(/May 2026/).first()).toBeVisible();
    await expect(page.getByTestId('management-card')).toBeVisible();
    await expect(page.getByTestId('free-budget-number')).toBeVisible();
  });
});
