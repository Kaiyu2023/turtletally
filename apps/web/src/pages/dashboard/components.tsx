import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgePoundSterling,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Landmark,
  Minus,
  Paperclip,
  PiggyBank,
  Plus,
  Receipt,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Money, ProgressBar, Skeleton } from '../../components/Ui';
import type {
  BudgetProgress,
  DailySpending,
  DashboardSummary,
  LocalDate,
  Month,
  Schedule,
  SpendingComparison,
  Transaction,
} from '../../data/types';
import { useLocale, useMessages } from '../../i18n/locale';
import { joinClassNames } from '../../utils/format';
import { dashboardMessages } from './messages';

type StatCardProps = {
  readonly label: string;
  readonly amountMinor: number;
  readonly icon: LucideIcon;
  readonly tone: 'income' | 'spending' | 'net' | 'budget';
  readonly detail: string;
  readonly signed?: boolean;
  readonly progress?: number;
};

type ComparisonBlockProps = {
  readonly label: string;
  readonly description: string;
  readonly comparison: SpendingComparison;
};

type DueSchedule = Schedule & { readonly nextDueDate: LocalDate };

const CHART_WIDTH = 720;
const CHART_HEIGHT = 210;
const CHART_LEFT = 18;
const CHART_RIGHT = 702;
const CHART_TOP = 18;
const CHART_BASELINE = 178;

export function DashboardHeaderActions({
  month,
  priorMonth,
  followingMonth,
  onPrevious,
  onNext,
  onAddTransaction,
}: {
  readonly month: Month;
  readonly priorMonth: Month;
  readonly followingMonth: Month;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onAddTransaction: () => void;
}) {
  const t = useMessages(dashboardMessages);
  const { format } = useLocale();

  return (
    <div className="dashboard-header-actions">
      <div className="dashboard-month-picker" role="group" aria-label={t('chooseMonth')}>
        <button type="button" aria-label={t('showMonth', { month: format.month(priorMonth) })} onClick={onPrevious}>
          <ChevronLeft aria-hidden="true" size={19} />
        </button>
        <span aria-live="polite">
          <small>{t('viewing')}</small>
          <strong>{format.month(month)}</strong>
        </span>
        <button type="button" aria-label={t('showMonth', { month: format.month(followingMonth) })} onClick={onNext}>
          <ChevronRight aria-hidden="true" size={19} />
        </button>
      </div>
      <Button
        className="dashboard-header-add"
        variant="primary"
        aria-label={t('addTransaction')}
        onClick={onAddTransaction}
      >
        <Plus aria-hidden="true" size={18} />
        <span>{t('addTransaction')}</span>
      </Button>
    </div>
  );
}

export function DashboardEmpty({
  month,
  onAddTransaction,
}: {
  readonly month: Month;
  readonly onAddTransaction: () => void;
}) {
  const t = useMessages(dashboardMessages);
  const { format } = useLocale();

  return (
    <Card className="dashboard-empty">
      <EmptyState
        icon={<WalletCards aria-hidden="true" size={27} />}
        title={t('emptyTitle', { month: format.month(month) })}
        description={t('emptyDescription')}
        action={
          <Button variant="primary" onClick={onAddTransaction}>
            <Plus aria-hidden="true" size={18} />
            {t('addTransaction')}
          </Button>
        }
      />
    </Card>
  );
}

export function UncategorisedWarning({ amountMinor }: { readonly amountMinor: number }) {
  const t = useMessages(dashboardMessages);

  return (
    <aside className="dashboard-warning" aria-labelledby="uncategorised-title">
      <span className="dashboard-warning__icon" aria-hidden="true">
        <CircleAlert size={21} />
      </span>
      <div>
        <h2 id="uncategorised-title">{t('attentionTitle')}</h2>
        <p>
          <Money amountMinor={amountMinor} /> {t('uncategorisedDetail')}
        </p>
      </div>
    </aside>
  );
}

