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
import { Badge, Button, Card, EmptyState, Money, PageHeader, ProgressBar, Skeleton } from '../components/Ui';
import type {
  DailySpending,
  DashboardSummary,
  LocalDate,
  Month,
  Schedule,
  SpendingComparison,
  Transaction,
} from '../data/types';
import {
  formatCompactMoney,
  formatDate,
  formatMoney,
  formatMonth,
  formatPercent,
  formatShortDate,
  joinClassNames,
  nextMonth,
  previousMonth,
} from '../utils/format';
import './dashboard.css';

type DashboardPageProps = {
  readonly summary: DashboardSummary | null;
  readonly schedules: readonly Schedule[];
  readonly month: Month;
  readonly loading: boolean;
  readonly onMonthChange: (month: Month) => void;
  readonly onAddTransaction: () => void;
  readonly onOpenTransaction: (transaction: Transaction) => void;
};

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

function StatCard({ label, amountMinor, icon: Icon, tone, detail, signed = false, progress }: StatCardProps) {
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
          label={`${label}: ${formatPercent(progress)}`}
          tone={progress > 1 ? 'negative' : progress > 0.75 ? 'warning' : 'primary'}
        />
      )}
    </Card>
  );
}

function comparisonPresentation(comparison: SpendingComparison) {
  if (comparison.direction === 'NOT_COMPARABLE') {
    return { icon: Minus, text: 'No prior activity', tone: 'neutral' as const };
  }
  if (comparison.direction === 'FLAT') {
    return { icon: Minus, text: 'No change', tone: 'neutral' as const };
  }

  const percent = formatPercent(Math.abs(comparison.changePercent ?? 0) / 100);
  if (comparison.direction === 'DOWN') {
    return { icon: TrendingDown, text: `${percent} less`, tone: 'positive' as const };
  }
  return { icon: TrendingUp, text: `${percent} more`, tone: 'negative' as const };
}

