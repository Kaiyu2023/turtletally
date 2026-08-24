import { beforeEach, describe, expect, it } from 'vitest';
import { createMockApi } from './mockApi';
import type { MockFinanceApi } from './types';

let api: MockFinanceApi;

beforeEach(() => {
  api = createMockApi('DEFAULT', { latencyMs: 0 });
});

describe('runDueSchedules', () => {
  it('generates nothing before anything is due', async () => {
    await expect(api.runDueSchedules('2026-08-17')).resolves.toEqual([]);
  });

  it('stamps each generated transaction with its schedule and occurrence', async () => {
    const created = await api.runDueSchedules('2026-09-02');

    expect(created.length).toBeGreaterThan(0);
    for (const transaction of created) {
      expect(transaction.origin).toBe('SCHEDULE');
      expect(transaction.scheduleId).not.toBeNull();
      expect(transaction.occurrenceDate).toBe(transaction.localDate);
    }
  });

  it('is idempotent: a repeated run for the same date generates nothing new', async () => {
    const first = await api.runDueSchedules('2026-09-02');
    const second = await api.runDueSchedules('2026-09-02');

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual([]);
  });

  it('does not duplicate an occurrence when the schedule is replayed from stale state', async () => {
    const first = await api.runDueSchedules('2026-09-02');
    expect(first.some((transaction) => transaction.scheduleId === 'schedule-demo-rent')).toBe(true);

    const advanced = (await api.listSchedules()).find((schedule) => schedule.id === 'schedule-demo-rent');
    if (!advanced?.nextDueDate) throw new Error('expected an advanced schedule');

    await api.updateSchedule('schedule-demo-rent', {
      nextDueDate: '2026-09-02',
      expectedVersion: advanced.version,
    });

    const replay = await api.runDueSchedules('2026-09-02');
    expect(replay.some((transaction) => transaction.scheduleId === 'schedule-demo-rent')).toBe(false);

    const rentOccurrences = (await api.listTransactions({ month: '2026-09', pageSize: 100 })).items.filter(
      (transaction) => transaction.scheduleId === 'schedule-demo-rent',
    );
    expect(rentOccurrences).toHaveLength(1);
  });

  it('advances nextDueDate and records lastGeneratedDate', async () => {
    const before = (await api.listSchedules()).find((schedule) => schedule.id === 'schedule-demo-rent');
    expect(before).toMatchObject({ nextDueDate: '2026-09-02', lastGeneratedDate: null });

    await api.runDueSchedules('2026-09-02');

    const after = (await api.listSchedules()).find((schedule) => schedule.id === 'schedule-demo-rent');
    expect(after).toMatchObject({ nextDueDate: '2026-10-02', lastGeneratedDate: '2026-09-02' });
    expect(after?.version).toBe((before?.version ?? 0) + 1);
  });

  it('catches up across several missed occurrences in one run', async () => {
    const created = await api.runDueSchedules('2026-11-30');
    const rent = created.filter((transaction) => transaction.scheduleId === 'schedule-demo-rent');

    expect(rent.map((transaction) => transaction.occurrenceDate)).toEqual(['2026-09-02', '2026-10-02', '2026-11-02']);
  });

  it('retires a one-off schedule instead of repeating it', async () => {
    const created = await api.runDueSchedules('2026-12-31');
    const once = created.filter((transaction) => transaction.scheduleId === 'schedule-demo-insurance');

    expect(once.map((transaction) => transaction.occurrenceDate)).toEqual(['2026-08-24']);

    const schedule = (await api.listSchedules()).find((candidate) => candidate.id === 'schedule-demo-insurance');
    expect(schedule).toMatchObject({ nextDueDate: null, lastGeneratedDate: '2026-08-24' });

    const later = await api.runDueSchedules('2027-12-31');
    expect(later.some((transaction) => transaction.scheduleId === 'schedule-demo-insurance')).toBe(false);
  });

  it('leaves a deactivated schedule alone', async () => {
    const inactive = (await api.listSchedules(true)).filter((schedule) => schedule.deactivatedAt !== null);
    const created = await api.runDueSchedules('2026-12-31');

    for (const schedule of inactive) {
      expect(created.some((transaction) => transaction.scheduleId === schedule.id)).toBe(false);
    }
  });

  it('moves the account balance by the generated amount', async () => {
    const [before] = await api.listAccounts();
    if (!before) throw new Error('expected an account');

    const created = await api.runDueSchedules('2026-09-02');
    const delta = created
      .filter((transaction) => transaction.accountId === before.id)
      .reduce((total, transaction) => total + transaction.amountMinor, 0);

    const [after] = await api.listAccounts();
    expect(after?.balanceMinor).toBe(before.balanceMinor + delta);
  });
});

describe('import identity', () => {
  it('flags a previewed row that matches an existing imported transaction', async () => {
    const batch = await api.previewImport({ fileName: 'statement.csv', accountId: 'account-demo-everyday' });
    const duplicate = batch.rows.find((row) => row.status === 'DUPLICATE');

    expect(duplicate).toBeDefined();
    expect(duplicate?.included).toBe(false);
    expect(duplicate?.description).toBe('Local travel');
  });

  it('gives every row a fingerprint and the batch a content hash over them', async () => {
    const batch = await api.previewImport({ fileName: 'statement.csv', accountId: 'account-demo-everyday' });

    expect(batch.rows.every((row) => row.sourceFingerprint.length > 0)).toBe(true);
    expect(new Set(batch.rows.map((row) => row.sourceFingerprint)).size).toBe(batch.rows.length);
    expect(batch.contentHash.length).toBeGreaterThan(0);
  });

  it('carries the fingerprint onto committed transactions so a re-import detects them', async () => {
    const batch = await api.previewImport({ fileName: 'statement.csv', accountId: 'account-demo-everyday' });
    const result = await api.commitImport(batch.id, batch.version, batch.contentHash);

    expect(result.createdTransactions.length).toBeGreaterThan(0);
    for (const transaction of result.createdTransactions) {
      expect(transaction.importRowFingerprint).not.toBeNull();
    }

    const second = await api.previewImport({ fileName: 'statement.csv', accountId: 'account-demo-everyday' });
    expect(second.rows.every((row) => row.status === 'DUPLICATE')).toBe(true);
  });

  it('refuses a commit carrying a stale content hash', async () => {
    const batch = await api.previewImport({ fileName: 'statement.csv', accountId: 'account-demo-everyday' });

    await expect(api.commitImport(batch.id, batch.version, 'not-the-hash')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('separates statements by account, because the account is part of the fingerprint', async () => {
    const everyday = await api.previewImport({ fileName: 'statement.csv', accountId: 'account-demo-everyday' });
    const credit = await api.previewImport({ fileName: 'statement.csv', accountId: 'account-demo-credit' });

    expect(credit.contentHash).not.toBe(everyday.contentHash);
    expect(credit.rows.every((row) => row.status === 'READY')).toBe(true);
  });
});
