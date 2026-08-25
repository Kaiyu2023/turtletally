import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppLocale, FinanceApi, Transaction, UserPreferences } from '../data/types';
import { SessionEndedNotice, Toast } from '../components/Ui';
import { commonMessages } from '../i18n/common';
import { LocaleProvider, message } from '../i18n/locale';
import { guardSession } from './session';

export type TransactionEditorState =
  { readonly mode: 'create' } | { readonly mode: 'edit'; readonly transaction: Transaction } | null;

type ToastState = {
  readonly message: string;
  readonly tone: 'success' | 'error';
};

type AppContextValue = {
  readonly api: FinanceApi;
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

type AppProviderProps = {
  readonly api: FinanceApi;
  readonly children: ReactNode;
};

export function AppProvider({ api: source, children }: AppProviderProps) {
  const [sessionLost, setSessionLost] = useState(false);
  const api = useMemo(() => guardSession(source, () => setSessionLost(true)), [source]);
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
    if (toast.tone === 'error') {
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
        <div className="visually-hidden" role="status" aria-live="polite">
          {toast?.tone === 'success' ? toast.message : ''}
        </div>
        <div className="visually-hidden" role="alert">
          {toast?.tone === 'error' ? toast.message : ''}
        </div>
        {sessionLost ? <SessionEndedNotice onReload={() => window.location.reload()} signInUrl={signInUrl()} /> : null}
        {children}
        {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
      </AppContext.Provider>
    </LocaleProvider>
  );
}

/// A deployed build sends the owner back to the sign-in route; a draft build
/// has no server to sign in to and offers a reload instead.
function signInUrl(): string | undefined {
  const base = import.meta.env.VITE_API_BASE;
  return base === undefined ? undefined : `${base.replace(/\/$/, '')}/auth/login`;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useApp must be used within AppProvider');
  }
  return value;
}