function StatCard({ label, amountMinor, icon: Icon, tone, detail, signed = false, progress }: StatCardProps) {
  const t = useMessages(dashboardMessages);
  const { format } = useLocale();

  return (
    <Card as="article" className={`dashboard-stat dashboard-stat--${tone}`}>
      <div className="dashboard-stat__top">
        <span className="dashboard-stat__icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <span className="dashboard-stat__label">{label}</span>
      </div>
      <Money
        amountMinor={amountMinor}
        signed={signed}
        className={joinClassNames('dashboard-stat__value', amountMinor < 0 && 'negative')}
      />
      <p>{detail}</p>
      {progress === undefined ? null : (
        <ProgressBar
          value={progress}
          label={t('progressLabel', { label, percent: format.percent(progress) })}
          tone={progress > 1 ? 'negative' : progress > 0.75 ? 'warning' : 'primary'}
        />
      )}
    </Card>
  );
}

export function MonthlyTotals({
  summary,
  budgetProgress,
  budgetDetail,
}: {
  readonly summary: DashboardSummary;
  readonly budgetProgress: number;
  readonly budgetDetail: string;
}) {
  const t = useMessages(dashboardMessages);
  const { format } = useLocale();

  return (
    <section className="dashboard-stats" aria-label={t('monthlyTotals')}>
      <StatCard
        label={t('income')}
        amountMinor={summary.incomeMinor}
        icon={Landmark}
        tone="income"
        detail={
          summary.transactionCount === 1
            ? t('oneTransactionRecorded')
            : t('transactionsRecorded', { count: format.number(summary.transactionCount) })
        }
      />
      <StatCard
        label={t('spending')}
        amountMinor={summary.spendingMinor}
        icon={BadgePoundSterling}
        tone="spending"
        detail={t('monthlyBudget', { amount: format.compactMoney(summary.budgetTotalMinor) })}
        progress={budgetProgress}
      />
      <StatCard
        label={t('netCashFlow')}
        amountMinor={summary.netCashFlowMinor}
        icon={Sparkles}
        tone="net"
        signed
        detail={t('directedToInvestments', { amount: format.money(summary.investmentDebitsMinor) })}
      />
      <StatCard
        label={t('budgetRemaining')}
        amountMinor={summary.budgetRemainingMinor}
        icon={PiggyBank}
        tone="budget"
        detail={budgetDetail}
      />
    </section>
  );
}

function ComparisonBlock({ label, description, comparison }: ComparisonBlockProps) {
  const t = useMessages(dashboardMessages);
  const { format } = useLocale();
  const percent = format.percent(Math.abs(comparison.changePercent ?? 0) / 100);
  const presentation =
    comparison.direction === 'NOT_COMPARABLE'
      ? { icon: Minus, text: t('noPriorActivity'), tone: 'neutral' as const }
      : comparison.direction === 'FLAT'
        ? { icon: Minus, text: t('noChange'), tone: 'neutral' as const }
        : comparison.direction === 'DOWN'
          ? { icon: TrendingDown, text: t('less', { percent }), tone: 'positive' as const }
          : { icon: TrendingUp, text: t('more', { percent }), tone: 'negative' as const };
  const Icon = presentation.icon;

  return (
    <article className={`comparison comparison--${presentation.tone}`}>
      <div className="comparison__heading">
        <span className="comparison__icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <div>
          <h3>{label}</h3>
          <p>{description}</p>
        </div>
      </div>
      <strong className="comparison__change">{presentation.text}</strong>
      <div className="comparison__amounts">
        <span>
          {t('now')} <Money amountMinor={comparison.currentMinor} />
        </span>
        <span>
          {t('before')} <Money amountMinor={comparison.previousMinor} />
        </span>
      </div>
    </article>
  );
}

function chartGeometry(days: readonly DailySpending[]) {
  if (days.length === 0) {
    return null;
  }

  const maximum = Math.max(...days.map((day) => day.amountMinor), 1);
  const points = days.map((day, index) => {
    const ratio = days.length === 1 ? 0.5 : index / (days.length - 1);
    const x = CHART_LEFT + ratio * (CHART_RIGHT - CHART_LEFT);
    const y = CHART_BASELINE - (day.amountMinor / maximum) * (CHART_BASELINE - CHART_TOP);
    return { ...day, x, y };
  });
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) {
    return null;
  }

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const peak = points.reduce((highest, point) => (point.amountMinor > highest.amountMinor ? point : highest));
  const total = days.reduce((sum, day) => sum + day.amountMinor, 0);

  return {
    line,
    area: `${line} L ${last.x.toFixed(2)} ${CHART_BASELINE} L ${first.x.toFixed(2)} ${CHART_BASELINE} Z`,
    peak,
    averageMinor: Math.round(total / days.length),
    first,
    middle: points[Math.floor(points.length / 2)] ?? first,
    last,
  };
}

