import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { clearStorageAndReload, completeOnboarding, installMockDate } from './helpers';

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/c24-reconcile.csv',
);

test.beforeEach(async ({ page }) => {
  await installMockDate(page);
});

test.describe('CSV import', () => {
  test('settle period flow with date range', async ({ page }) => {
    await clearStorageAndReload(page);
    await completeOnboarding(page);

    await page.getByRole('button', { name: 'Import CSV' }).click();
    const wizard = page.getByRole('dialog');
    await expect(wizard.getByText('Import & settle')).toBeVisible();
    await expect(wizard.getByRole('heading', { name: 'Upload CSV' })).toBeVisible();

    await page.locator('.csv-upload-input').setInputFiles(fixturePath);
    await expect(wizard.getByRole('heading', { name: 'Settle period', exact: true })).toBeVisible();
    await expect(wizard.getByText('Settle period — pick From / Through')).toBeVisible();
    await expect(page.getByText(/transactions in this period/)).toBeVisible();

    await wizard.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Match each C24 sub-account')).toBeVisible();

    const mappingRows = page.locator('.csv-mapping-row');
    await expect(mappingRows).toHaveCount(2);

    await mappingRows.nth(0).locator('select').first().selectOption('checking');
    await mappingRows.nth(1).locator('select').first().selectOption('envelope');
    await mappingRows.nth(1).locator('select').nth(1).selectOption({ label: 'Food' });

    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: 'Continue to summary' }).click();

    await expect(page.getByText('Review the summary for each calendar month')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Envelope surplus' })).toBeVisible();
    await page.getByRole('button', { name: 'Carry to next month' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Leftover free budget' })).toBeVisible();
    await page.getByRole('button', { name: 'Carry forward to next month' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(wizard.getByRole('heading', { name: 'Period settled' }).nth(1)).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    await expect(page.getByTestId('free-budget-number')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Plan another expense' })).toBeVisible();
  });

  test('second import defaults start after last settle', async ({ page }) => {
    await clearStorageAndReload(page);
    await completeOnboarding(page);

    await page.getByRole('button', { name: 'Import CSV' }).click();
    await page.locator('.csv-upload-input').setInputFiles(fixturePath);
    await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
    const mappingRows = page.locator('.csv-mapping-row');
    await mappingRows.nth(0).locator('select').first().selectOption('checking');
    await mappingRows.nth(1).locator('select').first().selectOption('envelope');
    await mappingRows.nth(1).locator('select').nth(1).selectOption({ label: 'Food' });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue to summary' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Carry to next month' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Carry forward to next month' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('button', { name: 'Import CSV' }).click();
    await page.locator('.csv-upload-input').setInputFiles(fixturePath);

    const startInput = page.locator('#csv-period-start');
    const startValue = await startInput.inputValue();
    expect(startValue).toBe('2026-05-18');
  });
});
