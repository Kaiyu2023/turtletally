import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarRange, CirclePoundSterling, Pencil, Plus, Sparkles } from 'lucide-react';
import { useApp } from '../app/AppContext';
import type { BudgetDefault, BudgetProgress, Category, Month } from '../data/types';
import { formatMoney, formatMonth, nextMonth, parseGbpInput, previousMonth, toGbpInput } from '../utils/format';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, ProgressBar, Skeleton } from '../components/Ui';
import './pages.css';

type BudgetEditor = {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly valueMinor: number;
  readonly version: number | null;
  readonly mode: 'month' | 'default';
};

export function BudgetsPage() {
  const { api, refreshToken, refresh, notify } = useApp();
  const [month, setMonth] = useState<Month>('2026-08');
  const [view, setView] = useState<'month' | 'defaults'>('month');
  const [budgets, setBudgets] = useState<BudgetProgress[]>([]);
  const [defaults, setDefaults] = useState<BudgetDefault[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<BudgetEditor | null>(null);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([api.listBudgets(month), api.listBudgetDefaults(), api.listCategories()])
      .then(([nextBudgets, nextDefaults, nextCategories]) => {
        if (!active) return;
        setBudgets(nextBudgets);
        setDefaults(nextDefaults);
        setCategories(nextCategories);
      })
      .catch((error: unknown) =>
        notify(error instanceof Error ? error.message : 'Budgets could not be loaded.', 'error'),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, month, notify, refreshToken]);

  const spendingCategories = useMemo(
    () => categories.filter((category) => category.group !== 'Income' && category.group !== 'Investment'),
    [categories],
  );
  const totalLimit = budgets.reduce((total, budget) => total + budget.limitMinor, 0);
  const totalSpent = budgets.reduce((total, budget) => total + budget.spentMinor, 0);
  const totalRemaining = totalLimit - totalSpent;

  function openEditor(nextEditor: BudgetEditor) {
    setEditor(nextEditor);
    setAmount(toGbpInput(nextEditor.valueMinor));
    setAmountError('');
  }

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const limitMinor = amount.trim() === '0' || amount.trim() === '0.00' ? 0 : parseGbpInput(amount);
    if (limitMinor === null) {
      setAmountError('Enter zero or a positive GBP amount with up to two decimal places.');
      return;
    }

    setBusy(true);
    try {
      if (editor.mode === 'month') {
        await api.setBudget({ month, categoryId: editor.categoryId, limitMinor, expectedVersion: editor.version });
        notify(`${editor.categoryName} budget updated for ${formatMonth(month)}.`);
      } else {
        await api.setBudgetDefault({ categoryId: editor.categoryId, limitMinor, expectedVersion: editor.version });
        notify(`${editor.categoryName} default updated for future months.`);
      }
      setEditor(null);
      refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Budget could not be updated.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Plan with breathing room"
        title="Budgets"
        description="Set a spending plan for this month or tune the defaults used when future months begin."
        actions={
          <div className="month-switcher" aria-label="Budget month">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(previousMonth(month))}>
              ‹
            </button>
            <span>
              <CalendarRange aria-hidden="true" size={16} />
              {formatMonth(month)}
            </span>
            <button type="button" aria-label="Next month" onClick={() => setMonth(nextMonth(month))}>
              ›
            </button>
          </div>
        }
      />

      <div className="segmented view-tabs" aria-label="Budget view">
        <button type="button" aria-pressed={view === 'month'} onClick={() => setView('month')}>
          This month
        </button>
        <button type="button" aria-pressed={view === 'defaults'} onClick={() => setView('defaults')}>
          Monthly defaults
        </button>
      </div>

      {view === 'month' ? (
        <>
          <section className="metric-grid metric-grid--three" aria-label="Budget totals">
            <Card className="metric-card page-enter">
              <span className="metric-card__icon">
                <CirclePoundSterling aria-hidden="true" />
              </span>
              <span className="metric-card__label">Planned</span>
              <strong>{formatMoney(totalLimit)}</strong>
              <small>Across {budgets.length} categories</small>
            </Card>
            <Card className="metric-card page-enter">
              <span className="metric-card__icon metric-card__icon--amber">
                <Sparkles aria-hidden="true" />
              </span>
              <span className="metric-card__label">Spent</span>
              <strong>{formatMoney(totalSpent)}</strong>
              <small>{totalLimit ? Math.round((totalSpent / totalLimit) * 100) : 0}% of plan used</small>
            </Card>
            <Card className="metric-card page-enter">
              <span className="metric-card__icon metric-card__icon--green">
                <Plus aria-hidden="true" />
              </span>
              <span className="metric-card__label">Remaining</span>
              <strong className={totalRemaining < 0 ? 'negative' : 'positive'}>{formatMoney(totalRemaining)}</strong>
              <small>{totalRemaining < 0 ? 'Time to rebalance' : 'Available this month'}</small>
            </Card>
          </section>

          <Card className="content-card">
            <div className="card__header">
              <div>
                <h2>Category plan</h2>
                <p>Monthly changes affect only {formatMonth(month)}.</p>
              </div>
              <Badge tone={totalRemaining < 0 ? 'negative' : 'positive'}>
                {totalRemaining < 0 ? 'Over plan' : 'On track'}
              </Badge>
            </div>
            {loading ? (
              <Skeleton lines={6} />
            ) : budgets.length === 0 ? (
              <EmptyState
                title="No monthly budgets yet"
                description="Add a monthly default, then return here to shape this month."
              />
            ) : (
              <div className="budget-plan-list">
                {budgets.map((budget) => {
                  const ratio =
                    budget.limitMinor > 0 ? budget.spentMinor / budget.limitMinor : budget.spentMinor > 0 ? 1 : 0;
                  return (
                    <article className="budget-plan-row" key={budget.id}>
                      <span className="category-dot" style={{ background: budget.colour }} aria-hidden="true" />
                      <div className="budget-plan-row__details">
                        <div>
                          <strong>{budget.categoryName}</strong>
                          <span>
                            {formatMoney(budget.spentMinor)} of {formatMoney(budget.limitMinor)}
                          </span>
                        </div>
                        <ProgressBar
                          value={ratio}
                          label={`${budget.categoryName}: ${Math.round(ratio * 100)}% used`}
                          tone={ratio > 1 ? 'negative' : ratio > 0.8 ? 'warning' : 'primary'}
                        />
                      </div>
                      <span className={budget.remainingMinor < 0 ? 'negative money' : 'positive money'}>
                        {budget.remainingMinor < 0
                          ? `${formatMoney(Math.abs(budget.remainingMinor))} over`
                          : `${formatMoney(budget.remainingMinor)} left`}
                      </span>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Edit ${budget.categoryName} budget`}
                        onClick={() =>
                          openEditor({
                            categoryId: budget.categoryId,
                            categoryName: budget.categoryName,
                            valueMinor: budget.limitMinor,
                            version: budget.version,
                            mode: 'month',
                          })
                        }
                      >
                        <Pencil aria-hidden="true" size={17} />
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card className="content-card">
          <div className="future-note">
            <Sparkles aria-hidden="true" />
            <div>
              <strong>Defaults shape future months</strong>
              <p>Changing a default never rewrites an existing monthly budget.</p>
            </div>
          </div>
          <div className="card__header">
            <div>
              <h2>Reusable monthly defaults</h2>
              <p>Choose a calm starting point for every new month.</p>
            </div>
          </div>
          {loading ? (
            <Skeleton lines={7} />
          ) : (
            <div className="budget-plan-list">
              {spendingCategories.map((category) => {
                const value = defaults.find((item) => item.categoryId === category.id);
                return (
                  <article className="budget-plan-row" key={category.id}>
                    <span className="category-dot" style={{ background: category.colour }} aria-hidden="true" />
                    <div className="budget-plan-row__details">
                      <strong>{category.name}</strong>
                      <small>{category.group}</small>
                    </div>
                    <span className="money">{value ? formatMoney(value.limitMinor) : 'Not set'}</span>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Edit ${category.name} default`}
                      onClick={() =>
                        openEditor({
                          categoryId: category.id,
                          categoryName: category.name,
                          valueMinor: value?.limitMinor ?? 0,
                          version: value?.version ?? null,
                          mode: 'default',
                        })
                      }
                    >
                      <Pencil aria-hidden="true" size={17} />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <Modal
        open={editor !== null}
        title={`Edit ${editor?.categoryName ?? ''}`}
        description={
          editor?.mode === 'default'
            ? 'This applies only to future months.'
            : `This changes ${formatMonth(month)} only.`
        }
        size="small"
        onClose={() => setEditor(null)}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" busy={busy} form="budget-form">
              Save budget
            </Button>
          </>
        }
      >
        <form id="budget-form" className="field" onSubmit={(event) => void saveBudget(event)} noValidate>
          <label htmlFor="budget-amount">Monthly amount</label>
          <div className="input-prefix">
            <span>£</span>
            <input
              id="budget-amount"
              inputMode="decimal"
              value={amount}
              aria-invalid={Boolean(amountError)}
              aria-describedby={amountError ? 'budget-amount-error' : undefined}
              onChange={(event) => {
                setAmount(event.target.value);
                setAmountError('');
              }}
            />
          </div>
          {amountError ? (
            <span id="budget-amount-error" className="field__error">
              {amountError}
            </span>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
