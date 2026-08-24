import { Plus } from 'lucide-react';
import { Button, PageHeader } from '../../components/Ui';
import type {
  Account,
  Category,
  LocalDate,
  Month,
  Transaction,
  TransactionFilters,
  TransactionPage,
} from '../../data/types';
import { useMessages } from '../../i18n/locale';
import { TransactionFiltersPanel, TransactionResults } from './components';
import { transactionsMessages } from './messages';
import './styles.css';

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
  const t = useMessages(transactionsMessages);
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
      month: filters.month ?? '2026-08',
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
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('pageDescription')}
        actions={
          <Button variant="primary" onClick={onAdd}>
            <Plus aria-hidden="true" size={18} />
            {t('addTransaction')}
          </Button>
        }
      />

      <TransactionFiltersPanel
        filters={filters}
        accounts={activeAccounts}
        categories={activeCategories}
        activeFilterCount={filterCount(filters)}
        onFilterChange={setFilter}
        onMonthChange={setMonth}
        onDateChange={setDate}
        onReset={resetFilters}
      />

      <TransactionResults
        page={page}
        categories={activeCategories}
        loading={loading}
        filtered={hasActiveFilters(filters)}
        onReset={resetFilters}
        onAdd={onAdd}
        onEdit={onEdit}
        onVoid={onVoid}
        onPageChange={changePage}
      />
    </div>
  );
}
