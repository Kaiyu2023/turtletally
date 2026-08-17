import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createMockApi } from '../data/mockApi';
import type { MockFinanceApi, MockScenario, Transaction } from '../data/types';
import { Toast } from '../components/Ui';

export type TransactionEditorState =
  { readonly mode: 'create' } | { readonly mode: 'edit'; readonly transaction: Transaction } | null;

type ToastState = {
  readonly message: string;
  readonly tone: 'success' | 'error';
};

type AppContextValue = {
  readonly api: MockFinanceApi;
  readonly refreshToken: number;
  readonly transactionEditor: TransactionEditorState;
  readonly refresh: () => void;
  readonly openTransactionEditor: (transaction?: Transaction) => void;
  readonly closeTransactionEditor: () => void;
  readonly notify: (message: string, tone?: ToastState['tone']) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function selectedScenario(): MockScenario {
  return new URLSearchParams(window.location.search).get('scenario') === 'empty' ? 'EMPTY' : 'DEFAULT';
}

export function AppProvider({ children }: { readonly children: ReactNode }) {
  const api = useMemo(() => createMockApi(selectedScenario()), []);
  const [refreshToken, setRefreshToken] = useState(0);
  const [transactionEditor, setTransactionEditor] = useState<TransactionEditorState>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const refresh = useCallback(() => setRefreshToken((current) => current + 1), []);
  const openTransactionEditor = useCallback((transaction?: Transaction) => {
    setTransactionEditor(transaction ? { mode: 'edit', transaction } : { mode: 'create' });
  }, []);
  const closeTransactionEditor = useCallback(() => setTransactionEditor(null), []);
  const notify = useCallback((message: string, tone: ToastState['tone'] = 'success') => {
    setToast({ message, tone });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      api,
      refreshToken,
      transactionEditor,
      refresh,
      openTransactionEditor,
      closeTransactionEditor,
      notify,
    }),
    [api, closeTransactionEditor, notify, openTransactionEditor, refresh, refreshToken, transactionEditor],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useApp must be used within AppProvider');
  }
  return value;
}
