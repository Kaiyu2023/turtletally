import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const routes = [
  { path: '/dashboard', heading: 'A clear view of your money' },
  { path: '/transactions', heading: 'Transactions' },
  { path: '/budgets', heading: 'Budgets' },
  { path: '/schedules', heading: 'Schedules' },
  { path: '/imports', heading: 'Statement imports' },
  { path: '/settings', heading: 'Settings' },
] as const;

async function openPage(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await expect(page.getByRole('status', { name: /loading/i })).toHaveCount(0);
}

function visibleTransaction(page: Page, description: string) {
  return page
    .locator('.transaction-table tbody tr:visible, .transaction-card:visible')
    .filter({ hasText: description });
}

test.describe('core experience', () => {
  test('shows the overview and a clear empty-month state', async ({ page }) => {
    await openPage(page, '/dashboard', 'A clear view of your money');

    await expect(page.getByText('Demo data')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Monthly totals' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Spending trend' })).toBeVisible();

    await page.getByRole('button', { name: 'Show September 2026' }).click();
    await expect(page.getByRole('heading', { name: 'Nothing to tally in September 2026 yet' })).toBeVisible();
  });

  test('creates, edits, and safely voids a transaction', async ({ page }) => {
    const description = 'Draft bicycle service';
    await openPage(page, '/transactions?scenario=empty', 'Transactions');
    await expect(page.getByRole('heading', { level: 2, name: 'No transactions match' })).toBeVisible();

    await page.getByRole('main').getByRole('button', { name: 'Add transaction' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Add transaction' });
    await expect(createDialog).toBeVisible();

    await createDialog.getByRole('button', { name: 'Add transaction', exact: true }).click();
    await expect(createDialog.getByText('Enter a short description.')).toBeVisible();
    await expect(createDialog.getByText('Enter a positive GBP amount with up to two decimal places.')).toBeVisible();

    await createDialog.getByLabel('Description').fill(description);
    await createDialog.getByLabel('Amount').fill('48.75');
    await expect(createDialog.getByLabel('Account')).not.toHaveValue('');
    await createDialog.getByLabel('Category').selectOption({ label: 'Household' });
    await createDialog.getByRole('button', { name: 'Add transaction', exact: true }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Transaction added to the demo ledger.' })).toBeVisible();
    await expect(visibleTransaction(page, description)).toContainText('£48.75');

    await page.getByRole('button', { name: `Edit ${description}` }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit transaction' });
    await editDialog.getByLabel('Amount').fill('52.40');
    await editDialog.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Transaction updated.' })).toBeVisible();
    await expect(visibleTransaction(page, description)).toContainText('£52.40');

    await page.getByRole('button', { name: `Void ${description}` }).click();
    const voidDialog = page.getByRole('dialog', { name: 'Void this transaction?' });
    await voidDialog.getByLabel('Reason').fill('Entered during draft review');
    await voidDialog.getByRole('button', { name: 'Void transaction' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Transaction voided.' })).toBeVisible();
    await expect(visibleTransaction(page, description)).toHaveCount(0);
    await page.getByRole('button', { name: 'Voided', exact: true }).click();
    await expect(visibleTransaction(page, description)).toContainText('Voided');
  });

  test('supports keyboard skip navigation', async ({ page }) => {
    await openPage(page, '/dashboard', 'A clear view of your money');

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });

  test('updates one monthly budget without changing the defaults view', async ({ page }) => {
    await openPage(page, '/budgets', 'Budgets');

    await page.getByRole('button', { name: 'Edit Groceries budget' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Groceries' });
    await dialog.getByLabel('Monthly amount').fill('500.00');
    await dialog.getByRole('button', { name: 'Save budget' }).click();

    const groceries = page.locator('.content-card .budget-plan-row').filter({ hasText: 'Groceries' });
    await expect(groceries).toContainText('of £500.00');
    await page.getByRole('button', { name: 'Monthly defaults' }).click();
    await expect(page.getByText('Changing a default never rewrites an existing monthly budget.')).toBeVisible();
  });

  test('creates and deactivates a recurring schedule without deleting it', async ({ page }) => {
    const name = 'Quarterly draft review';
    await openPage(page, '/schedules?scenario=empty', 'Schedules');

    await page.getByRole('button', { name: 'New schedule' }).click();
    const createDialog = page.getByRole('dialog', { name: 'New schedule' });
    await createDialog.getByLabel('Name').fill(name);
    await createDialog.getByLabel('Amount').fill('25.00');
    await createDialog.getByLabel('Description').fill('Synthetic recurring review entry');
    await createDialog.getByLabel('Repeats').selectOption('MONTHLY');
    await createDialog.getByLabel('Day of month').fill('31');
    await createDialog.getByRole('button', { name: 'Create schedule' }).click();

    const card = page.getByRole('article').filter({ hasText: name });
    await expect(card).toContainText('Monthly on day 31, using the last valid day');
    await card.getByRole('button', { name: 'Deactivate' }).click();
    await page
      .getByRole('dialog', { name: 'Deactivate schedule?' })
      .getByRole('button', { name: 'Deactivate', exact: true })
      .click();

    await expect(card).toHaveCount(0);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByRole('article').filter({ hasText: name })).toContainText('Inactive');
  });

  test('previews and deliberately commits a synthetic statement', async ({ page }) => {
    await openPage(page, '/imports?scenario=empty', 'Statement imports');

    await page.locator('#statement-file').setInputFiles('apps/web/e2e/fixtures/synthetic-draft-review.csv');
    await page.getByRole('button', { name: 'Create preview' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'synthetic-draft-review.csv' })).toBeVisible();
    await expect(page.locator('.import-summary')).toContainText('2rows selected');
    await expect(page.getByText('fixture-content-is-never-parsed')).toHaveCount(0);
    await page.getByLabel('Category for Weekly groceries').selectOption({ label: 'Dining' });
    await page.getByRole('button', { name: 'Review and commit' }).click();

    const commitDialog = page.getByRole('dialog', { name: 'Commit this import?' });
    await expect(commitDialog).toContainText('2 transactions');
    await commitDialog.getByRole('button', { name: 'Commit 2 rows' }).click();
    await expect(page.getByText('Import complete')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '2 synthetic transactions imported.' })).toBeVisible();
  });

  test('adds and deactivates an account shell while retaining history', async ({ page }) => {
    const name = 'Travel pot';
    await openPage(page, '/settings?scenario=empty', 'Settings');

    await page.getByRole('button', { name: 'Add account' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Add account' });
    await createDialog.getByLabel('Account name').fill(name);
    await createDialog.getByLabel('Type').selectOption('SAVINGS');
    await createDialog.getByLabel('Opening demo balance').fill('300.00');
    await createDialog.getByRole('button', { name: 'Save' }).click();

    const account = page.getByRole('article').filter({ hasText: name });
    await expect(account).toContainText('£300.00');
    await account.getByRole('button', { name: 'Deactivate' }).click();
    await page
      .getByRole('dialog', { name: `Deactivate ${name}?` })
      .getByRole('button', { name: 'Deactivate', exact: true })
      .click();
    await expect(page.getByRole('article').filter({ hasText: name })).toContainText('Inactive');
  });
});

test.describe('accessibility', () => {
  for (const route of routes) {
    test(`${route.heading} has no serious or critical axe violations`, async ({ page }) => {
      await openPage(page, route.path, route.heading);
      const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const violations = scan.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );

      expect(violations).toEqual([]);
    });
  }
});

test('keeps synthetic finance data out of persistent browser storage', async ({ page }) => {
  const unexpectedHosts = new Set<string>();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      unexpectedHosts.add(url.hostname);
    }
  });

  await openPage(page, '/transactions?scenario=empty', 'Transactions');
  await page.getByRole('main').getByRole('button', { name: 'Add transaction' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add transaction' });
  await dialog.getByLabel('Description').fill('Ephemeral storage check');
  await dialog.getByLabel('Amount').fill('0.01');
  await expect(dialog.getByLabel('Account')).not.toHaveValue('');
  await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(visibleTransaction(page, 'Ephemeral storage check')).toBeVisible();

  const storage = await page.evaluate(async () => ({
    localStorageKeys: Object.keys(localStorage),
    sessionStorageKeys: Object.keys(sessionStorage),
    databases: await indexedDB.databases(),
    caches: await window.caches.keys(),
    serviceWorkers: 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [],
  }));

  expect(storage.localStorageKeys).toEqual([]);
  expect(storage.sessionStorageKeys).toEqual([]);
  expect(storage.databases).toEqual([]);
  expect(storage.caches).toEqual([]);
  expect(storage.serviceWorkers).toEqual([]);
  expect([...unexpectedHosts]).toEqual([]);

  await page.reload();
  await expect(page.getByRole('status', { name: /loading/i })).toHaveCount(0);
  await expect(visibleTransaction(page, 'Ephemeral storage check')).toHaveCount(0);
});

test('mobile navigation fits the viewport and reaches every section', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile-only coverage');
  await openPage(page, '/dashboard', 'A clear view of your money');

  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'More' }).click();
  await page.locator('.mobile-menu__sheet').getByRole('link', { name: 'Imports' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Statement imports' })).toBeVisible();

  for (const route of routes) {
    await openPage(page, route.path, route.heading);
    const sizes = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(sizes.content, `${route.path} has horizontal overflow`).toBeLessThanOrEqual(sizes.viewport + 1);
  }
});

test('compact desktop sidebar keeps its transaction action contained and named', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop-only coverage');
  await page.setViewportSize({ width: 1200, height: 800 });
  await openPage(page, '/dashboard', 'A clear view of your money');

  const sidebar = page.locator('.sidebar');
  const action = sidebar.getByRole('button', { name: 'Add transaction' });
  const label = action.locator('.sidebar__add-label');
  await expect(label).toBeVisible();

  await page.setViewportSize({ width: 900, height: 800 });
  await expect(action).toHaveAccessibleName('Add transaction');
  await expect(label).toBeHidden();

  const layout = await sidebar.evaluate((element) => {
    const button = element.querySelector<HTMLButtonElement>('.sidebar__add');
    if (!button) {
      throw new Error('Sidebar transaction action is missing');
    }
    const sidebarBounds = element.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    return {
      contained:
        buttonBounds.left >= sidebarBounds.left &&
        buttonBounds.right <= sidebarBounds.right &&
        buttonBounds.top >= sidebarBounds.top &&
        buttonBounds.bottom <= sidebarBounds.bottom,
      contentFits: button.scrollWidth <= button.clientWidth && button.scrollHeight <= button.clientHeight,
    };
  });

  expect(layout.contained).toBe(true);
  expect(layout.contentFits).toBe(true);
});
