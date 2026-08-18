import { useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { PageHeader } from '../../components/Ui';
import { useApp } from '../../app/AppContext';
import type { BudgetDefault, BudgetProgress, Category, Month } from '../../data/types';
import { useLocale, useMessages } from '../../i18n/locale';
import { nextMonth, parseGbpInput, previousMonth, toGbpInput } from '../../utils/format';
import {
  BudgetDefaults,
  BudgetEditorModal,
  BudgetMonthSwitcher,
  BudgetTotals,
  BudgetViewTabs,
  MonthlyBudgetPlan,
  type BudgetEditor,
  type BudgetView,
} from './components';
import { budgetsMessages } from './messages';
import './styles.css';

export function BudgetsPage() {
  const { api, refreshToken, refresh, notify } = useApp();
  const t = useMessages(budgetsMessages);
  const { format } = useLocale();
  const [month, setMonth] = useState<Month>('2026-08');
  const [view, setView] = useState<BudgetView>('month');
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
      .catch(() => notify(t('loadError'), 'error'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, month, notify, refreshToken, t]);

  const spendingCategories = useMemo(
    () => categories.filter((category) => category.group !== 'Income' && category.group !== 'Investment'),
    [categories],
  );
  const totalLimit = budgets.reduce((total, budget) => total + budget.limitMinor, 0);
  const totalSpent = budgets.reduce((total, budget) => total + budget.spentMinor, 0);
  const totalRemaining = totalLimit - totalSpent;
  const priorMonth = previousMonth(month);
  const followingMonth = nextMonth(month);

  function openEditor(nextEditor: BudgetEditor) {
    setEditor(nextEditor);
    setAmount(toGbpInput(nextEditor.valueMinor));
    setAmountError('');
  }

  function openMonthlyEditor(budget: BudgetProgress) {
    openEditor({
      categoryId: budget.categoryId,
      categoryName: budget.categoryName,
      valueMinor: budget.limitMinor,
      version: budget.version,
      mode: 'month',
    });
  }

  function openDefaultEditor(category: Category, value: BudgetDefault | undefined) {
    openEditor({
      categoryId: category.id,
      categoryName: category.name,
      valueMinor: value?.limitMinor ?? 0,
      version: value?.version ?? null,
      mode: 'default',
    });
  }

  function changeAmount(value: string) {
    setAmount(value);
    setAmountError('');
  }

  async function saveBudget(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const limitMinor = amount.trim() === '0' || amount.trim() === '0.00' ? 0 : parseGbpInput(amount);
    if (limitMinor === null) {
      setAmountError(t('invalidAmount'));
      return;
    }

    setBusy(true);
    try {
      if (editor.mode === 'month') {
        await api.setBudget({ month, categoryId: editor.categoryId, limitMinor, expectedVersion: editor.version });
        notify(t('monthlyUpdated', { name: editor.categoryName, month: format.month(month) }));
      } else {
        await api.setBudgetDefault({ categoryId: editor.categoryId, limitMinor, expectedVersion: editor.version });
        notify(t('defaultUpdated', { name: editor.categoryName }));
      }
      setEditor(null);
      refresh();
    } catch {
      notify(t('updateError'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('pageDescription')}
        actions={
          <BudgetMonthSwitcher
            month={month}
            onPrevious={() => setMonth(priorMonth)}
            onNext={() => setMonth(followingMonth)}
          />
        }
      />

      <BudgetViewTabs view={view} onViewChange={setView} />

      {view === 'month' ? (
        <>
          <BudgetTotals
            totalLimit={totalLimit}
            totalSpent={totalSpent}
            totalRemaining={totalRemaining}
            categoryCount={budgets.length}
          />
          <MonthlyBudgetPlan
            month={month}
            budgets={budgets}
            loading={loading}
            totalRemaining={totalRemaining}
            onEdit={openMonthlyEditor}
          />
        </>
      ) : (
        <BudgetDefaults
          categories={spendingCategories}
          defaults={defaults}
          loading={loading}
          onEdit={openDefaultEditor}
        />
      )}

      <BudgetEditorModal
        editor={editor}
        month={month}
        amount={amount}
        amountError={amountError}
        busy={busy}
        onClose={() => setEditor(null)}
        onAmountChange={changeAmount}
        onSubmit={(event) => void saveBudget(event)}
      />
    </div>
  );
}
