import { beforeEach, describe, expect, it } from 'vitest';
import { flowOf, magnitudeOf, signedAmount } from './money';
import { spendingByCategory, totalAmount, totalByKind } from './aggregates';
import { createMockApi } from './mockApi';
import type { MockFinanceApi, Transaction } from './types';

let api: MockFinanceApi;

beforeEach(() => {
  api = createMockApi('DEFAULT', { latencyMs: 0 });
});

function transaction(amountMinor: number, kind: Transaction['kind'], categoryId: string | null): Transaction {
  return {
    id: `t-${amountMinor}`,
    accountId: 'a1',
    accountName: 'Everyday',
    categoryId,
    categoryName: categoryId,
    description: 'probe',
    amountMinor,
    currency: 'GBP',
    kind,
    origin: 'MANUAL',
    occurredAt: '2026-08-03T12:00:00.000Z',
    localDate: '2026-08-03',
    timePrecision: 'DATE',
    timezone: 'Europe/London',
    scheduleId: null,
    occurrenceDate: null,
    importRowFingerprint: null,
    receipt: null,
    voidedAt: null,
    voidReason: null,
    createdAt: '2026-08-03T12:00:00.000Z',
    updatedAt: '2026-08-03T12:00:00.000Z',
    version: 1,
  };
}

describe('direction lives in the sign', () => {
  it('round-trips a magnitude and a direction', () => {
    expect(signedAmount(5_000, 'DEBIT')).toBe(-5_000);
    expect(signedAmount(5_000, 'CREDIT')).toBe(5_000);
    expect(flowOf(-5_000)).toBe('DEBIT');
    expect(flowOf(5_000)).toBe('CREDIT');
    expect(magnitudeOf(-5_000)).toBe(5_000);
  });

  it('reads a total as a plain sum', () => {
    expect(totalAmount([transaction(-5_000, 'SPENDING', 'c1'), transaction(12_000, 'INCOME', 'c2')])).toBe(7_000);
  });

  it('reports spending and income as positive magnitudes', () => {
    const rows = [transaction(-5_000, 'SPENDING', 'c1'), transaction(12_000, 'INCOME', 'c2')];
    expect(totalByKind(rows, 'SPENDING')).toBe(5_000);
    expect(totalByKind(rows, 'INCOME')).toBe(12_000);
  });

  it('nets a refund against spending in the same category', () => {
    const rows = [transaction(-5_000, 'SPENDING', 'c1'), transaction(1_500, 'SPENDING', 'c1')];
    expect(totalByKind(rows, 'SPENDING')).toBe(3_500);
    expect(spendingByCategory(rows).get('c1')).toBe(3_500);
  });
});

describe('the mock enforces the signed contract', () => {
  it('rejects a zero amount, which would carry no direction', async () => {
    const [account] = await api.listAccounts();
    if (!account) throw new Error('expected an account');

    await expect(
      api.createTransaction({
        accountId: account.id,
        categoryId: null,
        description: 'Zero',
        amountMinor: 0,
        kind: 'SPENDING',
        localDate: '2026-08-10',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('moves the balance by the signed amount in both directions', async () => {
    const account = await api.createAccount({
      name: 'Signed probe',
      type: 'CURRENT',
      openingBalanceMinor: 0,
      colour: '#4d908e',
    });

    await api.createTransaction({
      accountId: account.id,
      categoryId: null,
      description: 'Money out',
      amountMinor: -3_000,
      kind: 'SPENDING',
      localDate: '2026-08-10',
    });
    await api.createTransaction({
      accountId: account.id,
      categoryId: null,
      description: 'Money in',
      amountMinor: 8_000,
      kind: 'INCOME',
      localDate: '2026-08-11',
    });

    const settled = (await api.listAccounts()).find((candidate) => candidate.id === account.id);
    expect(settled?.balanceMinor).toBe(5_000);
  });

  it('filters by direction using the sign', async () => {
    const credits = await api.listTransactions({ month: '2026-08', flow: 'CREDIT', pageSize: 100 });
    const debits = await api.listTransactions({ month: '2026-08', flow: 'DEBIT', pageSize: 100 });

    expect(credits.totalItems).toBeGreaterThan(0);
    expect(debits.totalItems).toBeGreaterThan(0);
    expect(credits.items.every((item) => item.amountMinor > 0)).toBe(true);
    expect(debits.items.every((item) => item.amountMinor < 0)).toBe(true);
  });

  it('keeps a voided transaction reversible against the balance', async () => {
    const account = await api.createAccount({
      name: 'Void probe',
      type: 'CURRENT',
      openingBalanceMinor: 10_000,
      colour: '#4d908e',
    });
    const created = await api.createTransaction({
      accountId: account.id,
      categoryId: null,
      description: 'To be voided',
      amountMinor: -2_500,
      kind: 'SPENDING',
      localDate: '2026-08-10',
    });

    await api.voidTransaction(created.id, created.version);

    const restored = (await api.listAccounts()).find((candidate) => candidate.id === account.id);
    expect(restored?.balanceMinor).toBe(10_000);
  });
});
