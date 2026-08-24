import { useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Badge, PageHeader } from '../../components/Ui';
import { useApp } from '../../app/AppContext';
import type { Account, AppLocale, Category, CategoryGroup } from '../../data/types';
import { message, useMessages } from '../../i18n/locale';
import { parseGbpInput, toGbpInput } from '../../utils/format';
import {
  AccountsPanel,
  CategoriesPanel,
  DeactivateItemModal,
  PreferencesPanel,
  SettingsEditorModal,
  SettingsNavigation,
  type AccountForm,
  type CategoryForm,
  type SettingsEditor,
  type SettingsView,
} from './components';
import { settingsMessages } from './messages';
import './styles.css';

const categoryGroups: readonly CategoryGroup[] = [
  'Shopping',
  'Rent',
  'Utilities',
  'Services',
  'Tax',
  'Transport',
  'Income',
  'Investment',
];

export function SettingsPage() {
  const { api, refreshToken, refresh, notify, preferences, preferencesLoading, updateLocale } = useApp();
  const t = useMessages(settingsMessages);
  const [view, setView] = useState<SettingsView>('accounts');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<SettingsEditor>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>({
    name: '',
    type: 'CURRENT',
    openingBalance: '0.00',
    colour: '#4d908e',
  });
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({
    name: '',
    group: 'Shopping',
    colour: '#76b7b2',
  });
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; openingBalance?: string }>({});
  const [deactivateItem, setDeactivateItem] = useState<Account | Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [preferencesBusy, setPreferencesBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([api.listAccounts(true), api.listCategories(true)])
      .then(([nextAccounts, nextCategories]) => {
        if (!active) return;
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
  }, [api, notify, refreshToken, t]);

  const groupedCategories = useMemo(
    () => categoryGroups.map((group) => ({ group, items: categories.filter((category) => category.group === group) })),
    [categories],
  );

  function editAccount(account: Account | null) {
    setEditor({ type: 'account', item: account });
    setAccountForm(
      account
        ? {
            name: account.name,
            type: account.type,
            openingBalance: toGbpInput(account.balanceMinor),
            colour: account.colour,
          }
        : { name: '', type: 'CURRENT', openingBalance: '0.00', colour: '#4d908e' },
    );
    setFormError('');
    setFieldErrors({});
  }

  function editCategory(category: Category | null) {
    setEditor({ type: 'category', item: category });
    setCategoryForm(
      category
        ? { name: category.name, group: category.group, colour: category.colour }
        : { name: '', group: 'Shopping', colour: '#76b7b2' },
    );
    setFormError('');
    setFieldErrors({});
  }

  async function saveEditor(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    setFormError('');
    setFieldErrors({});
    try {
      if (editor.type === 'account') {
        if (!accountForm.name.trim()) {
          setFormError(t('invalidAccount'));
          setFieldErrors({ name: t('invalidAccount') });
          return;
        }
        if (editor.item) {
          await api.updateAccount(editor.item.id, {
            expectedVersion: editor.item.version,
            name: accountForm.name,
            type: accountForm.type,
            colour: accountForm.colour,
          });
          notify(t('accountUpdated'));
        } else {
          const openingBalanceMinor =
            accountForm.openingBalance === '0' || accountForm.openingBalance === '0.00'
              ? 0
              : parseGbpInput(accountForm.openingBalance);
          if (openingBalanceMinor === null) {
            setFormError(t('invalidAccount'));
            setFieldErrors({ openingBalance: t('invalidAccount') });
            return;
          }
          await api.createAccount({
            name: accountForm.name,
            type: accountForm.type,
            openingBalanceMinor,
            colour: accountForm.colour,
          });
          notify(t('accountAdded'));
        }
      } else if (editor.item) {
        await api.updateCategory(editor.item.id, {
          expectedVersion: editor.item.version,
          name: categoryForm.name,
          group: categoryForm.group,
          colour: categoryForm.colour,
        });
        notify(t('categoryUpdated'));
      } else {
        await api.createCategory(categoryForm);
        notify(t('categoryAdded'));
      }
      setEditor(null);
      refresh();
    } catch {
      setFormError(t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!deactivateItem) return;
    setBusy(true);
    try {
      if ('balanceMinor' in deactivateItem) {
        await api.deactivateAccount(deactivateItem.id, deactivateItem.version);
      } else {
        await api.deactivateCategory(deactivateItem.id, deactivateItem.version);
      }
      notify(t('deactivatedNotice', { name: deactivateItem.name }));
      setDeactivateItem(null);
      refresh();
    } catch {
      notify(t('deactivateError'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changeLocale(locale: AppLocale) {
    if (locale === preferences.locale) return;
    setPreferencesBusy(true);
    try {
      await updateLocale(locale);
      notify(message(locale, settingsMessages, 'preferencesSaved'));
    } catch {
      notify(t('preferencesSaveError'), 'error');
    } finally {
      setPreferencesBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('pageDescription')}
        actions={
          <Badge tone="positive">
            <ShieldCheck aria-hidden="true" size={14} />
            {t('singleOwner')}
          </Badge>
        }
      />
      <div className="settings-layout">
        <SettingsNavigation view={view} onViewChange={setView} />
        {view === 'accounts' ? (
          <AccountsPanel
            loading={loading}
            accounts={accounts}
            onAdd={() => editAccount(null)}
            onEdit={editAccount}
            onDeactivate={setDeactivateItem}
          />
        ) : view === 'categories' ? (
          <CategoriesPanel
            loading={loading}
            sections={groupedCategories}
            onAdd={() => editCategory(null)}
            onEdit={editCategory}
            onDeactivate={setDeactivateItem}
          />
        ) : (
          <PreferencesPanel
            locale={preferences.locale}
            loading={preferencesLoading}
            busy={preferencesBusy}
            onLocaleChange={(locale) => void changeLocale(locale)}
          />
        )}
      </div>

      <SettingsEditorModal
        editor={editor}
        accountForm={accountForm}
        categoryForm={categoryForm}
        categoryGroups={categoryGroups}
        formError={formError}
        fieldErrors={fieldErrors}
        busy={busy}
        onAccountFormChange={setAccountForm}
        onCategoryFormChange={setCategoryForm}
        onSubmit={(event) => void saveEditor(event)}
        onClose={() => setEditor(null)}
      />
      <DeactivateItemModal
        item={deactivateItem}
        busy={busy}
        onClose={() => setDeactivateItem(null)}
        onDeactivate={() => void deactivate()}
      />
    </div>
  );
}
