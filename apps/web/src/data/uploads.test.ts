import { beforeEach, describe, expect, it } from 'vitest';
import { createMockApi } from './mockApi';
import type { FinanceApi } from './types';

let api: FinanceApi;

beforeEach(() => {
  api = createMockApi('DEFAULT', { latencyMs: 0 });
});

const CHECKSUM = 'a1b2c3d4e5f6a7b8';

describe('receipt uploads', () => {
  it('issues a grant, stores the object on completion, and returns a server-issued id', async () => {
    const grant = await api.requestReceiptUpload({
      fileName: 'receipt.png',
      mediaType: 'image/png',
      sizeBytes: 2_048,
    });

    expect(grant.uploadId).toBeTruthy();
    expect(grant.uploadUrl).toContain(grant.uploadId);

    const receipt = await api.completeReceiptUpload(grant.uploadId, CHECKSUM);
    expect(receipt.id).not.toBe(grant.uploadId);
    expect(receipt).toMatchObject({ fileName: 'receipt.png', mediaType: 'image/png', checksum: CHECKSUM });
  });

  it('refuses a media type outside the allowlist and a file over the limit', async () => {
    await expect(
      api.requestReceiptUpload({ fileName: 'x.exe', mediaType: 'application/x-msdownload' as never, sizeBytes: 10 }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    await expect(
      api.requestReceiptUpload({ fileName: 'big.pdf', mediaType: 'application/pdf', sizeBytes: 20 * 1024 * 1024 }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('consumes a grant once, so a replayed completion fails', async () => {
    const grant = await api.requestReceiptUpload({
      fileName: 'receipt.png',
      mediaType: 'image/png',
      sizeBytes: 2_048,
    });
    await api.completeReceiptUpload(grant.uploadId, CHECKSUM);

    await expect(api.completeReceiptUpload(grant.uploadId, CHECKSUM)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('requires a checksum, so an unverified object cannot be recorded', async () => {
    const grant = await api.requestReceiptUpload({
      fileName: 'receipt.png',
      mediaType: 'image/png',
      sizeBytes: 2_048,
    });

    await expect(api.completeReceiptUpload(grant.uploadId, '')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('attaches a stored receipt to a transaction by reference', async () => {
    const [account] = await api.listAccounts();
    if (!account) throw new Error('expected an account');

    const grant = await api.requestReceiptUpload({
      fileName: 'receipt.png',
      mediaType: 'image/png',
      sizeBytes: 2_048,
    });
    const receipt = await api.completeReceiptUpload(grant.uploadId, CHECKSUM);

    const created = await api.createTransaction({
      accountId: account.id,
      categoryId: null,
      description: 'With receipt',
      amountMinor: -1_500,
      kind: 'SPENDING',
      localDate: '2026-08-10',
      receiptId: receipt.id,
    });

    expect(created.receipt).toMatchObject({ id: receipt.id, checksum: CHECKSUM });
    await expect(api.getReceiptDownloadUrl(receipt.id)).resolves.toMatchObject({
      url: expect.stringContaining(receipt.id) as unknown as string,
    });
  });

  it('refuses a receipt reference the server does not hold', async () => {
    const [account] = await api.listAccounts();
    if (!account) throw new Error('expected an account');

    await expect(
      api.createTransaction({
        accountId: account.id,
        categoryId: null,
        description: 'Forged reference',
        amountMinor: -1_500,
        kind: 'SPENDING',
        localDate: '2026-08-10',
        receiptId: 'receipt-not-real',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('statement uploads', () => {
  it('previews only an upload the server issued, and consumes it', async () => {
    const grant = await api.requestStatementUpload({
      fileName: 'statement.csv',
      accountId: 'account-demo-everyday',
      sizeBytes: 4_096,
    });

    const batch = await api.previewImport({ uploadId: grant.uploadId, accountId: 'account-demo-everyday' });
    expect(batch.fileName).toBe('statement.csv');

    await expect(
      api.previewImport({ uploadId: grant.uploadId, accountId: 'account-demo-everyday' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a client-supplied upload identifier', async () => {
    await expect(
      api.previewImport({ uploadId: 'upload-not-real', accountId: 'account-demo-everyday' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('still rejects a file that is not a CSV, before any upload is granted', async () => {
    await expect(
      api.requestStatementUpload({ fileName: 'statement.pdf', accountId: 'account-demo-everyday', sizeBytes: 10 }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
