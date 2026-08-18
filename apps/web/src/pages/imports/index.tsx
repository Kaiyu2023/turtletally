import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/Ui';
import { useApp } from '../../app/AppContext';
import type { Account, Category, ImportBatch, ImportHistoryItem } from '../../data/types';
import { useLocale, useMessages } from '../../i18n/locale';
import { CommitImportModal, ImportHistoryCard, ImportPreviewCard, ImportSetupCard } from './components';
import { importsMessages } from './messages';
import './styles.css';

export function ImportsPage() {
  const { api, refreshToken, refresh, notify } = useApp();
  const { format } = useLocale();
  const t = useMessages(importsMessages);
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [preview, setPreview] = useState<ImportBatch | null>(null);
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmCommit, setConfirmCommit] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([api.listImports(), api.listAccounts(), api.listCategories()])
      .then(([nextHistory, nextAccounts, nextCategories]) => {
        if (!active) return;
        setHistory(nextHistory);
        setAccounts(nextAccounts);
        setCategories(nextCategories);
        setAccountId((current) => current || nextAccounts[0]?.id || '');
      })
      .catch(() => notify(t('loadError'), 'error'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, notify, refreshToken, t]);

  const selectedRows = useMemo(() => preview?.rows.filter((row) => row.included) ?? [], [preview]);
  const selectedTotal = selectedRows.reduce((total, row) => total + row.amountMinor, 0);
  const duplicateCount = preview?.rows.filter((row) => row.status === 'DUPLICATE').length ?? 0;
  const warningCount = preview?.rows.filter((row) => row.warnings.length > 0 && row.status !== 'DUPLICATE').length ?? 0;

  async function createPreview() {
    if (!file || !accountId) {
      notify(t('chooseFileAndAccount'), 'error');
      return;
    }
    setBusy(true);
    try {
      const batch = await api.previewImport({ fileName: file.name, accountId });
      setPreview(batch);
      notify(t('previewReady'));
      refresh();
    } catch {
      notify(t('previewError'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function openPreview(id: string) {
    setBusy(true);
    try {
      setPreview(await api.getImportPreview(id));
    } catch {
      notify(t('openPreviewError'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function updateRow(
    rowId: string,
    changes: { readonly included?: boolean; readonly categoryId?: string | null },
  ) {
    if (!preview) return;
    try {
      setPreview(await api.updateImportRow(preview.id, rowId, { expectedVersion: preview.version, ...changes }));
    } catch {
      notify(t('updateRowError'), 'error');
    }
  }

  async function commitImport() {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await api.commitImport(preview.id, preview.version);
      setPreview(result.batch);
      setConfirmCommit(false);
      notify(t('importedNotice', { count: format.number(result.createdTransactions.length) }));
      refresh();
    } catch {
      notify(t('commitError'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('pageDescription')} />
      <div className="split-layout split-layout--imports">
        <ImportSetupCard
          accounts={accounts}
          accountId={accountId}
          file={file}
          busy={busy}
          onAccountChange={setAccountId}
          onFileChange={setFile}
          onCreate={() => void createPreview()}
        />
        <ImportHistoryCard loading={loading} history={history} onOpen={(id) => void openPreview(id)} />
      </div>

      {preview ? (
        <ImportPreviewCard
          preview={preview}
          categories={categories}
          selectedCount={selectedRows.length}
          selectedTotal={selectedTotal}
          duplicateCount={duplicateCount}
          warningCount={warningCount}
          onUpdateRow={(rowId, changes) => void updateRow(rowId, changes)}
          onReviewCommit={() => setConfirmCommit(true)}
        />
      ) : null}

      <CommitImportModal
        open={confirmCommit}
        preview={preview}
        selectedCount={selectedRows.length}
        selectedTotal={selectedTotal}
        busy={busy}
        onClose={() => setConfirmCommit(false)}
        onCommit={() => void commitImport()}
      />
    </div>
  );
}
