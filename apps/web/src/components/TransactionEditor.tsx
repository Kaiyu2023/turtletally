import { useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { FileCheck2, Paperclip, ShieldCheck } from 'lucide-react';
import { useApp, type TransactionEditorState } from '../app/AppContext';
import { flowOf, magnitudeOf, signedAmount } from '../data/money';
import { useDomainMessages } from '../i18n/domain';
import type { Account, Category, LocalDate, TransactionFlow, TransactionKind, UploadMediaType } from '../data/types';
import { useLocale, useMessages } from '../i18n/locale';
import { parseGbpInput, toGbpInput } from '../utils/format';
import { transactionEditorMessages } from './transactionEditor.messages';
import { Button, Modal, Skeleton, SegmentedControl } from './Ui';

type FormState = {
  description: string;
  amount: string;
  accountId: string;
  categoryId: string;
  kind: TransactionKind;
  flow: TransactionFlow;
  localDate: string;
  receipt: File | null;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const blankForm: FormState = {
  description: '',
  amount: '',
  accountId: '',
  categoryId: '',
  kind: 'SPENDING',
  flow: 'DEBIT',
  localDate: '2026-08-17',
  receipt: null,
};

// The browser computes the checksum the server will verify the stored object
// against. The bytes go to the upload URL, never through the API.
async function checksumOf(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function TransactionEditor() {
  const t = useMessages(transactionEditorMessages);
  const { format } = useLocale();
  const domain = useDomainMessages();
  const { api, transactionEditor, closeTransactionEditor, refresh, notify } = useApp();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormState>(blankForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [loadedEditor, setLoadedEditor] = useState<TransactionEditorState>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const open = transactionEditor !== null;
  const editing = transactionEditor?.mode === 'edit' ? transactionEditor.transaction : null;

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    void Promise.all([api.listAccounts(), api.listCategories()])
      .then(([nextAccounts, nextCategories]) => {
        if (!active) {
          return;
        }
        setAccounts(nextAccounts);
        setCategories(nextCategories);
        setForm(
          editing
            ? {
                description: editing.description,
                amount: toGbpInput(magnitudeOf(editing.amountMinor)),
                accountId: editing.accountId,
                categoryId: editing.categoryId ?? '',
                kind: editing.kind,
                flow: flowOf(editing.amountMinor),
                localDate: editing.localDate,
                receipt: null,
              }
            : {
                ...blankForm,
                accountId: nextAccounts[0]?.id ?? '',
              },
        );
        setErrors({});
        setLoadedEditor(transactionEditor);
      })
      .catch(() => {
        notify(t('loadError'), 'error');
      });

    return () => {
      active = false;
    };
  }, [api, editing, notify, open, transactionEditor]);

  const ready = open && loadedEditor === transactionEditor;

  const availableCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (form.kind === 'INCOME') {
          return category.group === 'Income';
        }
        if (form.kind === 'INVESTMENT') {
          return category.group === 'Investment';
        }
        return category.group !== 'Income' && category.group !== 'Investment';
      }),
    [categories, form.kind],
  );

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate(): { readonly amountMinor: number; readonly localDate: LocalDate } | null {
    const nextErrors: FormErrors = {};
    const amountMinor = parseGbpInput(form.amount);
    if (!form.description.trim()) nextErrors.description = t('descriptionRequired');
    if (!amountMinor) nextErrors.amount = t('amountInvalid');
    if (!form.accountId) nextErrors.accountId = t('accountRequired');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.localDate)) nextErrors.localDate = t('dateInvalid');
    if (form.receipt && form.receipt.size > 10 * 1024 * 1024) nextErrors.receipt = t('receiptTooLarge');
    if (form.receipt && !['application/pdf', 'image/jpeg', 'image/png'].includes(form.receipt.type))
      nextErrors.receipt = t('receiptTypeInvalid');

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !amountMinor) {
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return null;
    }
    return { amountMinor, localDate: form.localDate as LocalDate };
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const valid = validate();
    if (!valid) {
      return;
    }

    setBusy(true);
    try {
      let receiptId: string | null = editing?.receipt?.id ?? null;
      if (form.receipt) {
        const file = form.receipt;
        const grant = await api.requestReceiptUpload({
          fileName: file.name,
          mediaType: file.type as UploadMediaType,
          sizeBytes: file.size,
        });
        const stored = await api.completeReceiptUpload(grant.uploadId, await checksumOf(file));
        receiptId = stored.id;
      }

      if (editing) {
        await api.updateTransaction(editing.id, {
          expectedVersion: editing.version,
          description: form.description,
          amountMinor: signedAmount(valid.amountMinor, form.flow),
          accountId: form.accountId,
          categoryId: form.categoryId || null,
          kind: form.kind,
          localDate: valid.localDate,
          receiptId,
        });
        notify(t('updated'));
      } else {
        await api.createTransaction({
          description: form.description,
          amountMinor: signedAmount(valid.amountMinor, form.flow),
          accountId: form.accountId,
          categoryId: form.categoryId || null,
          kind: form.kind,
          localDate: valid.localDate,
          receiptId,
        });
        notify(t('added'));
      }
      refresh();
      closeTransactionEditor();
    } catch {
      notify(t('saveError'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={editing ? t('editTitle') : t('addTitle')}
      description={t('draftDescription')}
      onClose={closeTransactionEditor}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={closeTransactionEditor}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!ready} form="transaction-form">
            {editing ? t('saveChanges') : t('addTitle')}
          </Button>
        </>
      }
    >
      {ready ? (
        <form
          id="transaction-form"
          ref={formRef}
          className="form-grid"
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <SegmentedControl
            label={t('kind')}
            value={form.kind}
            options={(['SPENDING', 'INCOME', 'INVESTMENT'] as const).map((kind) => ({
              value: kind,
              label: domain.kind(kind),
            }))}
            onChange={(kind) => {
              updateField('kind', kind);
              updateField('flow', kind === 'INCOME' ? 'CREDIT' : 'DEBIT');
              updateField('categoryId', '');
            }}
          />

          <div className="field field--wide">
            <label htmlFor="transaction-description">{t('description')}</label>
            <input
              id="transaction-description"
              value={form.description}
              maxLength={100}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? 'description-error' : undefined}
              onChange={(event) => updateField('description', event.target.value)}
            />
            {errors.description ? (
              <span id="description-error" className="field__error">
                {errors.description}
              </span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="transaction-amount">{t('amount')}</label>
            <div className="input-prefix">
              <span>{format.currencySymbol()}</span>
              <input
                id="transaction-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={form.amount}
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={errors.amount ? 'amount-error' : undefined}
                onChange={(event) => updateField('amount', event.target.value)}
              />
            </div>
            {errors.amount ? (
              <span id="amount-error" className="field__error">
                {errors.amount}
              </span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="transaction-date">{t('date')}</label>
            <input
              id="transaction-date"
              type="date"
              value={form.localDate}
              aria-invalid={Boolean(errors.localDate)}
              aria-describedby={errors.localDate ? 'date-error' : undefined}
              onChange={(event) => updateField('localDate', event.target.value)}
            />
            {errors.localDate ? (
              <span id="date-error" className="field__error">
                {errors.localDate}
              </span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="transaction-account">{t('account')}</label>
            <select
              id="transaction-account"
              value={form.accountId}
              aria-invalid={Boolean(errors.accountId)}
              aria-describedby={errors.accountId ? 'account-error' : undefined}
              onChange={(event) => updateField('accountId', event.target.value)}
            >
              <option value="">{t('chooseAccount')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            {errors.accountId ? (
              <span id="account-error" className="field__error">
                {errors.accountId}
              </span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="transaction-category">{t('category')}</label>
            <select
              id="transaction-category"
              value={form.categoryId}
              onChange={(event) => updateField('categoryId', event.target.value)}
            >
              <option value="">{t('uncategorised')}</option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <SegmentedControl
            label={t('flow')}
            value={form.flow}
            hint={t('flowHint')}
            options={[
              { value: 'DEBIT', label: domain.flow('DEBIT') },
              { value: 'CREDIT', label: domain.flow('CREDIT') },
            ]}
            onChange={(flow) => updateField('flow', flow)}
          />

          <div className="field field--wide">
            <label htmlFor="transaction-receipt">{t('receipt')}</label>
            <label className="file-input" htmlFor="transaction-receipt">
              {form.receipt ? <FileCheck2 aria-hidden="true" /> : <Paperclip aria-hidden="true" />}
              <span>
                <strong>{form.receipt?.name ?? editing?.receipt?.fileName ?? t('attachReceipt')}</strong>
                <small>{t('receiptFormats')}</small>
              </span>
            </label>
            <input
              id="transaction-receipt"
              className="visually-hidden"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              aria-invalid={Boolean(errors.receipt)}
              aria-describedby={errors.receipt ? 'receipt-error' : undefined}
              onChange={(event) => updateField('receipt', event.target.files?.[0] ?? null)}
            />
            {errors.receipt ? (
              <span id="receipt-error" className="field__error">
                {errors.receipt}
              </span>
            ) : null}
          </div>

          <div className="privacy-note field--wide">
            <ShieldCheck aria-hidden="true" size={18} />
            <span>{t('receiptPrivacy')}</span>
          </div>
        </form>
      ) : (
        <Skeleton lines={8} />
      )}
    </Modal>
  );
}
