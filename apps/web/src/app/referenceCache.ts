import type { FinanceApi } from '../data/types';

// ADR 0007: accounts and categories are bounded lists that every route resolves
// names against, and they change only when the owner writes. Reading them once
// per session keeps a route's cost to its own page-shaped read.
const CACHED_READS = new Set(['listAccounts', 'listCategories']);

const READS = new Set([
  ...CACHED_READS,
  'getUserPreferences',
  'listTransactions',
  'getTransaction',
  'listBudgets',
  'listBudgetDefaults',
  'getDashboard',
  'listSchedules',
  'listImports',
  'getImportPreview',
  'getReceiptDownloadUrl',
]);

export function cacheReferenceLists(api: FinanceApi): FinanceApi {
  const lists = new Map<string, Promise<unknown[]>>();

  return new Proxy(api, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;

      const method = value as (...args: unknown[]) => unknown;
      const name = String(property);

      return (...args: unknown[]): unknown => {
        if (!READS.has(name)) {
          lists.clear();
          return method.apply(target, args);
        }

        if (!CACHED_READS.has(name)) return method.apply(target, args);

        const key = `${name}:${args[0] === true}`;
        const cached = lists.get(key);
        if (cached) return cached.then((items) => [...items]);

        const pending = (method.apply(target, args) as Promise<unknown[]>).catch((error: unknown) => {
          lists.delete(key);
          throw error;
        });
        lists.set(key, pending);
        return pending.then((items) => [...items]);
      };
    },
  });
}
