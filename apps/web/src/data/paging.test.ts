import { beforeEach, describe, expect, it } from 'vitest';
import { createMockApi } from './mockApi';
import type { FinanceApi, Transaction, TransactionFilters } from './types';

const MONTH = '2026-08';

let api: FinanceApi;

beforeEach(() => {
  api = createMockApi('DEFAULT', { latencyMs: 0 });
});

async function walk(filters: TransactionFilters): Promise<Transaction[]> {
  const collected: Transaction[] = [];
  let cursor: string | undefined;

  for (let request = 0; request < 50; request += 1) {
    const page: Awaited<ReturnType<FinanceApi['listTransactions']>> = await api.listTransactions(
      cursor === undefined ? filters : { ...filters, cursor },
    );
    collected.push(...page.items);
    if (page.nextCursor === null) return collected;
    cursor = page.nextCursor;
  }

  throw new Error('a bounded month should not need fifty pages');
}

describe('cursor paging', () => {
  it('walks a month once, in order, without repeating or dropping a row', async () => {
    const everything = await api.listTransactions({ month: MONTH, limit: 100 });
    const walked = await walk({ month: MONTH, limit: 3 });

    expect(walked.map((transaction) => transaction.id)).toEqual(everything.items.map((transaction) => transaction.id));
    expect(new Set(walked.map((transaction) => transaction.id)).size).toBe(walked.length);
    expect(everything.nextCursor).toBeNull();
  });

  it('walks every sort order the list offers', async () => {
    for (const sort of ['NEWEST', 'OLDEST', 'AMOUNT_HIGH', 'AMOUNT_LOW'] as const) {
      const everything = await api.listTransactions({ month: MONTH, sort, limit: 100 });
      const walked = await walk({ month: MONTH, sort, limit: 4 });
      expect(walked.map((transaction) => transaction.id)).toEqual(
        everything.items.map((transaction) => transaction.id),
      );
    }
  });

  // The reason for cursors over offsets: a row added at the head of the list
  // shifts every offset, but a cursor still resumes after the same key.
  it('is not disturbed by a write at the head of the list', async () => {
    const first = await api.listTransactions({ month: MONTH, limit: 3 });
    const account = (await api.listAccounts())[0];
    if (!account) throw new Error('expected an account');

    await api.createTransaction({
      accountId: account.id,
      categoryId: null,
      description: 'Inserted while paging',
      amountMinor: -1_000,
      kind: 'SPENDING',
      localDate: '2026-08-31',
    });

    const second = await api.listTransactions({ month: MONTH, limit: 3, cursor: first.nextCursor ?? '' });
    expect(second.items.some((transaction) => first.items.some((seen) => seen.id === transaction.id))).toBe(false);
  });

  it('refuses a cursor that belongs to another ordering or is unreadable', async () => {
    const page = await api.listTransactions({ month: MONTH, limit: 3, sort: 'NEWEST' });
    const cursor = page.nextCursor ?? '';

    await expect(api.listTransactions({ month: MONTH, sort: 'OLDEST', cursor })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(api.listTransactions({ month: MONTH, cursor: 'not-a-cursor' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('bounds the page limit', async () => {
    await expect(api.listTransactions({ month: MONTH, limit: 0 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(api.listTransactions({ month: MONTH, limit: 101 })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
