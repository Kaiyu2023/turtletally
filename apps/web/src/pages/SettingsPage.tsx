import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CreditCard, FolderTree, Pencil, Plus, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useApp } from '../app/AppContext';
import type { Account, AccountType, Category, CategoryGroup } from '../data/types';
import { formatMoney, parseGbpInput, toGbpInput } from '../utils/format';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Skeleton } from '../components/Ui';
import './pages.css';

type AccountForm = { name: string; type: AccountType; openingBalance: string; colour: string };
type CategoryForm = { name: string; group: CategoryGroup; colour: string };
type Editor =
  | { readonly type: 'account'; readonly item: Account | null }
  | { readonly type: 'category'; readonly item: Category | null }
  | null;

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
  const { api, refreshToken, refresh, notify } = useApp();
  const [view, setView] = useState<'accounts' | 'categories'>('accounts');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>({
    name: '',
    type: 'CURRENT',
    openingBalance: '0.00',
    colour: '#4d908e',
  });
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({ name: '', group: 'Shopping', colour: '#76b7b2' });
  const [formError, setFormError] = useState('');
  const [deactivateItem, setDeactivateItem] = useState<Account | Category | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([api.listAccounts(true), api.listCategories(true)])
      .then(([nextAccounts, nextCategories]) => {
        if (!active) return;
        setAccounts(nextAccounts);
        setCategories(nextCategories);
      })
      .catch((reason: unknown) =>
        notify(reason instanceof Error ? reason.message : 'Settings could not be loaded.', 'error'),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, notify, refreshToken]);

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
  }

  function editCategory(category: Category | null) {
    setEditor({ type: 'category', item: category });
    setCategoryForm(
      category
        ? { name: category.name, group: category.group, colour: category.colour }
        : { name: '', group: 'Shopping', colour: '#76b7b2' },
    );
    setFormError('');
  }

  async function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    setFormError('');
    try {
      if (editor.type === 'account') {
        const balanceMinor =
          accountForm.openingBalance === '0' || accountForm.openingBalance === '0.00'
            ? 0
            : parseGbpInput(accountForm.openingBalance);
        if (!accountForm.name.trim() || balanceMinor === null)
          throw new Error('Enter an account name and a valid zero or positive balance.');
        if (editor.item) {
          await api.updateAccount(editor.item.id, {
            expectedVersion: editor.item.version,
            name: accountForm.name,
            type: accountForm.type,
            colour: accountForm.colour,
          });
          notify('Account updated. Historical transaction labels stay unchanged.');
        } else {
          await api.createAccount({
            name: accountForm.name,
            type: accountForm.type,
            balanceMinor,
            colour: accountForm.colour,
          });
          notify('Account added.');
        }
      } else if (editor.item) {
        await api.updateCategory(editor.item.id, {
          expectedVersion: editor.item.version,
          name: categoryForm.name,
          group: categoryForm.group,
          colour: categoryForm.colour,
        });
        notify('Category updated. Historical labels stay unchanged.');
      } else {
        await api.createCategory(categoryForm);
        notify('Category added.');
      }
      setEditor(null);
      refresh();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'The setting could not be saved.');
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
      notify(`${deactivateItem.name} deactivated.`);
      setDeactivateItem(null);
      refresh();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'The item could not be deactivated.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Your workspace"
        title="Settings"
        description="Keep accounts and categories tidy without changing the labels captured on historical transactions."
        actions={
          <Badge tone="positive">
            <ShieldCheck aria-hidden="true" size={14} />
            Single owner
          </Badge>
        }
      />
      <div className="settings-layout">
        <Card className="settings-nav">
          <button type="button" className={view === 'accounts' ? 'active' : ''} onClick={() => setView('accounts')}>
            <CreditCard aria-hidden="true" />
            <span>
              <strong>Accounts</strong>
              <small>Balances and account shells</small>
            </span>
          </button>
          <button type="button" className={view === 'categories' ? 'active' : ''} onClick={() => setView('categories')}>
            <FolderTree aria-hidden="true" />
            <span>
              <strong>Categories</strong>
              <small>Your editable taxonomy</small>
            </span>
          </button>
          <div className="owner-panel">
            <UserRoundCheck aria-hidden="true" />
            <div>
              <strong>Demo owner</strong>
              <span>Only one profile can sign in</span>
            </div>
          </div>
        </Card>

        {view === 'accounts' ? (
          <Card className="content-card">
            <div className="card__header">
              <div>
                <h2>Accounts</h2>
                <p>No full account or card numbers are stored.</p>
              </div>
              <Button variant="primary" onClick={() => editAccount(null)}>
                <Plus aria-hidden="true" size={17} />
                Add account
              </Button>
            </div>
            {loading ? (
              <Skeleton lines={5} />
            ) : accounts.length === 0 ? (
              <EmptyState title="No accounts" description="Add an account shell to begin." />
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
                        {account.deactivatedAt ? 'Inactive' : account.type.replace('_', ' ').toLowerCase()}
                      </Badge>
                      <h3>{account.name}</h3>
                      <strong>{formatMoney(account.balanceMinor)}</strong>
                      <small>Demo balance</small>
                    </div>
                    {account.deactivatedAt === null ? (
                      <div className="account-card__actions">
                        <Button variant="ghost" onClick={() => editAccount(account)}>
                          <Pencil aria-hidden="true" size={15} />
                          Edit
                        </Button>
                        <Button variant="ghost" onClick={() => setDeactivateItem(account)}>
                          Deactivate
                        </Button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <Card className="content-card">
            <div className="card__header">
              <div>
                <h2>Categories</h2>
                <p>Deactivation preserves every historical label.</p>
              </div>
              <Button variant="primary" onClick={() => editCategory(null)}>
                <Plus aria-hidden="true" size={17} />
                Add category
              </Button>
            </div>
            {loading ? (
              <Skeleton lines={8} />
            ) : categories.length === 0 ? (
              <EmptyState title="No categories" description="Add your first spending category." />
            ) : (
              <div className="category-groups">
                {groupedCategories.map(({ group, items }) => (
                  <section key={group}>
                    <h3>
                      {group}
                      <Badge>{items.filter((item) => !item.deactivatedAt).length}</Badge>
                    </h3>
                    <div>
                      {items.map((category) => (
                        <article className={category.deactivatedAt ? 'inactive' : ''} key={category.id}>
                          <span className="category-dot" style={{ background: category.colour }} />
                          <span>
                            <strong>{category.name}</strong>
                            {category.deactivatedAt ? <small>Inactive</small> : null}
                          </span>
                          {category.deactivatedAt === null ? (
                            <>
                              <button
                                className="icon-button"
                                type="button"
                                aria-label={`Edit ${category.name}`}
                                onClick={() => editCategory(category)}
                              >
                                <Pencil aria-hidden="true" size={16} />
                              </button>
                              <Button variant="ghost" onClick={() => setDeactivateItem(category)}>
                                Deactivate
                              </Button>
                            </>
                          ) : (
                            <Badge>Historical only</Badge>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <Modal
        open={editor !== null}
        title={editor?.item ? `Edit ${editor.item.name}` : `Add ${editor?.type ?? 'item'}`}
        description="Only an account or category shell is stored in this draft."
        size="small"
        onClose={() => setEditor(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button type="submit" form="settings-form" variant="primary" busy={busy}>
              Save
            </Button>
          </>
        }
      >
        <form id="settings-form" className="form-grid" onSubmit={(event) => void saveEditor(event)} noValidate>
          {formError ? (
            <div className="form-error field--wide" role="alert">
              {formError}
            </div>
          ) : null}
          {editor?.type === 'account' ? (
            <>
              <div className="field field--wide">
                <label htmlFor="account-name">Account name</label>
                <input
                  id="account-name"
                  value={accountForm.name}
                  onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="account-type">Type</label>
                <select
                  id="account-type"
                  value={accountForm.type}
                  onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value as AccountType })}
                >
                  <option value="CURRENT">Current</option>
                  <option value="CREDIT_CARD">Credit card</option>
                  <option value="SAVINGS">Savings</option>
                  <option value="INVESTMENT">Investment</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="account-balance">Opening demo balance</label>
                <div className="input-prefix">
                  <span>£</span>
                  <input
                    id="account-balance"
                    inputMode="decimal"
                    disabled={Boolean(editor.item)}
                    value={accountForm.openingBalance}
                    onChange={(event) => setAccountForm({ ...accountForm, openingBalance: event.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="account-colour">Colour</label>
                <input
                  id="account-colour"
                  type="color"
                  value={accountForm.colour}
                  onChange={(event) => setAccountForm({ ...accountForm, colour: event.target.value })}
                />
              </div>
            </>
          ) : (
            <>
              <div className="field field--wide">
                <label htmlFor="category-name">Category name</label>
                <input
                  id="category-name"
                  value={categoryForm.name}
                  onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="category-group">Group</label>
                <select
                  id="category-group"
                  value={categoryForm.group}
                  onChange={(event) => setCategoryForm({ ...categoryForm, group: event.target.value as CategoryGroup })}
                >
                  {categoryGroups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="category-colour">Colour</label>
                <input
                  id="category-colour"
                  type="color"
                  value={categoryForm.colour}
                  onChange={(event) => setCategoryForm({ ...categoryForm, colour: event.target.value })}
                />
              </div>
            </>
          )}
        </form>
      </Modal>

      <Modal
        open={deactivateItem !== null}
        title={`Deactivate ${deactivateItem?.name ?? 'item'}?`}
        description="Historical transactions keep their original label."
        size="small"
        onClose={() => setDeactivateItem(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeactivateItem(null)}>
              Cancel
            </Button>
            <Button variant="danger" busy={busy} onClick={() => void deactivate()}>
              Deactivate
            </Button>
          </>
        }
      >
        <p>This removes the item from new-entry choices without hard deleting it.</p>
      </Modal>
    </div>
  );
}
