import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const chineseRoutes = [
  { path: '/dashboard', label: '总览', heading: '清晰掌握您的财务状况' },
  { path: '/transactions', label: '交易', heading: '交易' },
  { path: '/budgets', label: '预算', heading: '预算' },
  { path: '/schedules', label: '计划', heading: '计划' },
  { path: '/imports', label: '导入', heading: '对账单导入' },
  { path: '/settings', label: '设置', heading: '设置' },
] as const;

async function openSettings(page: Page) {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('status', { name: /loading/i })).toHaveCount(0);
}

async function switchToChinese(page: Page) {
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: /^Preferences/ })
    .click();
  const language = page.getByLabel('Display language');
  await expect(language).toBeEnabled();
  await language.selectOption('zh-CN');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { level: 1, name: '设置' })).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('status').filter({ hasText: '语言偏好已保存。' })).toBeVisible();
}

async function navigate(page: Page, projectName: string, label: string, path: string) {
  if (projectName === 'mobile-chromium') {
    const mobileNavigation = page.getByRole('navigation', { name: '移动端导航' });
    const directLink = mobileNavigation.getByRole('link', { name: label, exact: true });
    if ((await directLink.count()) > 0) {
      await directLink.click();
    } else {
      await mobileNavigation.getByRole('button', { name: '更多', exact: true }).click();
      await page.getByRole('dialog').getByRole('link', { name: label, exact: true }).click();
    }
  } else {
    await page.locator('.sidebar__nav').getByRole('link', { name: label, exact: true }).click();
  }

  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

async function storageSnapshot(page: Page) {
  return page.evaluate(async () => ({
    localStorageKeys: Object.keys(localStorage),
    sessionStorageKeys: Object.keys(sessionStorage),
    databases: await indexedDB.databases(),
    caches: await window.caches.keys(),
    serviceWorkers: 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [],
  }));
}

test('saves and keeps the language preference within the private SPA session', async ({ page }, testInfo) => {
  await openSettings(page);
  await page.evaluate(() => Reflect.set(window, '__turtleTallySpaSession', true));
  await switchToChinese(page);

  expect(await page.evaluate(() => Reflect.get(window, '__turtleTallySpaSession'))).toBe(true);
  await navigate(page, testInfo.project.name, '交易', '/transactions');
  await expect(page.getByRole('heading', { level: 1, name: '交易' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  expect(await page.evaluate(() => Reflect.get(window, '__turtleTallySpaSession'))).toBe(true);

  await navigate(page, testInfo.project.name, '设置', '/settings');
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: /^偏好设置/ })
    .click();
  const language = page.getByLabel('显示语言');
  await expect(language).toHaveValue('zh-CN');
  await language.selectOption('en-GB');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('status').filter({ hasText: 'Language preference saved.' })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__turtleTallySpaSession'))).toBe(true);

  const storage = await storageSnapshot(page);
  expect(storage.localStorageKeys).toEqual([]);
  expect(storage.sessionStorageKeys).toEqual([]);
  expect(storage.databases).toEqual([]);
  expect(storage.caches).toEqual([]);
  expect(storage.serviceWorkers).toEqual([]);
});

test('keeps every Chinese route accessible and inside the viewport', async ({ page }, testInfo) => {
  await openSettings(page);
  await switchToChinese(page);

  for (const route of chineseRoutes) {
    await navigate(page, testInfo.project.name, route.label, route.path);
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
    await expect(page.getByRole('status', { name: /loading|正在加载/i })).toHaveCount(0);

    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const violations = scan.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(violations, `${route.path} has serious or critical accessibility violations`).toEqual([]);

    const sizes = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(sizes.content, `${route.path} has horizontal overflow`).toBeLessThanOrEqual(sizes.viewport + 1);
  }
});
