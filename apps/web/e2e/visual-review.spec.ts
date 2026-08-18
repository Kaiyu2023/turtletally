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

async function switchToChinese(page: Page) {
  await ready(page, '/settings', 'Settings');
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: /^Preferences/ })
    .click();
  const language = page.getByLabel('Display language');
  await expect(language).toBeEnabled();
  await language.selectOption('zh-CN');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { level: 1, name: '设置' })).toBeVisible();
  const savedToast = page.getByRole('status').filter({ hasText: '语言偏好已保存。' });
  await expect(savedToast).toBeVisible();
  await savedToast.getByRole('button', { name: '关闭通知' }).click();
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

  await page.setViewportSize({ width: 900, height: 800 });
  await ready(page, '/dashboard', 'A clear view of your money');
  await page.locator('.sidebar').screenshot({
    path: 'artifacts/ui-draft/sidebar-compact.png',
    animations: 'disabled',
    caret: 'hide',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, '/dashboard', 'A clear view of your money');
  await capture(page, 'overview-mobile', false);

  await ready(page, '/transactions', 'Transactions');
  await capture(page, 'transactions-mobile', false);

  await switchToChinese(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, 'settings-zh-desktop');

  await page.locator('.sidebar__nav').getByRole('link', { name: '总览', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '清晰掌握您的财务状况' })).toBeVisible();
  await expect(page.getByRole('status', { name: /正在加载/ })).toHaveCount(0);
  await capture(page, 'overview-zh-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, 'overview-zh-mobile', false);
});
