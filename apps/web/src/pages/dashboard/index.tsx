import { PageHeader } from '../../components/Ui';
import type { DashboardSummary, Month, Schedule, Transaction } from '../../data/types';
import { useLocale, useMessages } from '../../i18n/locale';
import { nextMonth, previousMonth } from '../../utils/format';
import {
  CategoryBudgetsCard,
  DashboardEmpty,
  DashboardHeaderActions,
  DashboardLoading,
  MonthlyTotals,
  RecentTransactionsCard,
  SpendingComparisons,
  SpendingTrend,
  UncategorisedWarning,
  UpcomingSchedulesCard,
} from './components';
import { dashboardMessages } from './messages';
import './styles.css';

type DashboardPageProps = {
  readonly summary: DashboardSummary | null;
  readonly schedules: readonly Schedule[];
  readonly month: Month;
  readonly loading: boolean;
  readonly onMonthChange: (month: Month) => void;
  readonly onAddTransaction: () => void;
  readonly onOpenTransaction: (transaction: Transaction) => void;
};

export function DashboardPage({
  summary,
  schedules,
  month,
  loading,
  onMonthChange,
  onAddTransaction,
  onOpenTransaction,
}: DashboardPageProps) {
  const t = useMessages(dashboardMessages);
  const { format } = useLocale();
  const priorMonth = previousMonth(month);
  const followingMonth = nextMonth(month);
  const headerActions = (
    <DashboardHeaderActions
      month={month}
      priorMonth={priorMonth}
      followingMonth={followingMonth}
      onPrevious={() => onMonthChange(priorMonth)}
      onNext={() => onMonthChange(followingMonth)}
      onAddTransaction={onAddTransaction}
    />
  );

  if (loading) {
    return (
      <div className="dashboard page-enter" aria-busy="true">
        <PageHeader
          eyebrow={t('eyebrow')}
          title={t('title')}
          description={t('pageDescription')}
          actions={headerActions}
        />
        <DashboardLoading />
      </div>
    );
  }

  if (!summary || summary.transactionCount === 0) {
    return (
      <div className="dashboard page-enter">
        <PageHeader
          eyebrow={t('eyebrow')}
          title={t('title')}
          description={t('pageDescription')}
          actions={headerActions}
        />
        <DashboardEmpty month={month} onAddTransaction={onAddTransaction} />
      </div>
    );
  }

  const budgetProgress = summary.budgetTotalMinor > 0 ? summary.spendingMinor / summary.budgetTotalMinor : 0;
  const budgetDetail =
    summary.budgetTotalMinor === 0
      ? t('noMonthlyBudget')
      : summary.budgetRemainingMinor >= 0
        ? t('budgetAvailable', { percent: format.percent(summary.budgetRemainingMinor / summary.budgetTotalMinor) })
        : t('budgetOver', { amount: format.money(Math.abs(summary.budgetRemainingMinor)) });

  return (
    <div className="dashboard page-enter">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={
          summary.transactionCount === 1
            ? t('oneTransactionDescription', { month: format.month(month) })
            : t('populatedDescription', {
                count: format.number(summary.transactionCount),
                month: format.month(month),
              })
        }
        actions={headerActions}
      />

      {summary.uncategorisedSpendingMinor > 0 ? (
        <UncategorisedWarning amountMinor={summary.uncategorisedSpendingMinor} />
      ) : null}

      <MonthlyTotals summary={summary} budgetProgress={budgetProgress} budgetDetail={budgetDetail} />

      <section className="dashboard-insights" aria-label={t('spendingInsights')}>
        <SpendingTrend summary={summary} />
        <SpendingComparisons weekOverWeek={summary.weekOverWeek} monthOverMonth={summary.monthOverMonth} />
      </section>

      <section className="dashboard-details" aria-label={t('overviewDetails')}>
        <CategoryBudgetsCard budgets={summary.budgets} budgetProgress={budgetProgress} />
        <RecentTransactionsCard transactions={summary.recentTransactions} onOpenTransaction={onOpenTransaction} />
        <UpcomingSchedulesCard schedules={schedules} />
      </section>
    </div>
  );
}