export function SpendingTrend({ summary }: { readonly summary: DashboardSummary }) {
  const t = useMessages(dashboardMessages);
  const { format } = useLocale();
  const chart = chartGeometry(summary.dailySpending);

  return (
    <Card className="dashboard-trend-card">
      <CardHeader
        className="dashboard-card-header"
        eyebrow={t('dailyRhythm')}
        title={t('spendingTrend')}
        description={t('spendingTrendDescription')}
        action={
          <Badge tone="info">
            {summary.dailySpending.length === 1
              ? t('oneDay')
              : t('days', { count: format.number(summary.dailySpending.length) })}
          </Badge>
        }
      />

      {chart ? (
        <>
          <figure className="spending-chart">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              role="img"
              aria-label={t('chartLabel', {
                month: format.month(summary.month),
                amount: format.money(chart.peak.amountMinor),
                date: format.date(chart.peak.date),
              })}
            >
              <line className="spending-chart__grid" x1={CHART_LEFT} y1="58" x2={CHART_RIGHT} y2="58" />
              <line className="spending-chart__grid" x1={CHART_LEFT} y1="98" x2={CHART_RIGHT} y2="98" />
              <line className="spending-chart__grid" x1={CHART_LEFT} y1="138" x2={CHART_RIGHT} y2="138" />
              <line
                className="spending-chart__baseline"
                x1={CHART_LEFT}
                y1={CHART_BASELINE}
                x2={CHART_RIGHT}
                y2={CHART_BASELINE}
              />
              <path className="spending-chart__area" d={chart.area} />
              <path className="spending-chart__line" d={chart.line} pathLength="1" />
              <circle className="spending-chart__peak" cx={chart.peak.x} cy={chart.peak.y} r="5" />
              <text className="spending-chart__label" x={chart.first.x} y="202" textAnchor="start">
                {format.shortDate(chart.first.date)}
              </text>
              <text className="spending-chart__label" x={chart.middle.x} y="202" textAnchor="middle">
                {format.shortDate(chart.middle.date)}
              </text>
              <text className="spending-chart__label" x={chart.last.x} y="202" textAnchor="end">
                {format.shortDate(chart.last.date)}
              </text>
            </svg>
          </figure>
          <div className="spending-chart__summary" aria-label={t('spendingTrendSummary')}>
            <span>
              <small>{t('monthToDate')}</small>
              <Money amountMinor={summary.spendingMinor} />
            </span>
            <span>
              <small>{t('dailyAverage')}</small>
              <Money amountMinor={chart.averageMinor} />
            </span>
            <span>
              <small>{t('peakDay')}</small>
              <Money amountMinor={chart.peak.amountMinor} />
            </span>
          </div>
        </>
      ) : (
        <div className="dashboard-compact-empty">
          <Receipt aria-hidden="true" />
          <span>{t('noDailyActivity')}</span>
        </div>
      )}
    </Card>
  );
}

export function SpendingComparisons({
  weekOverWeek,
  monthOverMonth,
}: {
  readonly weekOverWeek: SpendingComparison;
  readonly monthOverMonth: SpendingComparison;
}) {
  const t = useMessages(dashboardMessages);

  return (
    <Card className="dashboard-comparisons">
      <CardHeader
        className="dashboard-card-header"
        eyebrow={t('momentum')}
        title={t('spendingPulse')}
        description={t('spendingPulseDescription')}
      />
      <div className="comparison-list">
        <ComparisonBlock label={t('weekOverWeek')} description={t('completedDays')} comparison={weekOverWeek} />
        <ComparisonBlock
          label={t('monthOverMonth')}
          description={t('priorMonthComparison')}
          comparison={monthOverMonth}
        />
      </div>
    </Card>
  );
}

