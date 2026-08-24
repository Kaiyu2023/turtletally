import { CreditCard, FolderTree, Languages, Pencil, Plus, UserRoundCheck } from 'lucide-react';
import type { SubmitEventHandler } from 'react';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, Modal, Skeleton } from '../../components/Ui';
import type { Account, AccountType, AppLocale, Category, CategoryGroup } from '../../data/types';
import { useLocale, useMessages } from '../../i18n/locale';
import { settingsMessages } from './messages';

export type AccountForm = { name: string; type: AccountType; openingBalance: string; colour: string };
export type CategoryForm = { name: string; group: CategoryGroup; colour: string };
export type SettingsEditor =
  | { readonly type: 'account'; readonly item: Account | null }
  | { readonly type: 'category'; readonly item: Category | null }
  | null;
export type SettingsView = 'accounts' | 'categories' | 'preferences';
export type CategorySection = { readonly group: CategoryGroup; readonly items: readonly Category[] };

type SettingsNavigationProps = {
  readonly view: SettingsView;
  readonly onViewChange: (view: SettingsView) => void;
};

export function SettingsNavigation({ view, onViewChange }: SettingsNavigationProps) {
  const t = useMessages(settingsMessages);

  return (
    <Card className="settings-nav">
      <button
        type="button"
        className={view === 'accounts' ? 'active' : ''}
        aria-pressed={view === 'accounts'}
        onClick={() => onViewChange('accounts')}
      >
        <CreditCard aria-hidden="true" />
        <span>
          <strong>{t('accounts')}</strong>
          <small>{t('accountsNavigationDescription')}</small>
        </span>
      </button>
      <button
        type="button"
        className={view === 'categories' ? 'active' : ''}
        aria-pressed={view === 'categories'}
        onClick={() => onViewChange('categories')}
      >
        <FolderTree aria-hidden="true" />
        <span>
          <strong>{t('categories')}</strong>
          <small>{t('categoriesNavigationDescription')}</small>
        </span>
      </button>
      <button
        type="button"
        className={view === 'preferences' ? 'active' : ''}
        aria-pressed={view === 'preferences'}
        onClick={() => onViewChange('preferences')}
      >
        <Languages aria-hidden="true" />
        <span>
          <strong>{t('preferences')}</strong>
          <small>{t('preferencesNavigationDescription')}</small>
        </span>
      </button>
      <div className="owner-panel">
        <UserRoundCheck aria-hidden="true" />
        <div>
          <strong>{t('demoOwner')}</strong>
          <span>{t('oneProfile')}</span>
        </div>
      </div>
    </Card>
  );
}

type AccountsPanelProps = {
  readonly loading: boolean;
  readonly accounts: readonly Account[];
  readonly onAdd: () => void;
  readonly onEdit: (account: Account) => void;
  readonly onDeactivate: (account: Account) => void;
};

