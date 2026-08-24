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
import { Badge, Button, Card, EmptyState, IconButton, Money, Skeleton } from '../../components/Ui';
import { flowOf } from '../../data/money';
import type {
  Account,
  Category,
  CategoryGroup,
  Transaction,
  TransactionFilters,
  TransactionFlow,
  TransactionKind,
  TransactionOrigin,
  TransactionPage,
  TransactionSort,
  TransactionStatus,
} from '../../data/types';
import { useLocale, useMessages } from '../../i18n/locale';
import { joinClassNames } from '../../utils/format';
import { transactionsMessages } from './messages';

const statuses: readonly TransactionStatus[] = ['ACTIVE', 'VOIDED', 'ALL'];
const kinds: readonly TransactionKind[] = ['INCOME', 'SPENDING', 'INVESTMENT'];
const flows: readonly TransactionFlow[] = ['CREDIT', 'DEBIT'];
const origins: readonly TransactionOrigin[] = ['MANUAL', 'IMPORT', 'SCHEDULE', 'ASSISTANT'];
const sorts: readonly TransactionSort[] = ['NEWEST', 'OLDEST', 'AMOUNT_HIGH', 'AMOUNT_LOW'];

const pageSizes = [10, 20, 50] as const;

type TransactionFiltersPanelProps = {
  readonly filters: TransactionFilters;
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly activeFilterCount: number;
  readonly onFilterChange: <Key extends keyof TransactionFilters>(
    key: Key,
    value: TransactionFilters[Key] | '',
  ) => void;
  readonly onMonthChange: (value: string) => void;
  readonly onDateChange: (key: 'from' | 'to', value: string) => void;
  readonly onReset: () => void;
};