function BudgetList({ budgets }: { readonly budgets: readonly BudgetProgress[] }) {
  const t = useMessages(dashboardMessages);
  const { format } = useLocale();

  if (budgets.length === 0) {
    return (
      <div className="dashboard-compact-empty">
        <Target aria-hidden="true" />
        <span>{t('noBudgets')}</span>
      </div>
    );
  }

  return (
    <ol className="budget-list">
      {budgets.slice(0, 6).map((budget) => {
        const progress = budget.percentUsed / 100;
        return (
          <li key={budget.id} className="budget-row">
            <div className="budget-row__heading">
              <span className="category-dot" style={{ backgroundColor: budget.colour }} aria-hidden="true" />
              <strong>{budget.categoryName}</strong>
              <span>
                <Money amountMinor={budget.spentMinor} />{' '}
                <small>{t('amountOfLimit', { amount: format.money(budget.limitMinor) })}</small>
              </span>
            </div>
            <ProgressBar
              value={progress}
              label={t('budgetUsedLabel', { name: budget.categoryName, percent: format.percent(progress) })}
              tone={progress > 1 ? 'negative' : progress > 0.75 ? 'warning' : 'primary'}
            />
            <small className={joinClassNames('budget-row__remaining', budget.remainingMinor < 0 && 'negative')}>
              {budget.remainingMinor >= 0
                ? t('amountLeft', { amount: format.money(budget.remainingMinor) })
                : t('amountOver', { amount: format.money(Math.abs(budget.remainingMinor)) })}
            </small>
          </li>
        );
      })}
    </ol>
  );
}

export function CategoryBudgetsCard({
  budgets,
  budgetProgress,
}: {
  readonly budgets: readonly BudgetProgress[];
  readonly budgetProgress: number;
}) {
  const t = useMessages(dashboardMessages);
  const { format } = useLocale();

  return (
    <Card className="dashboard-detail-card">
      <CardHeader
        className="dashboard-card-header"
        eyebrow={t('guardrails')}
        title={t('categoryBudgets')}
        description={t('categoryBudgetsDescription')}
        action={
          <Badge tone={budgetProgress > 1 ? 'negative' : budgetProgress > 0.75 ? 'warning' : 'positive'}>
            {t('percentUsed', { percent: format.percent(budgetProgress) })}
          </Badge>
        }
      />
      <BudgetList budgets={budgets} />
    </Card>
  );
}

function transactionIcon(transaction: Transaction): LucideIcon {
  if (transaction.kind === 'INVESTMENT') {
    return TrendingUp;
  }
  return transaction.flow === 'CREDIT' ? ArrowDownLeft : ArrowUpRight;
}

const transactionOriginMessage = {
  ASSISTANT: 'assistant',
  IMPORT: 'imported',
  SCHEDULE: 'scheduled',
  MANUAL: 'manual',
} as const satisfies Record<Transaction['origin'], keyof (typeof dashboardMessages)['en-GB']>;

