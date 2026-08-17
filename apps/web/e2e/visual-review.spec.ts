import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await expect(page.getByRole('status', { name: /loading/i })).toHaveCount(0);
}

async function capture(page: Page, name: string, fullPage = true) {
  await page.screenshot({
    path: `artifacts/ui-draft/${name}.png`,
    fullPage,
    animations: 'disabled',
    caret: 'hide',
  });
}

test('captures representative desktop and mobile views', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One deterministic visual-review set is enough');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page, '/dashboard', 'A clear view of your money');
  await expect(page.locator('.brand img')).toHaveJSProperty('complete', true);
  await capture(page, 'overview-desktop');

  await ready(page, '/transactions', 'Transactions');
  await capture(page, 'transactions-desktop');

  await ready(page, '/budgets', 'Budgets');
  await capture(page, 'budgets-desktop');

  await ready(page, '/imports', 'Statement imports');
  await page.getByRole('button', { name: /synthetic-card-preview\.csv/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'synthetic-card-preview.csv' })).toBeVisible();
  await capture(page, 'import-preview-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, '/dashboard', 'A clear view of your money');
  await capture(page, 'overview-mobile', false);

  await ready(page, '/transactions', 'Transactions');
  await capture(page, 'transactions-mobile', false);
});