export function TransactionFiltersPanel({
  filters,
  accounts,
  categories,
  activeFilterCount,
  onFilterChange,
  onMonthChange,
  onDateChange,
  onReset,
}: TransactionFiltersPanelProps) {
  const t = useMessages(transactionsMessages);
  const { format } = useLocale();
  const selectedStatus = filters.status ?? 'ACTIVE';
  const statusLabels: Record<TransactionStatus, string> = {
    ACTIVE: t('active'),
    VOIDED: t('voided'),
    ALL: t('all'),
  };
  const kindLabels: Record<TransactionKind, string> = {
    INCOME: t('income'),
    SPENDING: t('spending'),
    INVESTMENT: t('investment'),
  };
  const flowLabels: Record<TransactionFlow, string> = {
    CREDIT: t('credit'),
    DEBIT: t('debit'),
  };
  const originLabels: Record<TransactionOrigin, string> = {
    MANUAL: t('manual'),
    IMPORT: t('import'),
    SCHEDULE: t('schedule'),
    ASSISTANT: t('assistant'),
  };
  const sortLabels: Record<TransactionSort, string> = {
    NEWEST: t('newestFirst'),
    OLDEST: t('oldestFirst'),
    AMOUNT_HIGH: t('highestAmount'),
    AMOUNT_LOW: t('lowestAmount'),
  };
  const groupLabels: Record<CategoryGroup, string> = {
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
    <Card className="transaction-filters">
      <div className="transaction-filters__heading">
        <div>
          <h2>{t('findTransactions')}</h2>
          <p>{t('filterHelp')}</p>
        </div>
        <Button variant="ghost" disabled={activeFilterCount === 0} onClick={onReset}>
          <RotateCcw aria-hidden="true" size={16} />
          {activeFilterCount > 0 ? t('resetCount', { count: format.number(activeFilterCount) }) : t('reset')}
        </Button>
      </div>

      <div className="transaction-filters__primary">
        <label className="filter-field filter-field--search">
          <span>{t('search')}</span>
          <span className="transaction-search">
            <Search aria-hidden="true" size={18} />
            <input
              type="search"
              value={filters.search ?? ''}
              maxLength={80}
              placeholder={t('searchPlaceholder')}
              aria-controls="transaction-results"
              onChange={(event) => onFilterChange('search', event.target.value)}
            />
          </span>
        </label>

        <label className="filter-field">
          <span>{t('month')}</span>
          <input
            type="month"
            min="2000-01"
            max="2100-12"
            value={filters.month ?? ''}
            aria-controls="transaction-results"
            onChange={(event) => onMonthChange(event.target.value)}
          />
        </label>

        <label className="filter-field">
          <span>{t('sortBy')}</span>
          <select
            value={filters.sort ?? 'NEWEST'}
            aria-controls="transaction-results"
            onChange={(event) => onFilterChange('sort', event.target.value as TransactionSort)}
          >
            {sorts.map((sort) => (
              <option key={sort} value={sort}>
                {sortLabels[sort]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="transaction-filters__secondary">
        <label className="filter-field">
          <span>{t('from')}</span>
          <input
            type="date"
            min="2000-01-01"
            max={filters.to ?? '2100-12-31'}
            value={filters.from ?? ''}
            aria-controls="transaction-results"
            onChange={(event) => onDateChange('from', event.target.value)}
          />
        </label>

        <label className="filter-field">
          <span>{t('to')}</span>
          <input
            type="date"
            min={filters.from ?? '2000-01-01'}
            max="2100-12-31"
            value={filters.to ?? ''}
            aria-controls="transaction-results"
            onChange={(event) => onDateChange('to', event.target.value)}
          />
        </label>

        <label className="filter-field">
          <span>{t('account')}</span>
          <select
            value={filters.accountId ?? ''}
            aria-controls="transaction-results"
            onChange={(event) => onFilterChange('accountId', event.target.value)}
          >
            <option value="">{t('allAccounts')}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>{t('category')}</span>
          <select
            value={filters.categoryId ?? ''}
            aria-controls="transaction-results"
            onChange={(event) => onFilterChange('categoryId', event.target.value)}
          >
            <option value="">{t('allCategories')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {groupLabels[category.group]} · {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>{t('kind')}</span>
          <select
            value={filters.kind ?? ''}
            aria-controls="transaction-results"
            onChange={(event) => onFilterChange('kind', event.target.value as TransactionKind | '')}
          >
            <option value="">{t('allKinds')}</option>
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {kindLabels[kind]}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>{t('flow')}</span>
          <select
            value={filters.flow ?? ''}
            aria-controls="transaction-results"
            onChange={(event) => onFilterChange('flow', event.target.value as TransactionFlow | '')}
          >
            <option value="">{t('allFlows')}</option>
            {flows.map((flow) => (
              <option key={flow} value={flow}>
                {flowLabels[flow]}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>{t('origin')}</span>
          <select
            value={filters.origin ?? ''}
            aria-controls="transaction-results"
            onChange={(event) => onFilterChange('origin', event.target.value as TransactionOrigin | '')}
          >
            <option value="">{t('allOrigins')}</option>
            {origins.map((origin) => (
              <option key={origin} value={origin}>
                {originLabels[origin]}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>{t('perPage')}</span>
          <select
            value={filters.pageSize ?? 10}
            aria-controls="transaction-results"
            onChange={(event) => onFilterChange('pageSize', Number(event.target.value))}
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {t('rows', { count: format.number(size) })}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="transaction-status">
        <legend>{t('status')}</legend>
        <div className="segmented">
          {statuses.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={selectedStatus === status}
              aria-controls="transaction-results"
              onClick={() => onFilterChange('status', status)}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>
      </fieldset>
    </Card>
  );
}

type TransactionResultsProps = {
  readonly page: TransactionPage | null;
  readonly categories: readonly Category[];
  readonly loading: boolean;
  readonly filtered: boolean;
  readonly onReset: () => void;
  readonly onAdd: () => void;
  readonly onEdit: (transaction: Transaction) => void;
  readonly onVoid: (transaction: Transaction) => void;
  readonly onPageChange: (page: number) => void;
};

export function TransactionResults({
  page,
  categories,
  loading,
  filtered,
  onReset,
  onAdd,
  onEdit,
  onVoid,
  onPageChange,
}: TransactionResultsProps) {
  const t = useMessages(transactionsMessages);
  const { format } = useLocale();

  return (
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
            title={filtered ? t('noMatches') : t('noTransactions')}
            description={filtered ? t('noMatchesDescription') : t('noTransactionsDescription')}
            action={
              filtered ? (
                <Button onClick={onReset}>
                  <RotateCcw aria-hidden="true" size={16} />
                  {t('resetFilters')}
                </Button>
              ) : (
                <Button variant="primary" onClick={onAdd}>
                  <Plus aria-hidden="true" size={16} />
                  {t('addTransaction')}
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
              <h2>{t('ledgerEntries')}</h2>
              <p>
                {page.totalItems === 1
                  ? t('oneTransactionFound')
                  : t('transactionsFound', { count: format.number(page.totalItems) })}
              </p>
            </div>
            <span className="transaction-results__range">
              {t('resultRange', {
                start: format.number((page.page - 1) * page.pageSize + 1),
                end: format.number(Math.min(page.page * page.pageSize, page.totalItems)),
                total: format.number(page.totalItems),
              })}
            </span>
          </header>
          <TransactionTable page={page} categories={categories} onEdit={onEdit} onVoid={onVoid} />
          <TransactionCards page={page} categories={categories} onEdit={onEdit} onVoid={onVoid} />
          <nav className="transaction-pagination" aria-label={t('transactionPages')}>
            <Button
              variant="ghost"
              disabled={page.page <= 1}
              aria-label={t('goToPreviousPage')}
              onClick={() => onPageChange(page.page - 1)}
            >
              <ChevronLeft aria-hidden="true" size={17} />
              {t('previous')}
            </Button>
            <span>
              {t('pagePrefix')} <strong>{format.number(page.page)}</strong> {t('pageMiddle')}{' '}
              <strong>{format.number(page.totalPages)}</strong> {t('pageSuffix')}
            </span>
            <Button
              variant="ghost"
              disabled={page.page >= page.totalPages}
              aria-label={t('goToNextPage')}
              onClick={() => onPageChange(page.page + 1)}
            >
              {t('next')}
              <ChevronRight aria-hidden="true" size={17} />
            </Button>
          </nav>
        </Card>
      ) : null}
    </section>
  );
}

type TransactionCollectionProps = {
  readonly page: TransactionPage;
  readonly categories: readonly Category[];
  readonly onEdit: (transaction: Transaction) => void;
  readonly onVoid: (transaction: Transaction) => void;
};

function TransactionTable({ page, categories, onEdit, onVoid }: TransactionCollectionProps) {
  const t = useMessages(transactionsMessages);
  const { format } = useLocale();

  return (
    <div className="table-wrap transaction-table-wrap">
      <table className="data-table transaction-table">
        <caption className="transactions-sr-only">{t('filteredTransactions')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('date')}</th>
            <th scope="col">{t('transaction')}</th>
            <th scope="col">{t('account')}</th>
            <th scope="col">{t('kindAndOrigin')}</th>
            <th scope="col" className="align-right">
              {t('amount')}
            </th>
            <th scope="col" className="align-right">
              {t('actions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((transaction) => (
            <tr key={transaction.id} className={joinClassNames(transaction.voidedAt && 'transaction-row--voided')}>
              <td>
                <time className="transaction-date" dateTime={transaction.localDate}>
                  {format.date(transaction.localDate)}
                </time>
              </td>
              <td>
                <TransactionDescription transaction={transaction} categories={categories} showReceipt />
              </td>
              <td>
                <span className="transaction-account">{transaction.accountName}</span>
              </td>
              <td>
                <TransactionClassification transaction={transaction} />
              </td>
              <td className="align-right">
                <TransactionAmount transaction={transaction} />
              </td>
              <td className="align-right">
                <TransactionActions transaction={transaction} onEdit={onEdit} onVoid={onVoid} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionCards({ page, categories, onEdit, onVoid }: TransactionCollectionProps) {
  const { format } = useLocale();

  return (
    <div className="transaction-cards">
      {page.items.map((transaction) => (
        <article
          key={transaction.id}
          className={joinClassNames('transaction-card', transaction.voidedAt && 'transaction-card--voided')}
        >
          <header>
            <TransactionDescription transaction={transaction} categories={categories} />
            <TransactionAmount transaction={transaction} />
          </header>
          <p className="transaction-card__meta">
            <time dateTime={transaction.localDate}>{format.date(transaction.localDate)}</time>
            <span aria-hidden="true">·</span>
            <span>{transaction.accountName}</span>
          </p>
          <div className="transaction-card__badges">
            <KindBadge kind={transaction.kind} />
            <FlowLabel flow={flowOf(transaction.amountMinor)} />
            <OriginBadge origin={transaction.origin} />
            <ReceiptIndicator transaction={transaction} />
          </div>
          <footer>
            <TransactionActions transaction={transaction} onEdit={onEdit} onVoid={onVoid} />
          </footer>
        </article>
      ))}
    </div>
  );
}

function TransactionDescription({
  transaction,
  categories,
  showReceipt = false,
}: {
  readonly transaction: Transaction;
  readonly categories: readonly Category[];
  readonly showReceipt?: boolean;
}) {
  const t = useMessages(transactionsMessages);

  return (
    <div className="transaction-description">
      <span
        className="transaction-category-dot"
        style={{
          background:
            categories.find((category) => category.id === transaction.categoryId)?.colour ?? 'var(--text-faint)',
        }}
        aria-hidden="true"
      />
      <span>
        <strong>{transaction.description}</strong>
        <small>{transaction.categoryName ?? t('uncategorised')}</small>
      </span>
      {showReceipt ? <ReceiptIndicator transaction={transaction} /> : null}
    </div>
  );
}

function TransactionClassification({ transaction }: { readonly transaction: Transaction }) {
  return (
    <div className="transaction-classification">
      <KindBadge kind={transaction.kind} />
      <FlowLabel flow={flowOf(transaction.amountMinor)} />
      <OriginBadge origin={transaction.origin} />
    </div>
  );
}

function TransactionAmount({ transaction }: { readonly transaction: Transaction }) {
  return (
    <Money
      amountMinor={transaction.amountMinor}
      signed
      className={joinClassNames('transaction-amount', transaction.amountMinor >= 0 ? 'positive' : 'negative')}
    />
  );
}

function OriginBadge({ origin }: { readonly origin: TransactionOrigin }) {
  const t = useMessages(transactionsMessages);

  switch (origin) {
    case 'MANUAL':
      return (
        <Badge>
          <Hand aria-hidden="true" size={12} />
          {t('manual')}
        </Badge>
      );
    case 'IMPORT':
      return (
        <Badge tone="info">
          <Upload aria-hidden="true" size={12} />
          {t('import')}
        </Badge>
      );
    case 'SCHEDULE':
      return (
        <Badge tone="warning">
          <CalendarClock aria-hidden="true" size={12} />
          {t('schedule')}
        </Badge>
      );
    case 'ASSISTANT':
      return (
        <Badge tone="positive">
          <Bot aria-hidden="true" size={12} />
          {t('assistant')}
        </Badge>
      );
  }
}

function KindBadge({ kind }: { readonly kind: TransactionKind }) {
  const t = useMessages(transactionsMessages);

  switch (kind) {
    case 'INCOME':
      return <Badge tone="positive">{t('income')}</Badge>;
    case 'SPENDING':
      return <Badge tone="negative">{t('spending')}</Badge>;
    case 'INVESTMENT':
      return <Badge tone="info">{t('investment')}</Badge>;
  }
}

function FlowLabel({ flow }: { readonly flow: TransactionFlow }) {
  const t = useMessages(transactionsMessages);
  const Icon = flow === 'CREDIT' ? ArrowDownLeft : ArrowUpRight;
  return (
    <span className={joinClassNames('transaction-flow', flow === 'CREDIT' ? 'positive' : 'negative')}>
      <Icon aria-hidden="true" size={14} />
      {flow === 'CREDIT' ? t('credit') : t('debit')}
    </span>
  );
}

function ReceiptIndicator({ transaction }: { readonly transaction: Transaction }) {
  const t = useMessages(transactionsMessages);

  if (!transaction.receipt) {
    return null;
  }

  return (
    <span className="transaction-receipt" role="img" aria-label={t('receiptAttached')} title={t('receiptAttached')}>
      <Paperclip aria-hidden="true" size={14} />
      <span>{t('receipt')}</span>
    </span>
  );
}

type TransactionActionsProps = {
  readonly transaction: Transaction;
  readonly onEdit: (transaction: Transaction) => void;
  readonly onVoid: (transaction: Transaction) => void;
};

function TransactionActions({ transaction, onEdit, onVoid }: TransactionActionsProps) {
  const t = useMessages(transactionsMessages);

  if (transaction.voidedAt) {
    return <Badge tone="negative">{t('voided')}</Badge>;
  }

  return (
    <div className="transaction-actions">
      <IconButton
        className="transaction-action"
        aria-label={t('editNamedTransaction', { description: transaction.description })}
        title={t('editTransaction')}
        onClick={() => onEdit(transaction)}
      >
        <Pencil aria-hidden="true" size={16} />
      </IconButton>
      <IconButton
        className="transaction-action transaction-action--void"
        aria-label={t('voidNamedTransaction', { description: transaction.description })}
        title={t('voidTransaction')}
        onClick={() => onVoid(transaction)}
      >
        <Ban aria-hidden="true" size={16} />
      </IconButton>
    </div>
  );
}
