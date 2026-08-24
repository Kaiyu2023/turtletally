import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { ApiError, type ApiErrorCode } from '../data/types';

export type ResourceState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly code: ApiErrorCode | 'UNKNOWN' }
  | { readonly status: 'ready'; readonly value: T };

export function useApiResource<T>(
  load: () => Promise<T>,
  deps: DependencyList,
): ResourceState<T> & { reload: () => void } {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });

    void load()
      .then((value) => {
        if (active) setState({ status: 'ready', value });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({ status: 'error', code: error instanceof ApiError ? error.code : 'UNKNOWN' });
      });

    return () => {
      active = false;
    };
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);
  return { ...state, reload };
}
