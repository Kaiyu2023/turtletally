import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Bot,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Hand,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Upload,
  WalletCards,
} from 'lucide-react';
import { Badge, Button, Card, EmptyState, Money, PageHeader, Skeleton } from '../components/Ui';
import type {
  Account,
  Category,
  LocalDate,
  Month,
  Transaction,
  TransactionFilters,
  TransactionFlow,
  TransactionKind,
  TransactionOrigin,
  TransactionPage,
  TransactionSort,
  TransactionStatus,
} from '../data/types';
import { formatDate, joinClassNames } from '../utils/format';
import './transactions.css';

type TransactionsPageProps = {
  readonly page: TransactionPage | null;
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly filters: TransactionFilters;
  readonly loading: boolean;
  readonly onFiltersChange: (filters: TransactionFilters) => void;
  readonly onAdd: () => void;
  readonly onEdit: (transaction: Transaction) => void;
  readonly onVoid: (transaction: Transaction) => void;
};

const statuses: ReadonlyArray<{ value: TransactionStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'VOIDED', label: 'Voided' },
  { value: 'ALL', label: 'All' },
];

const kinds: ReadonlyArray<{ value: TransactionKind; label: string }> = [
  { value: 'INCOME', label: 'Income' },
  { value: 'SPENDING', label: 'Spending' },
  { value: 'INVESTMENT', label: 'Investment' },
];

const flows: ReadonlyArray<{ value: TransactionFlow; label: string }> = [
  { value: 'CREDIT', label: 'Credit' },
  { value: 'DEBIT', label: 'Debit' },
];

const origins: ReadonlyArray<{ value: TransactionOrigin; label: string }> = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'IMPORT', label: 'Import' },
  { value: 'SCHEDULE', label: 'Schedule' },
  { value: 'ASSISTANT', label: 'Assistant' },
];

const sorts: ReadonlyArray<{ value: TransactionSort; label: string }> = [
  { value: 'NEWEST', label: 'Newest first' },
  { value: 'OLDEST', label: 'Oldest first' },
  { value: 'AMOUNT_HIGH', label: 'Highest amount' },
  { value: 'AMOUNT_LOW', label: 'Lowest amount' },
];

const pageSizes = [10, 20, 50] as const;

function OriginBadge({ origin }: { readonly origin: TransactionOrigin }) {
  switch (origin) {
    case 'MANUAL':
      return (
        <Badge>
          <Hand aria-hidden="true" size={12} />
          Manual
        </Badge>
      );
    case 'IMPORT':
      return (
        <Badge tone="info">
          <Upload aria-hidden="true" size={12} />
          Import
        </Badge>
      );
    case 'SCHEDULE':
      return (
        <Badge tone="warning">
          <CalendarClock aria-hidden="true" size={12} />
          Schedule
        </Badge>
      );
    case 'ASSISTANT':
      return (
        <Badge tone="positive">
          <Bot aria-hidden="true" size={12} />
          Assistant
        </Badge>
      );
  }
}

function KindBadge({ kind }: { readonly kind: TransactionKind }) {
  switch (kind) {
    case 'INCOME':
      return <Badge tone="positive">Income</Badge>;
    case 'SPENDING':
      return <Badge tone="negative">Spending</Badge>;
    case 'INVESTMENT':
      return <Badge tone="info">Investment</Badge>;
  }
}

function FlowLabel({ flow }: { readonly flow: TransactionFlow }) {
  const Icon = flow === 'CREDIT' ? ArrowDownLeft : ArrowUpRight;
  return (
    <span className={joinClassNames('transaction-flow', flow === 'CREDIT' ? 'positive' : 'negative')}>
      <Icon aria-hidden="true" size={14} />
      {flow === 'CREDIT' ? 'Credit' : 'Debit'}
    </span>
  );
}

function ReceiptIndicator({ transaction }: { readonly transaction: Transaction }) {
  if (!transaction.receipt) {
    return null;
  }

  return (
    <span className="transaction-receipt" role="img" aria-label="Receipt attached" title="Receipt attached">
      <Paperclip aria-hidden="true" size={14} />
      <span>Receipt</span>
    </span>
  );
}

type TransactionActionsProps = {
  readonly transaction: Transaction;
  readonly onEdit: (transaction: Transaction) => void;
  readonly onVoid: (transaction: Transaction) => void;
};

