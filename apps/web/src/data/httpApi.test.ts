import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpApi } from './httpApi';
import type { FinanceApi } from './types';

type Call = { url: string; init: RequestInit & { body?: string } };

let calls: Call[];
let api: FinanceApi;

function respondWith(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit & { body?: string }) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(status === 204 ? null : JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal('document', { cookie: '__Host-finance_csrf=confirmation-token; other=1' });
  api = createHttpApi('');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('http api', () => {
  it('names its window and its page in the query string', async () => {
    respondWith({ items: [], limit: 10, nextCursor: null });
    await api.listTransactions({ month: '2026-08', limit: 20, status: 'ACTIVE' });

    expect(calls[0]?.url).toBe('/api/transactions?month=2026-08&limit=20&status=ACTIVE');
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.init.credentials).toBe('same-origin');
  });

  it('leaves an absent filter out rather than sending an empty one', async () => {
    respondWith({ items: [], limit: 10, nextCursor: null });
    await api.listTransactions({ month: '2026-08', search: '' });

    expect(calls[0]?.url).toBe('/api/transactions?month=2026-08');
  });

  it('carries the confirmation token on a mutation and not on a read', async () => {
    respondWith({ id: 'account-1' });
    await api.createAccount({ name: 'Everyday', type: 'CURRENT', openingBalanceMinor: 0, colour: '#809bce' });
    await api.listAccounts();

    expect(new Headers(calls[0]?.init.headers).get('x-csrf-token')).toBe('confirmation-token');
    expect(new Headers(calls[1]?.init.headers).get('x-csrf-token')).toBeNull();
  });

  it('turns the server error envelope into the contract error', async () => {
    respondWith({ code: 'CONFLICT', message: 'This item changed since it was loaded.' }, 409);

    await expect(api.getUserPreferences()).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This item changed since it was loaded.',
    });
  });

  it('treats an unauthenticated response as a lost session even without a body', async () => {
    respondWith(null, 401);
    await expect(api.getUserPreferences()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('reports an unreachable server without pretending it is a contract error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await expect(api.getUserPreferences()).rejects.toThrow('The server could not be reached.');
  });

  it('sends a void reason only when one was given', async () => {
    respondWith({ id: 'transaction-1' });
    await api.voidTransaction('transaction-1', 3);
    await api.voidTransaction('transaction-1', 3, 'Duplicate');

    expect(JSON.parse(calls[0]?.init.body ?? '{}')).toEqual({ expectedVersion: 3 });
    expect(JSON.parse(calls[1]?.init.body ?? '{}')).toEqual({ expectedVersion: 3, reason: 'Duplicate' });
  });

  it('refuses the features this release does not serve rather than failing obscurely', async () => {
    await expect(api.previewImport({ uploadId: 'upload-1', accountId: 'account-1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
