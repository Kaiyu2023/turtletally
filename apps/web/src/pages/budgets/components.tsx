import { CalendarRange, CirclePoundSterling, Pencil, Plus, Sparkles } from 'lucide-react';
import type { SubmitEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  IconButton,
  Modal,
  ProgressBar,
  Skeleton,
} from '../../components/Ui';
import type { BudgetDefault, BudgetProgress, Category, Month } from '../../data/types';
import { useLocale, useMessages } from '../../i18n/locale';
import { budgetsMessages } from './messages';

export type BudgetView = 'month' | 'defaults';

export type BudgetEditor = {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly valueMinor: number;
  readonly version: number | null;
  readonly mode: 'month' | 'default';
};

export function BudgetMonthSwitcher({
  month,
  onPrevious,
  onNext,
}: {
  readonly month: Month;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}) {
  const t = useMessages(budgetsMessages);
  const { format } = useLocale();

  return (
    <div className="month-switcher" aria-label={t('budgetMonth')}>
      <button type="button" aria-label={t('previousMonth')} onClick={onPrevious}>
        ‹
      </button>
      <span>
        <CalendarRange aria-hidden="true" size={16} />
        {format.month(month)}
      </span>
      <button type="button" aria-label={t('nextMonth')} onClick={onNext}>
        ›
      </button>
    </div>
  );
}

export function BudgetViewTabs({
  view,
  onViewChange,
}: {
  readonly view: BudgetView;
  readonly onViewChange: (view: BudgetView) => void;
}) {
  const t = useMessages(budgetsMessages);

  return (
    <div className="segmented view-tabs" aria-label={t('budgetView')}>
      <button type="button" aria-pressed={view === 'month'} onClick={() => onViewChange('month')}>
        {t('thisMonth')}
      </button>
      <button type="button" aria-pressed={view === 'defaults'} onClick={() => onViewChange('defaults')}>
        {t('monthlyDefaults')}
      </button>
    </div>
  );
}

export function BudgetTotals({
  totalLimit,
  totalSpent,
  totalRemaining,
  categoryCount,
}: {
  readonly totalLimit: number;
  readonly totalSpent: number;
  readonly totalRemaining: number;
  readonly categoryCount: number;
}) {
  const t = useMessages(budgetsMessages);
  const { format } = useLocale();

  return (
    <section className="metric-grid metric-grid--three" aria-label={t('budgetTotals')}>
      <Card className="metric-card page-enter">
        <span className="metric-card__icon">
          <CirclePoundSterling aria-hidden="true" />
        </span>
        <span className="metric-card__label">{t('planned')}</span>
        <strong>{format.money(totalLimit)}</strong>
        <small>
          {categoryCount === 1
            ? t('acrossOneCategory')
            : t('acrossCategories', { count: format.number(categoryCount) })}
        </small>
      </Card>
      <Card className="metric-card page-enter">
        <span className="metric-card__icon metric-card__icon--amber">
          <Sparkles aria-hidden="true" />
        </span>
        <span className="metric-card__label">{t('spent')}</span>
        <strong>{format.money(totalSpent)}</strong>
        <small>{t('planUsed', { percent: format.percent(totalLimit ? totalSpent / totalLimit : 0) })}</small>
      </Card>
      <Card className="metric-card page-enter">
        <span className="metric-card__icon metric-card__icon--green">
          <Plus aria-hidden="true" />
        </span>
        <span className="metric-card__label">{t('remaining')}</span>
        <strong className={totalRemaining < 0 ? 'negative' : 'positive'}>{format.money(totalRemaining)}</strong>
        <small>{totalRemaining < 0 ? t('rebalance') : t('availableThisMonth')}</small>
      </Card>
    </section>
  );
}

function MonthlyBudgetRow({
  budget,
  onEdit,
}: {
  readonly budget: BudgetProgress;
  readonly onEdit: (budget: BudgetProgress) => void;
}) {
  const t = useMessages(budgetsMessages);
  const { format } = useLocale();
  const ratio = budget.limitMinor > 0 ? budget.spentMinor / budget.limitMinor : budget.spentMinor > 0 ? 1 : 0;

  return (
    <article className="budget-plan-row">
      <span className="category-dot" style={{ background: budget.colour }} aria-hidden="true" />
      <div className="budget-plan-row__details">
        <div>
          <strong>{budget.categoryName}</strong>
          <span>
            {t('spentOfLimit', { spent: format.money(budget.spentMinor), limit: format.money(budget.limitMinor) })}
          </span>
        </div>
        <ProgressBar
          value={ratio}
          label={t('budgetUsedLabel', { name: budget.categoryName, percent: format.percent(ratio) })}
          tone={ratio > 1 ? 'negative' : ratio > 0.8 ? 'warning' : 'primary'}
        />
      </div>
      <span className={budget.remainingMinor < 0 ? 'negative money' : 'positive money'}>
        {budget.remainingMinor < 0
          ? t('amountOver', { amount: format.money(Math.abs(budget.remainingMinor)) })
          : t('amountLeft', { amount: format.money(budget.remainingMinor) })}
      </span>
      <IconButton aria-label={t('editBudget', { name: budget.categoryName })} onClick={() => onEdit(budget)}>
        <Pencil aria-hidden="true" size={17} />
      </IconButton>
    </article>
  );
}

