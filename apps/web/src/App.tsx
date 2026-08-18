import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './app/AppContext';
import { AppShell } from './components/AppShell';
import { Button, Modal } from './components/Ui';
import { TransactionEditor } from './components/TransactionEditor';
import type {
  Account,
  Category,
  DashboardSummary,
  Month,
  Schedule,
  Transaction,
  TransactionFilters,
  TransactionPage,
} from './data/types';
import { commonMessages } from './i18n/common';
import { useMessages } from './i18n/locale';
import { BudgetsPage } from './pages/budgets';
import { DashboardPage } from './pages/dashboard';
import { ImportsPage } from './pages/imports';
import { SchedulesPage } from './pages/schedules';
import { SettingsPage } from './pages/settings';
import { TransactionsPage } from './pages/transactions';
import { transactionsMessages } from './pages/transactions/messages';

export function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}

function AppRoutes() {
  const t = useMessages(commonMessages);
  const { notify, openTransactionEditor } = useApp();
  return (
    <AppShell onAddTransaction={() => openTransactionEditor()} onShowNotifications={() => notify(t('noNotifications'))}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardRoute />} />
        <Route path="/transactions" element={<TransactionsRoute />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/schedules" element={<SchedulesPage />} />
        <Route path="/imports" element={<ImportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <TransactionEditor />
    </AppShell>
  );
}

function DashboardRoute() {
  const t = useMessages(commonMessages);
  const { api, refreshToken, openTransactionEditor, notify } = useApp();
  const [month, setMonth] = useState<Month>('2026-08');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([api.getDashboard(month), api.listSchedules()])
      .then(([nextSummary, nextSchedules]) => {
        if (!active) return;
        setSummary(nextSummary);
        setSchedules(nextSchedules);
      })
      .catch(() => notify(t('overviewLoadError'), 'error'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, month, notify, refreshToken]);

  return (
    <DashboardPage
      summary={summary}
      schedules={schedules}
      month={month}
      loading={loading}
      onMonthChange={setMonth}
      onAddTransaction={() => openTransactionEditor()}
      onOpenTransaction={(transaction) => openTransactionEditor(transaction)}
    />
  );
}

function TransactionsRoute() {
  const t = useMessages(transactionsMessages);
  const { api, refreshToken, openTransactionEditor, refresh, notify } = useApp();
  const [filters, setFilters] = useState<TransactionFilters>({
    month: '2026-08',
    page: 1,
    pageSize: 10,
    status: 'ACTIVE',
    sort: 'NEWEST',
  });
  const [page, setPage] = useState<TransactionPage | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([api.listTransactions(filters), api.listAccounts(true), api.listCategories(true)])
      .then(([nextPage, nextAccounts, nextCategories]) => {
        if (!active) return;
        setPage(nextPage);
        setAccounts(nextAccounts);
        setCategories(nextCategories);
      })
      .catch(() => notify(t('loadError'), 'error'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, filters, notify, refreshToken]);

  async function voidTransaction() {
    if (!voiding) return;
    setBusy(true);
    try {
      await api.voidTransaction(voiding.id, voiding.version, voidReason || undefined);
      notify(t('voidSuccess'));
      setVoiding(null);
      setVoidReason('');
      refresh();
    } catch {
      notify(t('voidError'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TransactionsPage
        page={page}
        accounts={accounts}
        categories={categories}
        filters={filters}
        loading={loading}
        onFiltersChange={setFilters}
        onAdd={() => openTransactionEditor()}
        onEdit={openTransactionEditor}
        onVoid={setVoiding}
      />
      <Modal
        open={voiding !== null}
        title={t('voidDialogTitle')}
        description={t('voidDialogDescription')}
        size="small"
        onClose={() => setVoiding(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setVoiding(null)}>
              {t('keepTransaction')}
            </Button>
            <Button variant="danger" busy={busy} onClick={() => void voidTransaction()}>
              {t('voidTransaction')}
            </Button>
          </>
        }
      >
        <p>
          <strong>{voiding?.description}</strong> {t('voidBodySuffix')}
        </p>
        <div className="field">
          <label htmlFor="void-reason">
            {t('reason')} <span className="muted">{t('optional')}</span>
          </label>
          <input
            id="void-reason"
            value={voidReason}
            maxLength={100}
            onChange={(event) => setVoidReason(event.target.value)}
          />
        </div>
      </Modal>
    </>
  );
}
