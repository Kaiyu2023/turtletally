import { useCallback, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useApiResource } from '../../app/useApiResource';
import { LoadError, PageHeader } from '../../components/Ui';
import { useMessages } from '../../i18n/locale';
import { dashboardMessages } from './messages';
import type { Month } from '../../data/types';
import { DashboardPage } from './index';

export function DashboardRoute() {
  const t = useMessages(dashboardMessages);
  const { api, refreshToken, openTransactionEditor } = useApp();
  const [month, setMonth] = useState<Month>('2026-08');

  const load = useCallback(
    () => Promise.all([api.getDashboard(month), api.listSchedules()]),
    [api, month, refreshToken],
  );
  const resource = useApiResource(load, [load]);

  if (resource.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('pageDescription')} />
        <LoadError code={resource.code} onRetry={resource.reload} />
      </div>
    );
  }

  const [summary, schedules] = resource.status === 'ready' ? resource.value : [null, []];

  return (
    <DashboardPage
      summary={summary}
      schedules={schedules}
      month={month}
      loading={resource.status === 'loading'}
      onMonthChange={setMonth}
      onAddTransaction={() => openTransactionEditor()}
      onOpenTransaction={(transaction) => openTransactionEditor(transaction)}
    />
  );
}
