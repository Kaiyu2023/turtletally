import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileCheck2, FileClock, FileUp, ShieldCheck, TriangleAlert, UploadCloud } from 'lucide-react';
import { useApp } from '../app/AppContext';
import type { Account, Category, ImportBatch, ImportHistoryItem } from '../data/types';
import { formatDate, formatMoney } from '../utils/format';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Skeleton } from '../components/Ui';
import './pages.css';

export function ImportsPage() {
  const { api, refreshToken, refresh, notify } = useApp();
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
      .catch((reason: unknown) =>
        notify(reason instanceof Error ? reason.message : 'Imports could not be loaded.', 'error'),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, notify, refreshToken]);

  const selectedRows = useMemo(() => preview?.rows.filter((row) => row.included) ?? [], [preview]);
  const selectedTotal = selectedRows.reduce((total, row) => total + row.amountMinor, 0);
  const duplicateCount = preview?.rows.filter((row) => row.status === 'DUPLICATE').length ?? 0;
  const warningCount = preview?.rows.filter((row) => row.warnings.length > 0 && row.status !== 'DUPLICATE').length ?? 0;

  async function createPreview() {
    if (!file || !accountId) {
      notify('Choose a CSV file and destination account.', 'error');
      return;
    }
    setBusy(true);
    try {
      const batch = await api.previewImport({ fileName: file.name, accountId });
      setPreview(batch);
      notify('Synthetic statement preview is ready.');
      refresh();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'The statement could not be previewed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function openPreview(id: string) {
    setBusy(true);
    try {
      setPreview(await api.getImportPreview(id));
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'The preview could not be opened.', 'error');
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
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'The preview row could not be updated.', 'error');
    }
  }

  async function commitImport() {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await api.commitImport(preview.id, preview.version);
      setPreview(result.batch);
      setConfirmCommit(false);
      notify(`${result.createdTransactions.length} synthetic transactions imported.`);
      refresh();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'The import could not be committed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Review before anything changes"
        title="Statement imports"
        description="Upload a synthetic CSV, inspect every row, resolve warnings, then commit once."
      />
      <div className="split-layout split-layout--imports">
        <Card className="upload-card">
          <span className="upload-card__icon">
            <UploadCloud aria-hidden="true" />
          </span>
          <h2>Start a new preview</h2>
          <p>The draft reads only the filename and uses generated rows. No file content leaves your browser.</p>
          <div className="field">
            <label htmlFor="import-account">Destination account</label>
            <select id="import-account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <label className="dropzone" htmlFor="statement-file">
            {file ? <FileCheck2 aria-hidden="true" /> : <FileUp aria-hidden="true" />}
            <strong>{file?.name ?? 'Choose a synthetic CSV'}</strong>
            <span>CSV only · demo parsing</span>
          </label>
          <input
            id="statement-file"
            className="visually-hidden"
            type="file"
            accept="text/csv,.csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <Button variant="primary" busy={busy} disabled={!file || !accountId} onClick={() => void createPreview()}>
            Create preview
          </Button>
          <div className="privacy-note">
            <ShieldCheck aria-hidden="true" size={18} />
            <span>No real statements belong in this public draft.</span>
          </div>
        </Card>

        <Card className="content-card import-history">
          <div className="card__header">
            <div>
              <h2>Import history</h2>
              <p>Preview and commit states in this browser session.</p>
            </div>
          </div>
          {loading ? (
            <Skeleton lines={5} />
          ) : history.length === 0 ? (
            <EmptyState
              icon={<FileClock />}
              title="No import history"
              description="Your synthetic preview history will appear here."
            />
          ) : (
            <div className="history-list">
              {history.map((item) => (
                <button type="button" className="history-item" key={item.id} onClick={() => void openPreview(item.id)}>
                  <span className="history-item__icon">
                    {item.status === 'COMMITTED' ? (
                      <CheckCircle2 aria-hidden="true" />
                    ) : (
                      <FileClock aria-hidden="true" />
                    )}
                  </span>
                  <span>
                    <strong>{item.fileName}</strong>
                    <small>
                      {item.accountName} · {formatDate(item.createdAt.slice(0, 10))}
                    </small>
                  </span>
                  <Badge
                    tone={item.status === 'COMMITTED' ? 'positive' : item.status === 'EXPIRED' ? 'negative' : 'warning'}
                  >
                    {item.status === 'COMMITTED' ? `${item.importedCount} imported` : item.status.toLowerCase()}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {preview ? (
        <Card className="content-card import-preview page-enter">
          <div className="card__header">
            <div>
              <span className="eyebrow">Preview</span>
              <h2>{preview.fileName}</h2>
              <p>
                {preview.accountName} · expires {formatDate(preview.expiresAt.slice(0, 10))}
              </p>
            </div>
            <Badge tone={preview.status === 'COMMITTED' ? 'positive' : 'warning'}>{preview.status}</Badge>
          </div>
          <div className="import-summary">
            <div>
              <strong>{selectedRows.length}</strong>
              <span>rows selected</span>
            </div>
            <div>
              <strong>{formatMoney(selectedTotal)}</strong>
              <span>selected value</span>
            </div>
            <div>
              <strong>{duplicateCount}</strong>
              <span>duplicates skipped</span>
            </div>
            <div>
              <strong>{warningCount}</strong>
              <span>warnings</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table import-table">
              <caption className="visually-hidden">Statement rows ready for review</caption>
              <thead>
                <tr>
                  <th scope="col">Include</th>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="align-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Include ${row.description}`}
                        checked={row.included}
                        disabled={preview.status !== 'PREVIEW' || row.status !== 'READY'}
                        onChange={(event) => void updateRow(row.id, { included: event.target.checked })}
                      />
                    </td>
                    <td>{formatDate(row.localDate)}</td>
                    <td>
                      <strong>{row.description}</strong>
                      {row.warnings.map((warning) => (
                        <small className="row-warning" key={warning}>
                          <TriangleAlert aria-hidden="true" size={13} />
                          {warning}
                        </small>
                      ))}
                    </td>
                    <td>
                      <select
                        aria-label={`Category for ${row.description}`}
                        value={row.categoryId ?? ''}
                        disabled={preview.status !== 'PREVIEW' || row.status !== 'READY'}
                        onChange={(event) => void updateRow(row.id, { categoryId: event.target.value || null })}
                      >
                        <option value="">Choose category</option>
                        {categories
                          .filter((category) => category.group !== 'Income' && category.group !== 'Investment')
                          .map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <Badge
                        tone={row.status === 'READY' ? 'positive' : row.status === 'DUPLICATE' ? 'warning' : 'negative'}
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="align-right money negative">−{formatMoney(row.amountMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="commit-bar">
            <div>
              <strong>{preview.status === 'COMMITTED' ? 'Import complete' : 'Ready for deliberate commit'}</strong>
              <span>
                {preview.status === 'COMMITTED'
                  ? `${preview.importedCount} transactions were created.`
                  : 'Only selected, valid rows will become transactions.'}
              </span>
            </div>
            {preview.status === 'PREVIEW' ? (
              <Button
                variant="primary"
                disabled={selectedRows.length === 0 || warningCount > 0}
                onClick={() => setConfirmCommit(true)}
              >
                Review and commit
              </Button>
            ) : (
              <Badge tone="positive">
                <CheckCircle2 aria-hidden="true" size={14} />
                Committed
              </Badge>
            )}
          </div>
        </Card>
      ) : null}

      <Modal
        open={confirmCommit}
        title="Commit this import?"
        description="This demo operation is idempotent and can be committed only once."
        size="small"
        onClose={() => setConfirmCommit(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCommit(false)}>
              Keep reviewing
            </Button>
            <Button variant="primary" busy={busy} onClick={() => void commitImport()}>
              Commit {selectedRows.length} rows
            </Button>
          </>
        }
      >
        <p>
          You are about to create <strong>{selectedRows.length} transactions</strong> totalling{' '}
          <strong>{formatMoney(selectedTotal)}</strong> in {preview?.accountName}.
        </p>
      </Modal>
    </div>
  );
}
