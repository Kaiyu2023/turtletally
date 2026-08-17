import { useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { FileCheck2, Paperclip, ShieldCheck } from 'lucide-react';
import { useApp, type TransactionEditorState } from '../app/AppContext';
import type { Account, Category, LocalDate, Receipt, TransactionFlow, TransactionKind } from '../data/types';
import { parseGbpInput, toGbpInput } from '../utils/format';
import { Button, Modal, Skeleton } from './Ui';

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

export function TransactionEditor() {
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
                amount: toGbpInput(editing.amountMinor),
                accountId: editing.accountId,
                categoryId: editing.categoryId ?? '',
                kind: editing.kind,
                flow: editing.flow,
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
      .catch((reason: unknown) => {
        notify(reason instanceof Error ? reason.message : 'Transaction details could not be loaded.', 'error');
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
    if (!form.description.trim()) nextErrors.description = 'Enter a short description.';
    if (!amountMinor) nextErrors.amount = 'Enter a positive GBP amount with up to two decimal places.';
    if (!form.accountId) nextErrors.accountId = 'Choose an account.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.localDate)) nextErrors.localDate = 'Choose a valid date.';
    if (form.receipt && form.receipt.size > 10 * 1024 * 1024)
      nextErrors.receipt = 'Receipt files must be 10 MB or smaller.';
    if (form.receipt && !['application/pdf', 'image/jpeg', 'image/png'].includes(form.receipt.type))
      nextErrors.receipt = 'Use a PDF, JPEG, or PNG receipt.';

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
      const receipt: Receipt | null = form.receipt
        ? {
            id: `receipt-demo-${crypto.randomUUID()}`,
            fileName: form.receipt.name,
            mediaType: form.receipt.type as Receipt['mediaType'],
            sizeBytes: form.receipt.size,
          }
        : (editing?.receipt ?? null);

      if (editing) {
        await api.updateTransaction(editing.id, {
          expectedVersion: editing.version,
          description: form.description,
          amountMinor: valid.amountMinor,
          accountId: form.accountId,
          categoryId: form.categoryId || null,
          kind: form.kind,
          flow: form.flow,
          localDate: valid.localDate,
          receipt,
        });
        notify('Transaction updated.');
      } else {
        await api.createTransaction({
          description: form.description,
          amountMinor: valid.amountMinor,
          accountId: form.accountId,
          categoryId: form.categoryId || null,
          kind: form.kind,
          flow: form.flow,
          localDate: valid.localDate,
          receipt,
        });
        notify('Transaction added to the demo ledger.');
      }
      refresh();
      closeTransactionEditor();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The transaction could not be saved.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={editing ? 'Edit transaction' : 'Add transaction'}
      description="Demo changes stay in memory and reset when the page reloads."
      onClose={closeTransactionEditor}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={closeTransactionEditor}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!ready} form="transaction-form">
            {editing ? 'Save changes' : 'Add transaction'}
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
          <div className="field field--wide">
            <label id="kind-label">Transaction kind</label>
            <div className="segmented" role="group" aria-labelledby="kind-label">
              {(['SPENDING', 'INCOME', 'INVESTMENT'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={form.kind === kind}
                  onClick={() => {
                    updateField('kind', kind);
                    updateField('flow', kind === 'INCOME' ? 'CREDIT' : 'DEBIT');
                    updateField('categoryId', '');
                  }}
                >
                  {kind === 'SPENDING' ? 'Spending' : kind === 'INCOME' ? 'Income' : 'Investment'}
                </button>
              ))}
            </div>
          </div>

          <div className="field field--wide">
            <label htmlFor="transaction-description">Description</label>
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
            <label htmlFor="transaction-amount">Amount</label>
            <div className="input-prefix">
              <span>£</span>
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
            <label htmlFor="transaction-date">Date</label>
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
            <label htmlFor="transaction-account">Account</label>
            <select
              id="transaction-account"
              value={form.accountId}
              aria-invalid={Boolean(errors.accountId)}
              aria-describedby={errors.accountId ? 'account-error' : undefined}
              onChange={(event) => updateField('accountId', event.target.value)}
            >
              <option value="">Choose account</option>
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
            <label htmlFor="transaction-category">Category</label>
            <select
              id="transaction-category"
              value={form.categoryId}
              onChange={(event) => updateField('categoryId', event.target.value)}
            >
              <option value="">Uncategorised</option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field field--wide">
            <label id="flow-label">Money flow</label>
            <div className="segmented" role="group" aria-labelledby="flow-label">
              <button type="button" aria-pressed={form.flow === 'DEBIT'} onClick={() => updateField('flow', 'DEBIT')}>
                Debit
              </button>
              <button type="button" aria-pressed={form.flow === 'CREDIT'} onClick={() => updateField('flow', 'CREDIT')}>
                Credit
              </button>
            </div>
            <span className="field__hint">
              Kind describes purpose; flow describes whether money leaves or enters the account.
            </span>
          </div>

          <div className="field field--wide">
            <label htmlFor="transaction-receipt">Receipt</label>
            <label className="file-input" htmlFor="transaction-receipt">
              {form.receipt ? <FileCheck2 aria-hidden="true" /> : <Paperclip aria-hidden="true" />}
              <span>
                <strong>{form.receipt?.name ?? editing?.receipt?.fileName ?? 'Attach a receipt'}</strong>
                <small>PDF, JPEG, or PNG · up to 10 MB</small>
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
            <span>This draft does not upload the selected file or store it after refresh.</span>
          </div>
        </form>
      ) : (
        <Skeleton lines={8} />
      )}
    </Modal>
  );
}
