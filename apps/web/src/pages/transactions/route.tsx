import { useCallback, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useApiResource } from '../../app/useApiResource';
import { Button, LoadError, Modal, PageHeader } from '../../components/Ui';
import type { Transaction, TransactionFilters } from '../../data/types';
import { useMessages } from '../../i18n/locale';
import { TransactionsPage } from './index';
import { transactionsMessages } from './messages';

export function TransactionsRoute() {
  const t = useMessages(transactionsMessages);
  const { api, refreshToken, openTransactionEditor, refresh, notify } = useApp();
  const [filters, setFilters] = useState<TransactionFilters>({
    month: '2026-08',
    page: 1,
    pageSize: 10,
    status: 'ACTIVE',
    sort: 'NEWEST',
  });
  const [voiding, setVoiding] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => Promise.all([api.listTransactions(filters), api.listAccounts(true), api.listCategories(true)]),
    [api, filters, refreshToken],
  );
  const resource = useApiResource(load, [load]);

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

  if (resource.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('pageDescription')} />
        <LoadError code={resource.code} onRetry={resource.reload} />
      </div>
    );
  }

  const [page, accounts, categories] = resource.status === 'ready' ? resource.value : [null, [], []];

  return (
    <>
      <TransactionsPage
        page={page}
        accounts={accounts}
        categories={categories}
        filters={filters}
        loading={resource.status === 'loading'}
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