function RecentTransactions({
  transactions,
  onOpen,
}: {
  readonly transactions: readonly Transaction[];
  readonly onOpen: (transaction: Transaction) => void;
}) {
  const t = useMessages(dashboardMessages);
  const { format } = useLocale();

  if (transactions.length === 0) {
    return (
      <div className="dashboard-compact-empty">
        <Receipt aria-hidden="true" />
        <span>{t('noRecentTransactions')}</span>
      </div>
    );
  }

  return (
    <ul className="activity-list">
      {transactions.map((transaction) => {
        const Icon = transactionIcon(transaction);
        const displayAmount = transaction.flow === 'CREDIT' ? transaction.amountMinor : -transaction.amountMinor;
        return (
          <li key={transaction.id}>
            <button type="button" className="activity-row" onClick={() => onOpen(transaction)}>
              <span
                className={`activity-row__icon activity-row__icon--${transaction.kind.toLowerCase()}`}
                aria-hidden="true"
              >
                <Icon size={18} />
              </span>
              <span className="activity-row__details">
                <strong>{transaction.description}</strong>
                <small>
                  <span>{transaction.categoryName ?? t('uncategorised')}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={transaction.localDate}>{format.shortDate(transaction.localDate)}</time>
                </small>
              </span>
              <span className="activity-row__amount">
                <Money
                  amountMinor={displayAmount}
                  signed
                  className={joinClassNames(displayAmount >= 0 && 'positive')}
                />
                <small>
                  {t(transactionOriginMessage[transaction.origin])}
                  {transaction.receipt ? <Paperclip aria-label={t('receiptAttached')} size={12} /> : null}
                </small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function RecentTransactionsCard({
  transactions,
  onOpenTransaction,
}: {
  readonly transactions: readonly Transaction[];
  readonly onOpenTransaction: (transaction: Transaction) => void;
}) {
  const t = useMessages(dashboardMessages);
  const { format } = useLocale();

  return (
    <Card className="dashboard-detail-card">
      <CardHeader
        className="dashboard-card-header"
        eyebrow={t('latestActivity')}
        title={t('recentTransactions')}
        description={t('recentTransactionsDescription')}
        action={<Badge>{format.number(transactions.length)}</Badge>}
      />
      <RecentTransactions transactions={transactions} onOpen={onOpenTransaction} />
    </Card>
  );
}

function hasDueDate(schedule: Schedule): schedule is DueSchedule {
  return schedule.deactivatedAt === null && schedule.nextDueDate !== null;
}

function UpcomingSchedules({ schedules }: { readonly schedules: readonly Schedule[] }) {
  const t = useMessages(dashboardMessages);
  const { format } = useLocale();
  const upcoming = schedules
    .filter(hasDueDate)
    .sort((left, right) => left.nextDueDate.localeCompare(right.nextDueDate))
    .slice(0, 4);

  function recurrenceLabel(schedule: Schedule): string {
    switch (schedule.recurrence.frequency) {
      case 'ONCE':
        return t('oneTime');
      case 'WEEKLY':
        return schedule.recurrence.intervalWeeks === 1
          ? t('weekly')
          : t('everyWeeks', { count: format.number(schedule.recurrence.intervalWeeks) });
      case 'MONTHLY':
        return t('monthly');
      case 'YEARLY':
        return t('yearly');
    }
  }

  if (upcoming.length === 0) {
    return (
      <div className="dashboard-compact-empty">
        <CalendarClock aria-hidden="true" />
        <span>{t('noUpcomingSchedules')}</span>
      </div>
    );
  }

  return (
    <ol className="schedule-list">
      {upcoming.map((schedule) => {
        const displayAmount = schedule.flow === 'CREDIT' ? schedule.amountMinor : -schedule.amountMinor;
        return (
          <li key={schedule.id} className="schedule-row">
            <time dateTime={schedule.nextDueDate}>
              <strong>{format.day(schedule.nextDueDate)}</strong>
              <span>{format.shortMonth(schedule.nextDueDate)}</span>
            </time>
            <span className="schedule-row__details">
              <strong>{schedule.name}</strong>
              <small>
                {recurrenceLabel(schedule)} · {schedule.accountName}
              </small>
            </span>
            <Money amountMinor={displayAmount} signed className={joinClassNames(displayAmount >= 0 && 'positive')} />
          </li>
        );
      })}
    </ol>
  );
}

export function UpcomingSchedulesCard({ schedules }: { readonly schedules: readonly Schedule[] }) {
  const t = useMessages(dashboardMessages);

  return (
    <Card className="dashboard-detail-card dashboard-schedules-card">
      <CardHeader
        className="dashboard-card-header"
        eyebrow={t('onTheHorizon')}
        title={t('upcomingSchedules')}
        description={t('upcomingSchedulesDescription')}
        action={<CalendarClock aria-hidden="true" className="dashboard-header-icon" size={21} />}
      />
      <UpcomingSchedules schedules={schedules} />
    </Card>
  );
}

export function DashboardLoading() {
  const t = useMessages(dashboardMessages);

  return (
    <div className="dashboard-loading" aria-label={t('loadingOverview')} role="status">
      <div className="dashboard-stats">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="dashboard-loading__stat">
            <Skeleton lines={3} />
          </Card>
        ))}
      </div>
      <div className="dashboard-insights">
        <Card>
          <Skeleton lines={5} />
        </Card>
        <Card>
          <Skeleton lines={5} />
        </Card>
      </div>
      <div className="dashboard-details">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index}>
            <Skeleton lines={5} />
          </Card>
        ))}
      </div>
    </div>
  );
}