export function AccountsPanel({ loading, accounts, onAdd, onEdit, onDeactivate }: AccountsPanelProps) {
  const { format } = useLocale();
  const t = useMessages(settingsMessages);
  const accountTypes: Readonly<Record<AccountType, string>> = {
    CURRENT: t('currentAccount'),
    CREDIT_CARD: t('creditCardAccount'),
    SAVINGS: t('savingsAccount'),
    INVESTMENT: t('investmentAccount'),
  };

  return (
    <Card className="content-card">
      <CardHeader
        title={t('accounts')}
        description={t('accountsDescription')}
        action={
          <Button variant="primary" onClick={onAdd}>
            <Plus aria-hidden="true" size={17} />
            {t('addAccount')}
          </Button>
        }
      />
      {loading ? (
        <Skeleton lines={5} />
      ) : accounts.length === 0 ? (
        <EmptyState title={t('noAccounts')} description={t('noAccountsDescription')} />
      ) : (
        <div className="account-grid">
          {accounts.map((account) => (
            <article
              className={`account-card ${account.deactivatedAt ? 'account-card--inactive' : ''}`}
              key={account.id}
            >
              <span className="account-card__colour" style={{ background: account.colour }} />
              <div>
                <Badge tone={account.deactivatedAt ? 'neutral' : 'positive'}>
                  {account.deactivatedAt ? t('inactive') : accountTypes[account.type]}
                </Badge>
                <h3>{account.name}</h3>
                <strong>{format.money(account.balanceMinor)}</strong>
                <small>{t('demoBalance')}</small>
              </div>
              {account.deactivatedAt === null ? (
                <div className="account-card__actions">
                  <Button variant="ghost" onClick={() => onEdit(account)}>
                    <Pencil aria-hidden="true" size={15} />
                    {t('edit')}
                  </Button>
                  <Button variant="ghost" onClick={() => onDeactivate(account)}>
                    {t('deactivate')}
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

type CategoriesPanelProps = {
  readonly loading: boolean;
  readonly sections: readonly CategorySection[];
  readonly onAdd: () => void;
  readonly onEdit: (category: Category) => void;
  readonly onDeactivate: (category: Category) => void;
};

export function CategoriesPanel({ loading, sections, onAdd, onEdit, onDeactivate }: CategoriesPanelProps) {
  const { format } = useLocale();
  const t = useMessages(settingsMessages);
  const categoryCount = sections.reduce((total, section) => total + section.items.length, 0);
  const groupLabels: Readonly<Record<CategoryGroup, string>> = {
    Shopping: t('groupShopping'),
    Rent: t('groupRent'),
    Utilities: t('groupUtilities'),
    Services: t('groupServices'),
    Tax: t('groupTax'),
    Transport: t('groupTransport'),
    Income: t('groupIncome'),
    Investment: t('groupInvestment'),
  };

  return (
    <Card className="content-card">
      <CardHeader
        title={t('categories')}
        description={t('categoriesDescription')}
        action={
          <Button variant="primary" onClick={onAdd}>
            <Plus aria-hidden="true" size={17} />
            {t('addCategory')}
          </Button>
        }
      />
      {loading ? (
        <Skeleton lines={8} />
      ) : categoryCount === 0 ? (
        <EmptyState title={t('noCategories')} description={t('noCategoriesDescription')} />
      ) : (
        <div className="category-groups">
          {sections.map(({ group, items }) => (
            <section key={group}>
              <h3>
                {groupLabels[group]}
                <Badge>{format.number(items.filter((item) => !item.deactivatedAt).length)}</Badge>
              </h3>
              <div>
                {items.map((category) => (
                  <article className={category.deactivatedAt ? 'inactive' : ''} key={category.id}>
                    <span className="category-dot" style={{ background: category.colour }} />
                    <span>
                      <strong>{category.name}</strong>
                      {category.deactivatedAt ? <small>{t('inactive')}</small> : null}
                    </span>
                    {category.deactivatedAt === null ? (
                      <>
                        <IconButton
                          aria-label={t('editNamed', { name: category.name })}
                          onClick={() => onEdit(category)}
                        >
                          <Pencil aria-hidden="true" size={16} />
                        </IconButton>
                        <Button variant="ghost" onClick={() => onDeactivate(category)}>
                          {t('deactivate')}
                        </Button>
                      </>
                    ) : (
                      <Badge>{t('historicalOnly')}</Badge>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

type PreferencesPanelProps = {
  readonly locale: AppLocale;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly onLocaleChange: (locale: AppLocale) => void;
};

export function PreferencesPanel({ locale, loading, busy, onLocaleChange }: PreferencesPanelProps) {
  const t = useMessages(settingsMessages);

  return (
    <Card className="content-card">
      <CardHeader title={t('language')} description={t('languageDescription')} />
      <div className="field settings-preferences__field" aria-busy={loading || busy}>
        <label htmlFor="display-language">{t('displayLanguage')}</label>
        <select
          id="display-language"
          value={locale}
          disabled={loading || busy}
          aria-describedby="display-language-note"
          onChange={(event) => onLocaleChange(event.target.value as AppLocale)}
        >
          <option value="en-GB" lang="en-GB">
            {t('englishUk')}
          </option>
          <option value="zh-CN" lang="zh-CN">
            {t('simplifiedChinese')}
          </option>
        </select>
        <small id="display-language-note">{t('languageProfileNote')}</small>
      </div>
    </Card>
  );
}

type SettingsEditorModalProps = {
  readonly editor: SettingsEditor;
  readonly accountForm: AccountForm;
  readonly categoryForm: CategoryForm;
  readonly categoryGroups: readonly CategoryGroup[];
  readonly formError: string;
  readonly busy: boolean;
  readonly onAccountFormChange: (form: AccountForm) => void;
  readonly onCategoryFormChange: (form: CategoryForm) => void;
  readonly onSubmit: SubmitEventHandler<HTMLFormElement>;
  readonly onClose: () => void;
};

export function SettingsEditorModal({
  editor,
  accountForm,
  categoryForm,
  categoryGroups,
  formError,
  busy,
  onAccountFormChange,
  onCategoryFormChange,
  onSubmit,
  onClose,
}: SettingsEditorModalProps) {
  const t = useMessages(settingsMessages);
  const groupLabels: Readonly<Record<CategoryGroup, string>> = {
    Shopping: t('groupShopping'),
    Rent: t('groupRent'),
    Utilities: t('groupUtilities'),
    Services: t('groupServices'),
    Tax: t('groupTax'),
    Transport: t('groupTransport'),
    Income: t('groupIncome'),
    Investment: t('groupInvestment'),
  };

  return (
    <Modal
      open={editor !== null}
      title={
        editor?.item
          ? t('editNamedItem', { name: editor.item.name })
          : editor?.type === 'account'
            ? t('addAccountTitle')
            : editor?.type === 'category'
              ? t('addCategoryTitle')
              : t('addItemTitle')
      }
      description={t('editorDescription')}
      size="small"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form="settings-form" variant="primary" busy={busy}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form id="settings-form" className="form-grid" onSubmit={onSubmit} noValidate>
        {formError ? (
          <div className="form-error field--wide" role="alert">
            {formError}
          </div>
        ) : null}
        {editor?.type === 'account' ? (
          <>
            <div className="field field--wide">
              <label htmlFor="account-name">{t('accountName')}</label>
              <input
                id="account-name"
                value={accountForm.name}
                onChange={(event) => onAccountFormChange({ ...accountForm, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="account-type">{t('type')}</label>
              <select
                id="account-type"
                value={accountForm.type}
                onChange={(event) => onAccountFormChange({ ...accountForm, type: event.target.value as AccountType })}
              >
                <option value="CURRENT">{t('current')}</option>
                <option value="CREDIT_CARD">{t('creditCard')}</option>
                <option value="SAVINGS">{t('savings')}</option>
                <option value="INVESTMENT">{t('investment')}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="account-balance">{editor.item ? t('currentBalance') : t('openingBalance')}</label>
              <div className="input-prefix">
                <span>£</span>
                <input
                  id="account-balance"
                  inputMode="decimal"
                  disabled={Boolean(editor.item)}
                  value={accountForm.openingBalance}
                  onChange={(event) => onAccountFormChange({ ...accountForm, openingBalance: event.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="account-colour">{t('colour')}</label>
              <input
                id="account-colour"
                type="color"
                value={accountForm.colour}
                onChange={(event) => onAccountFormChange({ ...accountForm, colour: event.target.value })}
              />
            </div>
          </>
        ) : (
          <>
            <div className="field field--wide">
              <label htmlFor="category-name">{t('categoryName')}</label>
              <input
                id="category-name"
                value={categoryForm.name}
                onChange={(event) => onCategoryFormChange({ ...categoryForm, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="category-group">{t('group')}</label>
              <select
                id="category-group"
                value={categoryForm.group}
                onChange={(event) =>
                  onCategoryFormChange({ ...categoryForm, group: event.target.value as CategoryGroup })
                }
              >
                {categoryGroups.map((group) => (
                  <option key={group} value={group}>
                    {groupLabels[group]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="category-colour">{t('colour')}</label>
              <input
                id="category-colour"
                type="color"
                value={categoryForm.colour}
                onChange={(event) => onCategoryFormChange({ ...categoryForm, colour: event.target.value })}
              />
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}

type DeactivateItemModalProps = {
  readonly item: Account | Category | null;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onDeactivate: () => void;
};

export function DeactivateItemModal({ item, busy, onClose, onDeactivate }: DeactivateItemModalProps) {
  const t = useMessages(settingsMessages);

  return (
    <Modal
      open={item !== null}
      title={item ? t('deactivateNamed', { name: item.name }) : t('deactivateItem')}
      description={t('deactivateDescription')}
      size="small"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="danger" busy={busy} onClick={onDeactivate}>
            {t('deactivate')}
          </Button>
        </>
      }
    >
      <p>{t('deactivateBody')}</p>
    </Modal>
  );
}
