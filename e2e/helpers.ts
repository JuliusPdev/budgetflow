import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Fixed "today" for all E2E tests — see docs/test-flow.md */
export const MOCK_DATE_ISO = '2026-05-17T12:00:00.000Z';
export const MOCK_MONTH = '2026-05';
export const TRIP_MONTH = '2026-08';

export async function installMockDate(page: Page): Promise<void> {
  await page.addInitScript((fixedTime: number) => {
    const RealDate = Date;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Date = class extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(fixedTime);
          return;
        }
        super(...(args as [number | string | Date]));
      }
      static now() {
        return fixedTime;
      }
    };
    Date.parse = RealDate.parse;
    Date.UTC = RealDate.UTC;
  }, new Date(MOCK_DATE_ISO).getTime());
}

export async function clearStorageAndReload(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

export async function completeOnboarding(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Start fresh' })).toBeVisible();
  await page.getByRole('button', { name: 'Start fresh' }).click();

  await page.locator('.ob-income-input input').fill('3000');
  await page.getByRole('button', { name: 'Next →' }).click();

  // Rent €900 (housing)
  await page.getByRole('button', { name: '+ Rent' }).click();
  await page.locator('.ob-entry-row input[type="number"]').fill('900');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // Insurance €150
  await page.getByRole('button', { name: 'Insurance' }).click();
  await page.getByRole('button', { name: '+ Health insurance' }).click();
  await page.locator('.ob-entry-row input[type="number"]').fill('150');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // Food envelope €400
  await page.getByRole('button', { name: 'Other' }).click();
  await page.locator('.ob-entry-row input[placeholder="Name"]').fill('Food');
  await page.locator('.ob-entry-row input[type="number"]').fill('400');
  await page.getByText('Budget envelope (flexible spending budget)').click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await page.getByRole('button', { name: 'Done →' }).click();

  // Emergency Fund — Mode A, 12 months from mock current month
  await page.getByRole('button', { name: 'Set a target' }).click();
  await page.getByPlaceholder('e.g. Holiday fund').fill('Emergency Fund');
  await page.locator('.ob-goal-form input[type="number"]').first().fill('5000');
  await page.locator('input[type="month"]').fill('2027-05');
  await page.getByRole('button', { name: 'Add goal' }).click();
  await page.getByRole('button', { name: 'Done →' }).click();

  await expect(page.getByRole('heading', { name: 'Where are you today?' })).toBeVisible();
  await page.locator('.ob-baseline-form input').first().fill('1200');
  await page.locator('.ob-baseline-form input').nth(1).fill('0');
  await page.getByRole('button', { name: 'Continue →' }).click();

  await expect(page.getByRole('heading', { name: 'Your baseline free budget' })).toBeVisible();
  const freeBudgetText = await page.locator('.ob-summary-row--total .num').textContent();
  const freeBudgetValue = parseInt(freeBudgetText?.replace(/[^\d]/g, '') ?? '0', 10);
  expect(freeBudgetValue).toBeGreaterThan(0);

  await page.getByRole('button', { name: "Let's go →" }).click();
  await expect(page.getByTestId('free-budget-number')).toBeVisible();
}

export async function lockInRecommended(page: Page): Promise<void> {
  await page.getByTestId('lock-in-button').click();
  await page.getByRole('button', { name: 'Confirm lock' }).click();
  await expect(page.getByText('Locked (planned)')).toBeVisible();
}

export function monthCard(page: Page, monthLabel: string) {
  return page.locator('.month-card').filter({ hasText: monthLabel });
}

function monthInputValue(monthLabel: string): string {
  const [monthName, year] = monthLabel.split(' ');
  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth() + 1;
  return `${year}-${String(monthIndex).padStart(2, '0')}`;
}

export async function addPlannedExpense(
  page: Page,
  monthLabel: string,
  name: string,
  amount: number,
): Promise<void> {
  await page.getByRole('button', { name: '+ Plan another expense' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Expense name' }).fill(name);
  await dialog.getByRole('spinbutton', { name: 'Amount' }).fill(String(amount));
  await dialog.getByRole('textbox', { name: 'Target month' }).fill(monthInputValue(monthLabel));
  await dialog.getByRole('button', { name: 'Add to plan' }).click();
}