export function MonthlyBudgetPlan({
  month,
  budgets,
  loading,
  totalRemaining,
  onEdit,
}: {
  readonly month: Month;
  readonly budgets: readonly BudgetProgress[];
  readonly loading: boolean;
  readonly totalRemaining: number;
  readonly onEdit: (budget: BudgetProgress) => void;
}) {
  const t = useMessages(budgetsMessages);
  const { format } = useLocale();

  return (
    <Card className="content-card">
      <CardHeader
        title={t('categoryPlan')}
        description={t('monthlyChanges', { month: format.month(month) })}
        action={
          <Badge tone={totalRemaining < 0 ? 'negative' : 'positive'}>
            {totalRemaining < 0 ? t('overPlan') : t('onTrack')}
          </Badge>
        }
      />
      {loading ? (
        <Skeleton lines={6} />
      ) : budgets.length === 0 ? (
        <EmptyState title={t('noMonthlyBudgets')} description={t('noMonthlyBudgetsDescription')} />
      ) : (
        <div className="budget-plan-list">
          {budgets.map((budget) => (
            <MonthlyBudgetRow key={budget.id} budget={budget} onEdit={onEdit} />
          ))}
        </div>
      )}
    </Card>
  );
}

function BudgetDefaultRow({
  category,
  value,
  onEdit,
}: {
  readonly category: Category;
  readonly value: BudgetDefault | undefined;
  readonly onEdit: (category: Category, value: BudgetDefault | undefined) => void;
}) {
  const t = useMessages(budgetsMessages);
  const { format } = useLocale();

  return (
    <article className="budget-plan-row">
      <span className="category-dot" style={{ background: category.colour }} aria-hidden="true" />
      <div className="budget-plan-row__details">
        <strong>{category.name}</strong>
        <small>{category.group}</small>
      </div>
      <span className="money">{value ? format.money(value.limitMinor) : t('notSet')}</span>
      <IconButton aria-label={t('editDefault', { name: category.name })} onClick={() => onEdit(category, value)}>
        <Pencil aria-hidden="true" size={17} />
      </IconButton>
    </article>
  );
}

export function BudgetDefaults({
  categories,
  defaults,
  loading,
  onEdit,
}: {
  readonly categories: readonly Category[];
  readonly defaults: readonly BudgetDefault[];
  readonly loading: boolean;
  readonly onEdit: (category: Category, value: BudgetDefault | undefined) => void;
}) {
  const t = useMessages(budgetsMessages);

  return (
    <Card className="content-card">
      <div className="future-note">
        <Sparkles aria-hidden="true" />
        <div>
          <strong>{t('defaultsShapeFuture')}</strong>
          <p>{t('defaultsDoNotRewrite')}</p>
        </div>
      </div>
      <CardHeader title={t('reusableDefaults')} description={t('defaultsDescription')} />
      {loading ? (
        <Skeleton lines={7} />
      ) : (
        <div className="budget-plan-list">
          {categories.map((category) => {
            const value = defaults.find((item) => item.categoryId === category.id);
            return <BudgetDefaultRow key={category.id} category={category} value={value} onEdit={onEdit} />;
          })}
        </div>
      )}
    </Card>
  );
}

export function BudgetEditorModal({
  editor,
  month,
  amount,
  amountError,
  busy,
  onClose,
  onAmountChange,
  onSubmit,
}: {
  readonly editor: BudgetEditor | null;
  readonly month: Month;
  readonly amount: string;
  readonly amountError: string;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onAmountChange: (value: string) => void;
  readonly onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}) {
  const t = useMessages(budgetsMessages);
  const { format } = useLocale();

  return (
    <Modal
      open={editor !== null}
      title={t('editNamedCategory', { name: editor?.categoryName ?? '' })}
      description={
        editor?.mode === 'default'
          ? t('defaultEditorDescription')
          : t('monthlyEditorDescription', { month: format.month(month) })
      }
      size="small"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" busy={busy} form="budget-form">
            {t('saveBudget')}
          </Button>
        </>
      }
    >
      <form id="budget-form" className="field" onSubmit={onSubmit} noValidate>
        <label htmlFor="budget-amount">{t('monthlyAmount')}</label>
        <div className="input-prefix">
          <span>£</span>
          <input
            id="budget-amount"
            inputMode="decimal"
            value={amount}
            aria-invalid={Boolean(amountError)}
            aria-describedby={amountError ? 'budget-amount-error' : undefined}
            onChange={(event) => onAmountChange(event.target.value)}
          />
        </div>
        {amountError ? (
          <span id="budget-amount-error" className="field__error">
            {amountError}
          </span>
        ) : null}
      </form>
    </Modal>
  );
}
