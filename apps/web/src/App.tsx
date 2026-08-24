import { Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './app/AppContext';
import { RouteBoundary } from './app/RouteBoundary';
import { AppShell } from './components/AppShell';
import { TransactionEditor } from './components/TransactionEditor';
import type { MockFinanceApi } from './data/types';
import { commonMessages } from './i18n/common';
import { useMessages } from './i18n/locale';
import { BudgetsPage } from './pages/budgets';
import { DashboardRoute } from './pages/dashboard/route';
import { ImportsPage } from './pages/imports';
import { SchedulesPage } from './pages/schedules';
import { SettingsPage } from './pages/settings';
import { TransactionsRoute } from './pages/transactions/route';

export function App({ api }: { readonly api: MockFinanceApi }) {
  return (
    <AppProvider api={api}>
      <AppRoutes />
    </AppProvider>
  );
}

function AppRoutes() {
  const t = useMessages(commonMessages);
  const { notify, openTransactionEditor } = useApp();
  return (
    <AppShell onAddTransaction={() => openTransactionEditor()} onShowNotifications={() => notify(t('noNotifications'))}>
      <RouteBoundary>
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
      </RouteBoundary>
      <TransactionEditor />
    </AppShell>
  );
}
