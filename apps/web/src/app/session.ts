import { MockApiError, type MockFinanceApi } from '../data/types';

export function guardSession(api: MockFinanceApi, onSessionLost: () => void): MockFinanceApi {
  return new Proxy(api, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;

      const method = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]): unknown => {
        const result = method.apply(target, args);
        if (!(result instanceof Promise)) return result;
        return result.catch((error: unknown) => {
          if (error instanceof MockApiError && error.code === 'UNAUTHENTICATED') onSessionLost();
          throw error;
        });
      };
    },
  });
}