function TransactionActions({ transaction, onEdit, onVoid }: TransactionActionsProps) {
  if (transaction.voidedAt) {
    return <Badge tone="negative">Voided</Badge>;
  }

  return (
    <div className="transaction-actions">
      <button
        className="icon-button transaction-action"
        type="button"
        aria-label={`Edit ${transaction.description}`}
        title="Edit transaction"
        onClick={() => onEdit(transaction)}
      >
        <Pencil aria-hidden="true" size={16} />
      </button>
      <button
        className="icon-button transaction-action transaction-action--void"
        type="button"
        aria-label={`Void ${transaction.description}`}
        title="Void transaction"
        onClick={() => onVoid(transaction)}
      >
        <Ban aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

function hasActiveFilters(filters: TransactionFilters): boolean {
  return Boolean(
    filters.month ||
    filters.from ||
    filters.to ||
    filters.accountId ||
    filters.categoryId ||
    filters.kind ||
    filters.flow ||
    filters.origin ||
    filters.search?.trim() ||
    (filters.status && filters.status !== 'ACTIVE') ||
    (filters.sort && filters.sort !== 'NEWEST'),
  );
}

function filterCount(filters: TransactionFilters): number {
  return [
    filters.month,
    filters.from,
    filters.to,
    filters.accountId,
    filters.categoryId,
    filters.kind,
    filters.flow,
    filters.origin,
    filters.search?.trim(),
    filters.status && filters.status !== 'ACTIVE' ? filters.status : undefined,
    filters.sort && filters.sort !== 'NEWEST' ? filters.sort : undefined,
  ].filter(Boolean).length;
}

function transactionAmount(transaction: Transaction): number {
  return transaction.flow === 'CREDIT' ? transaction.amountMinor : -transaction.amountMinor;
}

export function TransactionsPage({
  page,
  accounts,
  categories,
  filters,
  loading,
  onFiltersChange,
  onAdd,
  onEdit,
  onVoid,
}: TransactionsPageProps) {
  const selectedStatus = filters.status ?? 'ACTIVE';
  const activeFilterCount = filterCount(filters);
  const activeAccounts = accounts.filter((account) => account.deactivatedAt === null);
  const activeCategories = categories.filter((category) => category.deactivatedAt === null);

  function setFilter<Key extends keyof TransactionFilters>(key: Key, value: TransactionFilters[Key] | '') {
    const next: TransactionFilters = { ...filters, page: 1 };

    if (value === '') {
      delete next[key];
    } else {
      next[key] = value;
    }

    onFiltersChange(next);
  }

  function setMonth(value: string) {
    const next = { ...filters, page: 1 };
    delete next.from;
    delete next.to;

    if (value) {
      next.month = value as Month;
    } else {
      delete next.month;
    }

    onFiltersChange(next);
  }

  function setDate(key: 'from' | 'to', value: string) {
    const next = { ...filters, page: 1 };
    delete next.month;

    if (value) {
      next[key] = value as LocalDate;
    } else {
      delete next[key];
    }

    onFiltersChange(next);
  }

  function resetFilters() {
    onFiltersChange({
      page: 1,
      pageSize: filters.pageSize ?? 10,
      sort: 'NEWEST',
      status: 'ACTIVE',
    });
  }

  function changePage(nextPage: number) {
    if (!page) {
      return;
    }

    onFiltersChange({
      ...filters,
      page: Math.min(Math.max(nextPage, 1), page.totalPages),
      pageSize: page.pageSize,
    });
  }

  return (
    <div className="transactions-page">
      <PageHeader
        eyebrow="Ledger"
        title="Transactions"
        description="Review every movement, trace how it arrived, and safely void mistakes without erasing history."
        actions={
          <Button variant="primary" onClick={onAdd}>
            <Plus aria-hidden="true" size={18} />
            Add transaction
          </Button>
        }
      />

      <Card className="transaction-filters">
        <div className="transaction-filters__heading">
          <div>
            <h2>Find transactions</h2>
            <p>Choose a month or a custom date range, then narrow the results.</p>
          </div>
          <Button variant="ghost" disabled={activeFilterCount === 0} onClick={resetFilters}>
            <RotateCcw aria-hidden="true" size={16} />
            Reset{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
        </div>

        <div className="transaction-filters__primary">
          <label className="filter-field filter-field--search">
            <span>Search</span>
            <span className="transaction-search">
              <Search aria-hidden="true" size={18} />
              <input
                type="search"
                value={filters.search ?? ''}
                maxLength={80}
                placeholder="Description, account or category"
                aria-controls="transaction-results"
                onChange={(event) => setFilter('search', event.target.value)}
              />
            </span>
          </label>

          <label className="filter-field">
            <span>Month</span>
            <input
              type="month"
              min="2000-01"
              max="2100-12"
              value={filters.month ?? ''}
              aria-controls="transaction-results"
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>

          <label className="filter-field">
            <span>Sort by</span>
            <select
              value={filters.sort ?? 'NEWEST'}
              aria-controls="transaction-results"
              onChange={(event) => setFilter('sort', event.target.value as TransactionSort)}
            >
              {sorts.map((sort) => (
                <option key={sort.value} value={sort.value}>
                  {sort.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="transaction-filters__secondary">
          <label className="filter-field">
            <span>From</span>
            <input
              type="date"
              min="2000-01-01"
              max={filters.to ?? '2100-12-31'}
              value={filters.from ?? ''}
              aria-controls="transaction-results"
              onChange={(event) => setDate('from', event.target.value)}
            />
          </label>

          <label className="filter-field">
            <span>To</span>
            <input
              type="date"
              min={filters.from ?? '2000-01-01'}
              max="2100-12-31"
              value={filters.to ?? ''}
              aria-controls="transaction-results"
              onChange={(event) => setDate('to', event.target.value)}
            />
          </label>

          <label className="filter-field">
            <span>Account</span>
            <select
              value={filters.accountId ?? ''}
              aria-controls="transaction-results"
              onChange={(event) => setFilter('accountId', event.target.value)}
            >
              <option value="">All accounts</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Category</span>
            <select
              value={filters.categoryId ?? ''}
              aria-controls="transaction-results"
              onChange={(event) => setFilter('categoryId', event.target.value)}
            >
              <option value="">All categories</option>
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.group} · {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Kind</span>
            <select
              value={filters.kind ?? ''}
              aria-controls="transaction-results"
              onChange={(event) => setFilter('kind', event.target.value as TransactionKind | '')}
            >
              <option value="">All kinds</option>
              {kinds.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Flow</span>
            <select
              value={filters.flow ?? ''}
              aria-controls="transaction-results"
              onChange={(event) => setFilter('flow', event.target.value as TransactionFlow | '')}
            >
              <option value="">Credits and debits</option>
              {flows.map((flow) => (
                <option key={flow.value} value={flow.value}>
                  {flow.label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Origin</span>
            <select
              value={filters.origin ?? ''}
              aria-controls="transaction-results"
              onChange={(event) => setFilter('origin', event.target.value as TransactionOrigin | '')}
            >
              <option value="">All origins</option>
              {origins.map((origin) => (
                <option key={origin.value} value={origin.value}>
                  {origin.label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Per page</span>
            <select
              value={filters.pageSize ?? 10}
              aria-controls="transaction-results"
              onChange={(event) => setFilter('pageSize', Number(event.target.value))}
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size} rows
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="transaction-status">
          <legend>Status</legend>
          <div className="segmented">
            {statuses.map((status) => (
              <button
                key={status.value}
                type="button"
                aria-pressed={selectedStatus === status.value}
                aria-controls="transaction-results"
                onClick={() => setFilter('status', status.value)}
              >
                {status.label}
              </button>
            ))}
          </div>
        </fieldset>
      </Card>

      <section id="transaction-results" aria-busy={loading} aria-live="polite">
        {loading ? (
          <Card className="transaction-results transaction-results--loading">
            <Skeleton lines={8} />
          </Card>
        ) : null}

        {!loading && (!page || page.items.length === 0) ? (
          <Card className="transaction-results">
            <EmptyState
              icon={<WalletCards aria-hidden="true" size={27} />}
              title={hasActiveFilters(filters) ? 'No transactions match' : 'No transactions yet'}
              description={
                hasActiveFilters(filters)
                  ? 'Try changing or resetting the filters to widen your search.'
                  : 'Add your first transaction to begin your private ledger.'
              }
              action={
                hasActiveFilters(filters) ? (
                  <Button onClick={resetFilters}>
                    <RotateCcw aria-hidden="true" size={16} />
                    Reset filters
                  </Button>
                ) : (
                  <Button variant="primary" onClick={onAdd}>
                    <Plus aria-hidden="true" size={16} />
                    Add transaction
                  </Button>
                )
              }
            />
          </Card>
        ) : null}

        {!loading && page && page.items.length > 0 ? (
          <Card className="transaction-results page-enter">
            <header className="transaction-results__header">
              <div>
                <h2>Ledger entries</h2>
                <p>
                  {page.totalItems} {page.totalItems === 1 ? 'transaction' : 'transactions'} found
                </p>
              </div>
              <span className="transaction-results__range">
                {(page.page - 1) * page.pageSize + 1}–{Math.min(page.page * page.pageSize, page.totalItems)} of{' '}
                {page.totalItems}
              </span>
            </header>

            <div className="table-wrap transaction-table-wrap">
              <table className="data-table transaction-table">
                <caption className="transactions-sr-only">Filtered transactions</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Transaction</th>
                    <th scope="col">Account</th>
                    <th scope="col">Kind &amp; origin</th>
                    <th scope="col" className="align-right">
                      Amount
                    </th>
                    <th scope="col" className="align-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className={joinClassNames(transaction.voidedAt && 'transaction-row--voided')}
                    >
                      <td>
                        <time className="transaction-date" dateTime={transaction.localDate}>
                          {formatDate(transaction.localDate)}
                        </time>
                      </td>
                      <td>
                        <div className="transaction-description">
                          <span
                            className="transaction-category-dot"
                            style={{
                              background:
                                activeCategories.find((category) => category.id === transaction.categoryId)?.colour ??
                                'var(--text-faint)',
                            }}
                            aria-hidden="true"
                          />
                          <span>
                            <strong>{transaction.description}</strong>
                            <small>{transaction.categoryName ?? 'Uncategorised'}</small>
                          </span>
                          <ReceiptIndicator transaction={transaction} />
                        </div>
                      </td>
                      <td>
                        <span className="transaction-account">{transaction.accountName}</span>
                      </td>
                      <td>
                        <div className="transaction-classification">
                          <KindBadge kind={transaction.kind} />
                          <FlowLabel flow={transaction.flow} />
                          <OriginBadge origin={transaction.origin} />
                        </div>
                      </td>
                      <td className="align-right">
                        <Money
                          amountMinor={transactionAmount(transaction)}
                          signed
                          className={joinClassNames(
                            'transaction-amount',
                            transaction.flow === 'CREDIT' ? 'positive' : 'negative',
                          )}
                        />
                      </td>
                      <td className="align-right">
                        <TransactionActions transaction={transaction} onEdit={onEdit} onVoid={onVoid} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="transaction-cards">
              {page.items.map((transaction) => (
                <article
                  key={transaction.id}
                  className={joinClassNames('transaction-card', transaction.voidedAt && 'transaction-card--voided')}
                >
                  <header>
                    <div className="transaction-description">
                      <span
                        className="transaction-category-dot"
                        style={{
                          background:
                            activeCategories.find((category) => category.id === transaction.categoryId)?.colour ??
                            'var(--text-faint)',
                        }}
                        aria-hidden="true"
                      />
                      <span>
                        <strong>{transaction.description}</strong>
                        <small>{transaction.categoryName ?? 'Uncategorised'}</small>
                      </span>
                    </div>
                    <Money
                      amountMinor={transactionAmount(transaction)}
                      signed
                      className={joinClassNames(
                        'transaction-amount',
                        transaction.flow === 'CREDIT' ? 'positive' : 'negative',
                      )}
                    />
                  </header>
                  <p className="transaction-card__meta">
                    <time dateTime={transaction.localDate}>{formatDate(transaction.localDate)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{transaction.accountName}</span>
                  </p>
                  <div className="transaction-card__badges">
                    <KindBadge kind={transaction.kind} />
                    <FlowLabel flow={transaction.flow} />
                    <OriginBadge origin={transaction.origin} />
                    <ReceiptIndicator transaction={transaction} />
                  </div>
                  <footer>
                    <TransactionActions transaction={transaction} onEdit={onEdit} onVoid={onVoid} />
                  </footer>
                </article>
              ))}
            </div>

            <nav className="transaction-pagination" aria-label="Transaction pages">
              <Button
                variant="ghost"
                disabled={page.page <= 1}
                aria-label="Go to previous page"
                onClick={() => changePage(page.page - 1)}
              >
                <ChevronLeft aria-hidden="true" size={17} />
                Previous
              </Button>
              <span>
                Page <strong>{page.page}</strong> of <strong>{page.totalPages}</strong>
              </span>
              <Button
                variant="ghost"
                disabled={page.page >= page.totalPages}
                aria-label="Go to next page"
                onClick={() => changePage(page.page + 1)}
              >
                Next
                <ChevronRight aria-hidden="true" size={17} />
              </Button>
            </nav>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
