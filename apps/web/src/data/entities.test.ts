import { beforeEach, describe, expect, it } from 'vitest';
import { createMockApi } from './mockApi';
import { toGbpInput } from '../utils/format';
import type { MockFinanceApi } from './types';

let api: MockFinanceApi;

beforeEach(() => {
  api = createMockApi('DEFAULT', { latencyMs: 0 });
});

async function firstTransaction(accountId: string) {
  const page = await api.listTransactions({ month: '2026-08', pageSize: 100 });
  const transaction = page.items.find((candidate) => candidate.accountId === accountId);
  if (!transaction) throw new Error('expected a transaction on that account');
  return transaction;
}

describe('deactivation keeps history editable', () => {
  it('allows editing a transaction whose account has been deactivated', async () => {
    const [account] = await api.listAccounts();
    if (!account) throw new Error('expected an account');
    const transaction = await firstTransaction(account.id);

    const current = (await api.listAccounts()).find((candidate) => candidate.id === account.id);
    await api.deactivateAccount(account.id, current?.version ?? account.version);

    const updated = await api.updateTransaction(transaction.id, {
      description: 'Corrected description',
      expectedVersion: transaction.version,
    });
    expect(updated.description).toBe('Corrected description');
    expect(updated.accountId).toBe(account.id);
  });

  it('allows editing a transaction whose category has been deactivated', async () => {
    const page = await api.listTransactions({ month: '2026-08', pageSize: 100 });
    const transaction = page.items.find((candidate) => candidate.categoryId !== null);
    if (!transaction?.categoryId) throw new Error('expected a categorised transaction');

    const category = (await api.listCategories()).find((candidate) => candidate.id === transaction.categoryId);
    if (!category) throw new Error('expected the category');
    await api.deactivateCategory(category.id, category.version);

    const updated = await api.updateTransaction(transaction.id, {
      description: 'Still editable',
      expectedVersion: transaction.version,
    });
    expect(updated.categoryId).toBe(category.id);
  });

  it('still refuses to move a transaction onto a deactivated account', async () => {
    const accounts = await api.listAccounts();
    const [source, target] = accounts;
    if (!source || !target) throw new Error('expected two accounts');
    const transaction = await firstTransaction(source.id);

    await api.deactivateAccount(target.id, target.version);

    await expect(
      api.updateTransaction(transaction.id, { accountId: target.id, expectedVersion: transaction.version }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('account balance is owned by the ledger', () => {
  it('accepts a negative opening balance', async () => {
    const account = await api.createAccount({
      name: 'Overdrawn probe',
      type: 'CURRENT',
      openingBalanceMinor: -12_500,
      colour: '#4d908e',
    });
    expect(account.balanceMinor).toBe(-12_500);
  });

  it('keeps an account editable once the ledger drives it negative', async () => {
    const account = await api.createAccount({
      name: 'Drains to negative',
      type: 'CURRENT',
      openingBalanceMinor: 1_000,
      colour: '#4d908e',
    });

    await api.createTransaction({
      accountId: account.id,
      categoryId: null,
      description: 'Large payment',
      amountMinor: -50_000,
      kind: 'SPENDING',
      localDate: '2026-08-10',
    });

    const negative = (await api.listAccounts()).find((candidate) => candidate.id === account.id);
    expect(negative?.balanceMinor).toBeLessThan(0);

    const renamed = await api.updateAccount(account.id, {
      name: 'Renamed while negative',
      expectedVersion: negative?.version ?? account.version,
    });
    expect(renamed.name).toBe('Renamed while negative');
    expect(renamed.balanceMinor).toBe(negative?.balanceMinor);
  });

  it('formats a negative balance for an input field', () => {
    expect(toGbpInput(-12_500)).toBe('-125.00');
    expect(toGbpInput(-150)).toBe('-1.50');
    expect(toGbpInput(12_500)).toBe('125.00');
  });
});

describe('display names follow the entity, not the entry', () => {
  it('shows the current category name after a rename', async () => {
    const page = await api.listTransactions({ month: '2026-08', pageSize: 100 });
    const transaction = page.items.find((candidate) => candidate.categoryId !== null);
    if (!transaction?.categoryId) throw new Error('expected a categorised transaction');

    const category = (await api.listCategories()).find((candidate) => candidate.id === transaction.categoryId);
    if (!category) throw new Error('expected the category');

    await api.updateCategory(category.id, { name: 'Renamed category', expectedVersion: category.version });

    const refreshed = await api.getTransaction(transaction.id);
    expect(refreshed.categoryName).toBe('Renamed category');
  });

  it('searches on the current name, not the one stored at entry', async () => {
    const page = await api.listTransactions({ month: '2026-08', pageSize: 100 });
    const transaction = page.items.find((candidate) => candidate.categoryId !== null);
    if (!transaction?.categoryId) throw new Error('expected a categorised transaction');

    const category = (await api.listCategories()).find((candidate) => candidate.id === transaction.categoryId);
    if (!category) throw new Error('expected the category');
    await api.updateCategory(category.id, { name: 'Zzyzx', expectedVersion: category.version });

    const found = await api.listTransactions({ month: '2026-08', search: 'Zzyzx', pageSize: 100 });
    expect(found.totalItems).toBeGreaterThan(0);
    expect(found.items.every((item) => item.categoryName === 'Zzyzx')).toBe(true);

    const stale = await api.listTransactions({ month: '2026-08', search: category.name, pageSize: 100 });
    expect(stale.totalItems).toBe(0);
  });

  it('shows the current account name on a schedule after a rename', async () => {
    const [account] = await api.listAccounts();
    if (!account) throw new Error('expected an account');
    await api.updateAccount(account.id, { name: 'Renamed account', expectedVersion: account.version });

    const schedules = await api.listSchedules();
    const affected = schedules.filter((schedule) => schedule.accountId === account.id);
    expect(affected.length).toBeGreaterThan(0);
    expect(affected.every((schedule) => schedule.accountName === 'Renamed account')).toBe(true);
  });
});
