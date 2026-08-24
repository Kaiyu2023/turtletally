import { beforeEach, describe, expect, it } from 'vitest';
import { createMockApi } from './mockApi';
import { MockApiError, type MockFinanceApi, type Month } from './types';

const MONTH: Month = '2026-08';
const UNBUDGETED_MONTH: Month = '2019-03';

let api: MockFinanceApi;

beforeEach(() => {
  api = createMockApi('DEFAULT', { latencyMs: 0 });
});

async function expectCode(operation: Promise<unknown>, code: MockApiError['code']): Promise<void> {
  await expect(operation).rejects.toBeInstanceOf(MockApiError);
  await operation.catch((error: unknown) => {
    expect((error as MockApiError).code).toBe(code);
  });
}

function countLedgerReads(target: MockFinanceApi): () => number {
  const prototype = Object.getPrototypeOf(target) as {
    activeTransactionsBetween: (...args: unknown[]) => unknown;
  };
  const original = prototype.activeTransactionsBetween;
  let reads = 0;
  prototype.activeTransactionsBetween = function (this: unknown, ...args: unknown[]) {
    reads += 1;
    return original.apply(this, args);
  };
  return () => reads;
}

describe('reads never write', () => {
  it('derives budgets for a month with none stored without persisting them', async () => {
    const first = await api.listBudgets(UNBUDGETED_MONTH);
    const second = await api.listBudgets(UNBUDGETED_MONTH);

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(second.every((budget) => budget.version === null)).toBe(true);
  });

  it('leaves the ledger untouched when the overview is loaded', async () => {
    const before = await api.listTransactions({ month: MONTH, pageSize: 100 });
    await api.getDashboard(MONTH);
    await api.getDashboard(UNBUDGETED_MONTH);
    const after = await api.listTransactions({ month: MONTH, pageSize: 100 });

    expect(after.items).toEqual(before.items);
    expect(after.totalItems).toBe(before.totalItems);
  });
});

describe('ledger read budget', () => {
  it('serves the overview and the budget list from one bounded read each', async () => {
    const reads = countLedgerReads(api);

    const before = reads();
    await api.getDashboard(MONTH);
    expect(reads() - before).toBe(1);

    const beforeBudgets = reads();
    await api.listBudgets(MONTH);
    expect(reads() - beforeBudgets).toBe(1);
  });
});

describe('budget writes', () => {
  it('creates a stored budget from a derived row and rejects a second create', async () => {
    const [derived] = await api.listBudgets(UNBUDGETED_MONTH);
    if (!derived) throw new Error('expected a derived budget row');

    const created = await api.setBudget({
      month: UNBUDGETED_MONTH,
      categoryId: derived.categoryId,
      limitMinor: 12_345,
      expectedVersion: derived.version,
    });
    expect(created.version).toBe(1);

    const rows = await api.listBudgets(UNBUDGETED_MONTH);
    expect(rows.find((row) => row.categoryId === derived.categoryId)).toMatchObject({
      limitMinor: 12_345,
      version: 1,
    });

    await expectCode(
      api.setBudget({
        month: UNBUDGETED_MONTH,
        categoryId: derived.categoryId,
        limitMinor: 999,
        expectedVersion: null,
      }),
      'CONFLICT',
    );
  });

  it('rejects an update carrying a stale version', async () => {
    const [stored] = (await api.listBudgets(MONTH)).filter((budget) => budget.version !== null);
    if (!stored || stored.version === null) throw new Error('expected a stored budget row');

    await expectCode(
      api.setBudget({
        month: MONTH,
        categoryId: stored.categoryId,
        limitMinor: 1_000,
        expectedVersion: stored.version + 1,
      }),
      'CONFLICT',
    );
  });

  it('rejects an update to a category that has no stored budget', async () => {
    const [derived] = (await api.listBudgets(UNBUDGETED_MONTH)).filter((budget) => budget.version === null);
    if (!derived) throw new Error('expected a derived budget row');

    await expectCode(
      api.setBudget({
        month: UNBUDGETED_MONTH,
        categoryId: derived.categoryId,
        limitMinor: 1_000,
        expectedVersion: 1,
      }),
      'CONFLICT',
    );
  });
});

describe('optimistic concurrency across the contract', () => {
  it('rejects a stale transaction update and a stale void', async () => {
    const page = await api.listTransactions({ month: MONTH, pageSize: 1 });
    const transaction = page.items[0];
    if (!transaction) throw new Error('expected a transaction');

    await expectCode(
      api.updateTransaction(transaction.id, { description: 'Renamed', expectedVersion: transaction.version + 1 }),
      'CONFLICT',
    );
    await expectCode(api.voidTransaction(transaction.id, transaction.version + 1), 'CONFLICT');
  });

  it('rejects a stale account update and a stale preferences update', async () => {
    const [account] = await api.listAccounts();
    if (!account) throw new Error('expected an account');
    await expectCode(api.updateAccount(account.id, { expectedVersion: account.version + 1 }), 'CONFLICT');

    const preferences = await api.getUserPreferences();
    await expectCode(
      api.updateUserPreferences({ locale: 'zh-CN', expectedVersion: preferences.version + 1 }),
      'CONFLICT',
    );
  });

  it('reports a missing entity as not found', async () => {
    await expectCode(api.updateAccount('account-missing', { expectedVersion: 1 }), 'NOT_FOUND');
  });
});

describe('budget aggregate under unbudgeted spending', () => {
  it('excludes spending in a category with no budget from the remainder', async () => {
    const categories = await api.listCategories();
    const budgets = await api.listBudgets(MONTH);
    const budgeted = new Set(budgets.map((budget) => budget.categoryId));
    const unbudgeted = categories.find(
      (category) => category.group !== 'Income' && category.group !== 'Investment' && !budgeted.has(category.id),
    );
    const [account] = await api.listAccounts();
    if (!unbudgeted || !account) throw new Error('expected an unbudgeted spending category and an account');

    const before = await api.getDashboard(MONTH);
    await api.createTransaction({
      accountId: account.id,
      categoryId: unbudgeted.id,
      description: 'Unbudgeted spend',
      amountMinor: 5_000,
      kind: 'SPENDING',
      flow: 'DEBIT',
      localDate: '2026-08-10',
    });
    const after = await api.getDashboard(MONTH);

    expect(after.spendingMinor).toBe(before.spendingMinor + 5_000);
    expect(after.budgetedSpendingMinor).toBe(before.budgetedSpendingMinor);
    expect(after.budgetRemainingMinor).toBe(before.budgetRemainingMinor);

    const rows = await api.listBudgets(MONTH);
    expect(rows.reduce((total, row) => total + row.remainingMinor, 0)).toBe(after.budgetRemainingMinor);
  });
});
