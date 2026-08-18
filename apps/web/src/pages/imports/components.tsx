import { CheckCircle2, FileCheck2, FileClock, FileUp, ShieldCheck, TriangleAlert, UploadCloud } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Modal, Skeleton } from '../../components/Ui';
import type { Account, Category, ImportBatch, ImportHistoryItem } from '../../data/types';
import { useLocale, useMessages } from '../../i18n/locale';
import { importsMessages } from './messages';

type ImportSetupCardProps = {
  readonly accounts: readonly Account[];
  readonly accountId: string;
  readonly file: File | null;
  readonly busy: boolean;
  readonly onAccountChange: (accountId: string) => void;
  readonly onFileChange: (file: File | null) => void;
  readonly onCreate: () => void;
};

export function ImportSetupCard({
  accounts,
  accountId,
  file,
  busy,
  onAccountChange,
  onFileChange,
  onCreate,
}: ImportSetupCardProps) {
  const t = useMessages(importsMessages);

  return (
    <Card className="upload-card">
      <span className="upload-card__icon">
        <UploadCloud aria-hidden="true" />
      </span>
      <h2>{t('startPreview')}</h2>
      <p>{t('setupDescription')}</p>
      <div className="field">
        <label htmlFor="import-account">{t('destinationAccount')}</label>
        <select id="import-account" value={accountId} onChange={(event) => onAccountChange(event.target.value)}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>
      <label className="dropzone" htmlFor="statement-file">
        {file ? <FileCheck2 aria-hidden="true" /> : <FileUp aria-hidden="true" />}
        <strong>{file?.name ?? t('chooseCsv')}</strong>
        <span>{t('csvDemo')}</span>
      </label>
      <input
        id="statement-file"
        className="visually-hidden"
        type="file"
        accept="text/csv,.csv"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
      <Button variant="primary" busy={busy} disabled={!file || !accountId} onClick={onCreate}>
        {t('createPreview')}
      </Button>
      <div className="privacy-note">
        <ShieldCheck aria-hidden="true" size={18} />
        <span>{t('privacyNote')}</span>
      </div>
    </Card>
  );
}

type ImportHistoryCardProps = {
  readonly loading: boolean;
  readonly history: readonly ImportHistoryItem[];
  readonly onOpen: (id: string) => void;
};

