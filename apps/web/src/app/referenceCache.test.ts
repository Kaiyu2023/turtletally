import { beforeEach, describe, expect, it } from 'vitest';
import { createMockApi } from '../data/mockApi';
import type { FinanceApi } from '../data/types';
import { cacheReferenceLists } from './referenceCache';

function counted(api: FinanceApi): { api: FinanceApi; reads: () => number } {
  let reads = 0;
  const listAccounts = api.listAccounts.bind(api);
  const listCategories = api.listCategories.bind(api);

  const wrapped = Object.create(api) as FinanceApi;
  wrapped.listAccounts = (includeInactive?: boolean) => {
    reads += 1;
    return listAccounts(includeInactive);
  };
  wrapped.listCategories = (includeInactive?: boolean) => {
    reads += 1;
    return listCategories(includeInactive);
  };

  return { api: wrapped, reads: () => reads };
}

let source: { api: FinanceApi; reads: () => number };
let api: FinanceApi;

beforeEach(() => {
  source = counted(createMockApi('DEFAULT', { latencyMs: 0 }));
  api = cacheReferenceLists(source.api);
});

describe('reference list cache', () => {
  it('reads a bounded list once per session', async () => {
    const first = await api.listAccounts();
    const second = await api.listAccounts();

    expect(second).toEqual(first);
    expect(source.reads()).toBe(1);
  });

  it('keeps the inactive and active views apart', async () => {
    await api.listAccounts();
    await api.listAccounts(true);

    expect(source.reads()).toBe(2);
  });

  it('hands each caller its own array', async () => {
    const first = await api.listCategories();
    first.pop();

    expect(await api.listCategories()).toHaveLength(first.length + 1);
  });

  it('drops the cache when a write could have changed a name or a balance', async () => {
    const [account] = await api.listAccounts();
    if (!account) throw new Error('expected an account');

    await api.updateAccount(account.id, { name: 'Renamed', expectedVersion: account.version });
    const renamed = await api.listAccounts();

    expect(renamed.find((candidate) => candidate.id === account.id)?.name).toBe('Renamed');
    expect(source.reads()).toBe(2);
  });

  it('drops the cache when the ledger moves a balance', async () => {
    const [account] = await api.listAccounts();
    if (!account) throw new Error('expected an account');

    await api.createTransaction({
      accountId: account.id,
      categoryId: null,
      description: 'Balance mover',
      amountMinor: -2_500,
      kind: 'SPENDING',
      localDate: '2026-08-18',
    });

    const after = await api.listAccounts();
    expect(after.find((candidate) => candidate.id === account.id)?.balanceMinor).toBe(account.balanceMinor - 2_500);
  });

  it('does not cache a failed read', async () => {
    const failing = cacheReferenceLists({
      ...createMockApi('DEFAULT', { latencyMs: 0 }),
      listAccounts: () => Promise.reject(new Error('network')),
    } as FinanceApi);

    await expect(failing.listAccounts()).rejects.toThrow('network');
    await expect(failing.listAccounts()).rejects.toThrow('network');
  });
});