function ComparisonBlock({ label, description, comparison }: ComparisonBlockProps) {
  const presentation = comparisonPresentation(comparison);
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
          Now <Money amountMinor={comparison.currentMinor} />
        </span>
        <span>
          Before <Money amountMinor={comparison.previousMinor} />
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

function SpendingTrend({ summary }: { readonly summary: DashboardSummary }) {
  const chart = chartGeometry(summary.dailySpending);

  return (
    <Card className="dashboard-trend-card">
      <header className="card__header dashboard-card-header">
        <div>
          <span className="eyebrow">Daily rhythm</span>
          <h2>Spending trend</h2>
          <p>Daily outgoings across the selected month.</p>
        </div>
        <Badge tone="info">{summary.dailySpending.length} days</Badge>
      </header>

      {chart ? (
        <>
          <figure className="spending-chart">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              role="img"
              aria-label={`Daily spending for ${formatMonth(summary.month)}. Peak ${formatMoney(chart.peak.amountMinor)} on ${formatDate(chart.peak.date)}.`}
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
                {formatShortDate(chart.first.date)}
              </text>
              <text className="spending-chart__label" x={chart.middle.x} y="202" textAnchor="middle">
                {formatShortDate(chart.middle.date)}
              </text>
              <text className="spending-chart__label" x={chart.last.x} y="202" textAnchor="end">
                {formatShortDate(chart.last.date)}
              </text>
            </svg>
          </figure>
          <div className="spending-chart__summary" aria-label="Spending trend summary">
            <span>
              <small>Month to date</small>
              <Money amountMinor={summary.spendingMinor} />
            </span>
            <span>
              <small>Daily average</small>
              <Money amountMinor={chart.averageMinor} />
            </span>
            <span>
              <small>Peak day</small>
              <Money amountMinor={chart.peak.amountMinor} />
            </span>
          </div>
        </>
      ) : (
        <div className="dashboard-compact-empty">
          <Receipt aria-hidden="true" />
          <span>No daily activity yet.</span>
        </div>
      )}
    </Card>
  );
}

function hasDueDate(schedule: Schedule): schedule is DueSchedule {
  return schedule.deactivatedAt === null && schedule.nextDueDate !== null;
}

function recurrenceLabel(schedule: Schedule): string {
  switch (schedule.recurrence.frequency) {
    case 'ONCE':
      return 'One time';
    case 'WEEKLY':
      return schedule.recurrence.intervalWeeks === 1 ? 'Weekly' : `Every ${schedule.recurrence.intervalWeeks} weeks`;
    case 'MONTHLY':
      return 'Monthly';
    case 'YEARLY':
      return 'Yearly';
  }
}

function transactionIcon(transaction: Transaction): LucideIcon {
  if (transaction.kind === 'INVESTMENT') {
    return TrendingUp;
  }
  return transaction.flow === 'CREDIT' ? ArrowDownLeft : ArrowUpRight;
}

function transactionOrigin(origin: Transaction['origin']): string {
  switch (origin) {
    case 'ASSISTANT':
      return 'Assistant';
    case 'IMPORT':
      return 'Imported';
    case 'SCHEDULE':
      return 'Scheduled';
    case 'MANUAL':
      return 'Manual';
  }
}

function BudgetList({ summary }: { readonly summary: DashboardSummary }) {
  if (summary.budgets.length === 0) {
    return (
      <div className="dashboard-compact-empty">
        <Target aria-hidden="true" />
        <span>No budgets set for this month.</span>
      </div>
    );
  }

  return (
    <ol className="budget-list">
      {summary.budgets.slice(0, 6).map((budget) => {
        const progress = budget.percentUsed / 100;
        return (
          <li key={budget.id} className="budget-row">
            <div className="budget-row__heading">
              <span className="category-dot" style={{ backgroundColor: budget.colour }} aria-hidden="true" />
              <strong>{budget.categoryName}</strong>
              <span>
                <Money amountMinor={budget.spentMinor} /> <small>of {formatMoney(budget.limitMinor)}</small>
              </span>
            </div>
            <ProgressBar
              value={progress}
              label={`${budget.categoryName}: ${formatPercent(progress)} used`}
              tone={progress > 1 ? 'negative' : progress > 0.75 ? 'warning' : 'primary'}
            />
            <small className={joinClassNames('budget-row__remaining', budget.remainingMinor < 0 && 'negative')}>
              {budget.remainingMinor >= 0
                ? `${formatMoney(budget.remainingMinor)} left`
                : `${formatMoney(Math.abs(budget.remainingMinor))} over`}
            </small>
          </li>
        );
      })}
    </ol>
  );
}

function RecentTransactions({
  transactions,
  onOpen,
}: {
  readonly transactions: readonly Transaction[];
  readonly onOpen: (transaction: Transaction) => void;
}) {
  if (transactions.length === 0) {
    return (
      <div className="dashboard-compact-empty">
        <Receipt aria-hidden="true" />
        <span>No recent transactions.</span>
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
                  <span>{transaction.categoryName ?? 'Uncategorised'}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={transaction.localDate}>{formatShortDate(transaction.localDate)}</time>
                </small>
              </span>
              <span className="activity-row__amount">
                <Money
                  amountMinor={displayAmount}
                  signed
                  className={joinClassNames(displayAmount >= 0 && 'positive')}
                />
                <small>
                  {transactionOrigin(transaction.origin)}
                  {transaction.receipt ? <Paperclip aria-label="Receipt attached" size={12} /> : null}
                </small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function UpcomingSchedules({ schedules }: { readonly schedules: readonly Schedule[] }) {
  const upcoming = schedules
    .filter(hasDueDate)
    .sort((left, right) => left.nextDueDate.localeCompare(right.nextDueDate))
    .slice(0, 4);

  if (upcoming.length === 0) {
    return (
      <div className="dashboard-compact-empty">
        <CalendarClock aria-hidden="true" />
        <span>No upcoming schedules.</span>
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
              <strong>{schedule.nextDueDate.slice(8, 10)}</strong>
              <span>{formatShortDate(schedule.nextDueDate).split(' ')[1]}</span>
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

function DashboardLoading() {
  return (
    <div className="dashboard-loading" aria-label="Loading overview" role="status">
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

export function DashboardPage({
  summary,
  schedules,
  month,
  loading,
  onMonthChange,
  onAddTransaction,
  onOpenTransaction,
}: DashboardPageProps) {
  const priorMonth = previousMonth(month);
  const followingMonth = nextMonth(month);

  const headerActions = (
    <div className="dashboard-header-actions">
      <div className="dashboard-month-picker" role="group" aria-label="Choose overview month">
        <button type="button" aria-label={`Show ${formatMonth(priorMonth)}`} onClick={() => onMonthChange(priorMonth)}>
          <ChevronLeft aria-hidden="true" size={19} />
        </button>
        <span aria-live="polite">
          <small>Viewing</small>
          <strong>{formatMonth(month)}</strong>
        </span>
        <button
          type="button"
          aria-label={`Show ${formatMonth(followingMonth)}`}
          onClick={() => onMonthChange(followingMonth)}
        >
          <ChevronRight aria-hidden="true" size={19} />
        </button>
      </div>
      <Button
        className="dashboard-header-add"
        variant="primary"
        aria-label="Add transaction"
        onClick={onAddTransaction}
      >
        <Plus aria-hidden="true" size={18} />
        <span>Add transaction</span>
      </Button>
    </div>
  );

  if (loading) {
    return (
      <div className="dashboard page-enter" aria-busy="true">
        <PageHeader
          eyebrow="Monthly overview"
          title="A clear view of your money"
          description="Follow income, spending, budgets, and what is coming next."
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
          eyebrow="Monthly overview"
          title="A clear view of your money"
          description="Follow income, spending, budgets, and what is coming next."
          actions={headerActions}
        />
        <Card className="dashboard-empty">
          <EmptyState
            icon={<WalletCards aria-hidden="true" size={27} />}
            title={`Nothing to tally in ${formatMonth(month)} yet`}
            description="Add the first transaction to start your monthly picture. This draft uses synthetic demo data only."
            action={
              <Button variant="primary" onClick={onAddTransaction}>
                <Plus aria-hidden="true" size={18} />
                Add transaction
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const budgetProgress = summary.budgetTotalMinor > 0 ? summary.spendingMinor / summary.budgetTotalMinor : 0;
  const budgetDetail =
    summary.budgetTotalMinor === 0
      ? 'No monthly budget set'
      : summary.budgetRemainingMinor >= 0
        ? `${formatPercent(summary.budgetRemainingMinor / summary.budgetTotalMinor)} of the budget available`
        : `${formatMoney(Math.abs(summary.budgetRemainingMinor))} over the monthly budget`;

  return (
    <div className="dashboard page-enter">
      <PageHeader
        eyebrow="Monthly overview"
        title="A clear view of your money"
        description={`${summary.transactionCount} synthetic transactions shape the picture for ${formatMonth(month)}.`}
        actions={headerActions}
      />

      {summary.uncategorisedSpendingMinor > 0 ? (
        <aside className="dashboard-warning" aria-labelledby="uncategorised-title">
          <span className="dashboard-warning__icon" aria-hidden="true">
            <CircleAlert size={21} />
          </span>
          <div>
            <h2 id="uncategorised-title">A small detail needs attention</h2>
            <p>
              <Money amountMinor={summary.uncategorisedSpendingMinor} /> of spending is uncategorised. Assigning it will
              make the budget view more accurate.
            </p>
          </div>
        </aside>
      ) : null}

      <section className="dashboard-stats" aria-label="Monthly totals">
        <StatCard
          label="Income"
          amountMinor={summary.incomeMinor}
          icon={Landmark}
          tone="income"
          detail={`${summary.transactionCount} transactions recorded this month`}
        />
        <StatCard
          label="Spending"
          amountMinor={summary.spendingMinor}
          icon={BadgePoundSterling}
          tone="spending"
          detail={`${formatCompactMoney(summary.budgetTotalMinor)} monthly budget`}
          progress={budgetProgress}
        />
        <StatCard
          label="Net cash flow"
          amountMinor={summary.netCashFlowMinor}
          icon={Sparkles}
          tone="net"
          signed
          detail={`${formatMoney(summary.investmentDebitsMinor)} directed to investments`}
        />
        <StatCard
          label="Budget remaining"
          amountMinor={summary.budgetRemainingMinor}
          icon={PiggyBank}
          tone="budget"
          detail={budgetDetail}
        />
      </section>

      <section className="dashboard-insights" aria-label="Spending insights">
        <SpendingTrend summary={summary} />
        <Card className="dashboard-comparisons">
          <header className="card__header dashboard-card-header">
            <div>
              <span className="eyebrow">Momentum</span>
              <h2>Spending pulse</h2>
              <p>Comparable periods show the direction of travel.</p>
            </div>
          </header>
          <div className="comparison-list">
            <ComparisonBlock
              label="Week over week"
              description="Last 7 completed days"
              comparison={summary.weekOverWeek}
            />
            <ComparisonBlock
              label="Month over month"
              description="Against the prior month"
              comparison={summary.monthOverMonth}
            />
          </div>
        </Card>
      </section>

      <section className="dashboard-details" aria-label="Overview details">
        <Card className="dashboard-detail-card">
          <header className="card__header dashboard-card-header">
            <div>
              <span className="eyebrow">Guardrails</span>
              <h2>Category budgets</h2>
              <p>Highest spending categories first.</p>
            </div>
            <Badge tone={budgetProgress > 1 ? 'negative' : budgetProgress > 0.75 ? 'warning' : 'positive'}>
              {formatPercent(budgetProgress)} used
            </Badge>
          </header>
          <BudgetList summary={summary} />
        </Card>

        <Card className="dashboard-detail-card">
          <header className="card__header dashboard-card-header">
            <div>
              <span className="eyebrow">Latest activity</span>
              <h2>Recent transactions</h2>
              <p>Select an entry to see or edit its details.</p>
            </div>
            <Badge>{summary.recentTransactions.length}</Badge>
          </header>
          <RecentTransactions transactions={summary.recentTransactions} onOpen={onOpenTransaction} />
        </Card>

        <Card className="dashboard-detail-card dashboard-schedules-card">
          <header className="card__header dashboard-card-header">
            <div>
              <span className="eyebrow">On the horizon</span>
              <h2>Upcoming schedules</h2>
              <p>Planned entries waiting ahead.</p>
            </div>
            <CalendarClock aria-hidden="true" className="dashboard-header-icon" size={21} />
          </header>
          <UpcomingSchedules schedules={schedules} />
        </Card>
      </section>
    </div>
  );
}
