import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createMockApi } from '../data/mockApi';
import type { AppLocale, MockFinanceApi, MockScenario, Transaction, UserPreferences } from '../data/types';
import { Toast } from '../components/Ui';
import { commonMessages } from '../i18n/common';
import { LocaleProvider, message } from '../i18n/locale';

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
  readonly preferences: UserPreferences;
  readonly preferencesLoading: boolean;
  readonly refresh: () => void;
  readonly updateLocale: (locale: AppLocale) => Promise<void>;
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
  const [preferences, setPreferences] = useState<UserPreferences>({
    locale: 'en-GB',
    version: 1,
    updatedAt: '',
  });
  const [preferencesLoading, setPreferencesLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void api
      .getUserPreferences()
      .then((nextPreferences) => {
        if (active) setPreferences(nextPreferences);
      })
      .catch(() => {
        if (active) setToast({ message: message('en-GB', commonMessages, 'preferencesLoadError'), tone: 'error' });
      })
      .finally(() => {
        if (active) setPreferencesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const refresh = useCallback(() => setRefreshToken((current) => current + 1), []);
  const updateLocale = useCallback(
    async (locale: AppLocale) => {
      const nextPreferences = await api.updateUserPreferences({
        locale,
        expectedVersion: preferences.version,
      });
      setPreferences(nextPreferences);
    },
    [api, preferences.version],
  );
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
      preferences,
      preferencesLoading,
      refresh,
      updateLocale,
      openTransactionEditor,
      closeTransactionEditor,
      notify,
    }),
    [
      api,
      closeTransactionEditor,
      notify,
      openTransactionEditor,
      preferences,
      preferencesLoading,
      refresh,
      refreshToken,
      transactionEditor,
      updateLocale,
    ],
  );

  return (
    <LocaleProvider locale={preferences.locale}>
      <AppContext.Provider value={value}>
        {children}
        {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
      </AppContext.Provider>
    </LocaleProvider>
  );
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useApp must be used within AppProvider');
  }
  return value;
}
