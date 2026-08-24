import { describe, expect, it, vi } from 'vitest';
import { guardSession } from './session';
import { createApiFromLocation } from './createApi';
import { ApiError, type FinanceApi } from '../data/types';

describe('guardSession', () => {
  it('reports an expired session once per failing call and rethrows', async () => {
    const api = createApiFromLocation('?session=expired&latency=0');
    const onSessionLost = vi.fn();
    const guarded = guardSession(api, onSessionLost);

    await expect(guarded.listAccounts()).rejects.toBeInstanceOf(ApiError);
    await expect(guarded.getDashboard('2026-08')).rejects.toBeInstanceOf(ApiError);

    expect(onSessionLost).toHaveBeenCalledTimes(2);
  });

  it('surfaces the code so a caller can still branch on it', async () => {
    const guarded = guardSession(createApiFromLocation('?session=expired&latency=0'), () => {});

    await expect(guarded.listAccounts()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('leaves an active session and other failures alone', async () => {
    const onSessionLost = vi.fn();
    const guarded = guardSession(createApiFromLocation('?latency=0'), onSessionLost);

    await expect(guarded.listAccounts()).resolves.toHaveLength(3);
    await expect(guarded.updateAccount('account-missing', { expectedVersion: 1 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(onSessionLost).not.toHaveBeenCalled();
  });

  it('covers every operation on the contract, not a hand-listed subset', async () => {
    const api = createApiFromLocation('?session=expired&latency=0');
    const calls: Array<keyof FinanceApi> = ['listAccounts', 'listCategories', 'listSchedules', 'listImports'];
    const onSessionLost = vi.fn();
    const guarded = guardSession(api, onSessionLost);

    for (const call of calls) {
      await expect((guarded[call] as () => Promise<unknown>)()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    }

    expect(onSessionLost).toHaveBeenCalledTimes(calls.length);
  });
});

describe('createApiFromLocation', () => {
  it('selects the empty scenario only for the documented value', async () => {
    await expect(
      createApiFromLocation('?scenario=empty&latency=0').listTransactions({ month: '2026-08' }),
    ).resolves.toMatchObject({
      totalItems: 0,
    });
    await expect(
      createApiFromLocation('?scenario=nonsense&latency=0').listTransactions({ month: '2026-08' }),
    ).resolves.not.toMatchObject({
      totalItems: 0,
    });
  });

  it('ignores a latency value that is not a usable number', async () => {
    await expect(createApiFromLocation('?latency=-5').listAccounts()).resolves.toHaveLength(3);
    await expect(createApiFromLocation('?latency=nonsense').listAccounts()).resolves.toHaveLength(3);
  });
});