export function ImportHistoryCard({ loading, history, onOpen }: ImportHistoryCardProps) {
  const { format } = useLocale();
  const t = useMessages(importsMessages);

  return (
    <Card className="content-card import-history">
      <CardHeader title={t('historyTitle')} description={t('historyDescription')} />
      {loading ? (
        <Skeleton lines={5} />
      ) : history.length === 0 ? (
        <EmptyState icon={<FileClock />} title={t('noHistory')} description={t('noHistoryDescription')} />
      ) : (
        <div className="history-list">
          {history.map((item) => (
            <button type="button" className="history-item" key={item.id} onClick={() => onOpen(item.id)}>
              <span className="history-item__icon">
                {item.status === 'COMMITTED' ? <CheckCircle2 aria-hidden="true" /> : <FileClock aria-hidden="true" />}
              </span>
              <span>
                <strong>{item.fileName}</strong>
                <small>
                  {item.accountName} · {format.date(item.createdAt.slice(0, 10))}
                </small>
              </span>
              <Badge
                tone={item.status === 'COMMITTED' ? 'positive' : item.status === 'EXPIRED' ? 'negative' : 'warning'}
              >
                {item.status === 'COMMITTED'
                  ? t('importedCount', { count: format.number(item.importedCount) })
                  : item.status === 'EXPIRED'
                    ? t('statusExpired')
                    : t('statusPreview')}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

type ImportRowChanges = {
  readonly included?: boolean;
  readonly categoryId?: string | null;
};

type ImportPreviewCardProps = {
  readonly preview: ImportBatch;
  readonly categories: readonly Category[];
  readonly selectedCount: number;
  readonly selectedTotal: number;
  readonly duplicateCount: number;
  readonly warningCount: number;
  readonly onUpdateRow: (rowId: string, changes: ImportRowChanges) => void;
  readonly onReviewCommit: () => void;
};

export function ImportPreviewCard({
  preview,
  categories,
  selectedCount,
  selectedTotal,
  duplicateCount,
  warningCount,
  onUpdateRow,
  onReviewCommit,
}: ImportPreviewCardProps) {
  const { format } = useLocale();
  const t = useMessages(importsMessages);
  const warningText = (warning: string) => {
    if (warning === 'Matches an existing transaction') return t('duplicateWarning');
    if (warning === 'Choose a category before committing') return t('missingCategoryWarning');
    return warning;
  };

  return (
    <Card className="content-card import-preview page-enter">
      <CardHeader
        eyebrow={t('preview')}
        title={preview.fileName}
        description={t('expires', {
          account: preview.accountName,
          date: format.date(preview.expiresAt.slice(0, 10)),
        })}
        action={
          <Badge tone={preview.status === 'COMMITTED' ? 'positive' : 'warning'}>
            {preview.status === 'COMMITTED'
              ? t('statusCommitted')
              : preview.status === 'EXPIRED'
                ? t('statusExpired')
                : t('statusPreview')}
          </Badge>
        }
      />
      <div className="import-summary">
        <div>
          <strong>{format.number(selectedCount)}</strong>
          <span>{t('rowsSelected')}</span>
        </div>
        <div>
          <strong>{format.money(selectedTotal)}</strong>
          <span>{t('selectedValue')}</span>
        </div>
        <div>
          <strong>{format.number(duplicateCount)}</strong>
          <span>{t('duplicatesSkipped')}</span>
        </div>
        <div>
          <strong>{format.number(warningCount)}</strong>
          <span>{t('warnings')}</span>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table import-table">
          <caption className="visually-hidden">{t('reviewCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('include')}</th>
              <th scope="col">{t('date')}</th>
              <th scope="col">{t('description')}</th>
              <th scope="col">{t('category')}</th>
              <th scope="col">{t('status')}</th>
              <th scope="col" className="align-right">
                {t('amount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={t('includeDescription', { description: row.description })}
                    checked={row.included}
                    disabled={preview.status !== 'PREVIEW' || row.status !== 'READY'}
                    onChange={(event) => onUpdateRow(row.id, { included: event.target.checked })}
                  />
                </td>
                <td>{format.date(row.localDate)}</td>
                <td>
                  <strong>{row.description}</strong>
                  {row.warnings.map((warning) => (
                    <small className="row-warning" key={warning}>
                      <TriangleAlert aria-hidden="true" size={13} />
                      {warningText(warning)}
                    </small>
                  ))}
                </td>
                <td>
                  <select
                    aria-label={t('categoryFor', { description: row.description })}
                    value={row.categoryId ?? ''}
                    disabled={preview.status !== 'PREVIEW' || row.status !== 'READY'}
                    onChange={(event) => onUpdateRow(row.id, { categoryId: event.target.value || null })}
                  >
                    <option value="">{t('chooseCategory')}</option>
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
                    {row.status === 'READY'
                      ? t('rowReady')
                      : row.status === 'DUPLICATE'
                        ? t('rowDuplicate')
                        : t('rowInvalid')}
                  </Badge>
                </td>
                <td className="align-right money negative">{format.money(-row.amountMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="commit-bar">
        <div>
          <strong>{preview.status === 'COMMITTED' ? t('importComplete') : t('readyToCommit')}</strong>
          <span>
            {preview.status === 'COMMITTED'
              ? t('transactionsCreated', { count: format.number(preview.importedCount) })
              : t('selectedRowsOnly')}
          </span>
        </div>
        {preview.status === 'PREVIEW' ? (
          <Button variant="primary" disabled={selectedCount === 0 || warningCount > 0} onClick={onReviewCommit}>
            {t('reviewAndCommit')}
          </Button>
        ) : (
          <Badge tone="positive">
            <CheckCircle2 aria-hidden="true" size={14} />
            {t('committed')}
          </Badge>
        )}
      </div>
    </Card>
  );
}

type CommitImportModalProps = {
  readonly open: boolean;
  readonly preview: ImportBatch | null;
  readonly selectedCount: number;
  readonly selectedTotal: number;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onCommit: () => void;
};

export function CommitImportModal({
  open,
  preview,
  selectedCount,
  selectedTotal,
  busy,
  onClose,
  onCommit,
}: CommitImportModalProps) {
  const { format } = useLocale();
  const t = useMessages(importsMessages);

  return (
    <Modal
      open={open}
      title={t('commitTitle')}
      description={t('commitDescription')}
      size="small"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('keepReviewing')}
          </Button>
          <Button variant="primary" busy={busy} onClick={onCommit}>
            {t('commitRows', { count: format.number(selectedCount) })}
          </Button>
        </>
      }
    >
      <p>
        {t('commitSummary', {
          count: format.number(selectedCount),
          total: format.money(selectedTotal),
          account: preview?.accountName ?? '',
        })}
      </p>
    </Modal>
  );
}
