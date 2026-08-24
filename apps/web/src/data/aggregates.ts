import {
  MockApiError,
  type Budget,
  type BudgetDefault,
  type BudgetProgress,
  type Category,
  type CategorySpending,
  type DailySpending,
  type DashboardSummary,
  type LocalDate,
  type Month,
  type SpendingComparison,
  type Transaction,
} from './types';

export function formatDate(date: Date): LocalDate {
  return date.toISOString().slice(0, 10) as LocalDate;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return formatDate(value);
}

export function previousMonth(month: Month): Month {
  const value = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1));
  return value.toISOString().slice(0, 7) as Month;
}

export function monthStart(month: Month): LocalDate {
  return `${month}-01` as LocalDate;
}

export function lastDateOfMonth(month: Month): LocalDate {
  const value = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  return formatDate(value);
}

// Amounts are signed, so a total is a plain sum. Spending and investment read
// naturally as positive magnitudes, which is the only place a sign is flipped.
export function totalByKind(transactions: readonly Transaction[], kind: Transaction['kind']): number {
  const total = transactions
    .filter((transaction) => transaction.kind === kind)
    .reduce((running, transaction) => running + transaction.amountMinor, 0);
  return kind === 'INCOME' ? total : -total;
}

export function totalAmount(transactions: readonly Transaction[]): number {
  return transactions.reduce((total, transaction) => total + transaction.amountMinor, 0);
}

export function spendingWithin(transactions: readonly Transaction[], from: LocalDate, to: LocalDate): number {
  return totalByKind(
    transactions.filter((transaction) => transaction.localDate >= from && transaction.localDate <= to),
    'SPENDING',
  );
}

export function spendingByCategory(transactions: readonly Transaction[]): Map<string | null, number> {
  const totals = new Map<string | null, number>();
  for (const transaction of transactions) {
    if (transaction.kind !== 'SPENDING') continue;
    const current = totals.get(transaction.categoryId) ?? 0;
    totals.set(transaction.categoryId, current - transaction.amountMinor);
  }
  return totals;
}

export function comparison(currentMinor: number, previousMinor: number): SpendingComparison {
  if (previousMinor === 0) {
    return { currentMinor, previousMinor, changePercent: null, direction: 'NOT_COMPARABLE' };
  }
  const changePercent = Math.round(((currentMinor - previousMinor) / previousMinor) * 1_000) / 10;
  const direction = changePercent === 0 ? 'FLAT' : changePercent > 0 ? 'UP' : 'DOWN';
  return { currentMinor, previousMinor, changePercent, direction };
}

function categoryIndex(categories: readonly Category[]): ReadonlyMap<string, Category> {
  return new Map(categories.map((category) => [category.id, category]));
}

function requireCategory(index: ReadonlyMap<string, Category>, id: string): Category {
  const category = index.get(id);
  if (!category) throw new MockApiError('NOT_FOUND', 'Category not found.');
  return category;
}

export function dailySpending(month: Month, today: LocalDate, transactions: readonly Transaction[]): DailySpending[] {
  const finalDate = month === today.slice(0, 7) ? today : lastDateOfMonth(month);
  const days = Number(finalDate.slice(8, 10));
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.kind !== 'SPENDING') continue;
    totals.set(transaction.localDate, (totals.get(transaction.localDate) ?? 0) - transaction.amountMinor);
  }

  return Array.from({ length: days }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}` as LocalDate;
    return { date, amountMinor: totals.get(date) ?? 0 };
  });
}

export function categorySpending(
  spentByCategory: ReadonlyMap<string | null, number>,
  categories: readonly Category[],
): CategorySpending[] {
  const index = categoryIndex(categories);
  return [...spentByCategory.entries()]
    .map(([categoryId, amountMinor]) => {
      const category = categoryId === null ? null : requireCategory(index, categoryId);
      return {
        categoryId,
        categoryName: category?.name ?? 'Uncategorised',
        colour: category?.colour ?? '#a8adb7',
        amountMinor,
      };
    })
    .sort((left, right) => right.amountMinor - left.amountMinor);
}

export interface BudgetProgressInput {
  readonly month: Month;
  readonly budgets: readonly Budget[];
  readonly budgetDefaults: readonly BudgetDefault[];
  readonly categories: readonly Category[];
  readonly spentByCategory: ReadonlyMap<string | null, number>;
}

export function budgetProgress(input: BudgetProgressInput): BudgetProgress[] {
  type BudgetRow = Pick<BudgetProgress, 'id' | 'month' | 'categoryId' | 'limitMinor' | 'version'>;

  const rows: BudgetRow[] = input.budgets
    .filter((budget) => budget.month === input.month)
    .map((budget) => ({
      id: budget.id,
      month: budget.month,
      categoryId: budget.categoryId,
      limitMinor: budget.limitMinor,
      version: budget.version,
    }));

  for (const budgetDefault of input.budgetDefaults) {
    if (rows.some((row) => row.categoryId === budgetDefault.categoryId)) continue;
    rows.push({
      id: `budget-${input.month}-${budgetDefault.categoryId}`,
      month: input.month,
      categoryId: budgetDefault.categoryId,
      limitMinor: budgetDefault.limitMinor,
      version: null,
    });
  }

  const index = categoryIndex(input.categories);
  return rows
    .map((row) => {
      const category = requireCategory(index, row.categoryId);
      const spentMinor = input.spentByCategory.get(row.categoryId) ?? 0;
      return {
        ...row,
        categoryName: category.name,
        colour: category.colour,
        spentMinor,
        remainingMinor: row.limitMinor - spentMinor,
        percentUsed:
          row.limitMinor === 0 ? (spentMinor === 0 ? 0 : 100) : Math.round((spentMinor / row.limitMinor) * 100),
      };
    })
    .sort((left, right) => right.spentMinor - left.spentMinor);
}

function comparisonWindows(month: Month, today: LocalDate) {
  const monthEnd = lastDateOfMonth(month);
  const lastComparableDate = month === today.slice(0, 7) ? addDays(today, -1) : monthEnd;
  const currentWeekStart = addDays(lastComparableDate, -6);
  const previousWeekEnd = addDays(currentWeekStart, -1);
  const previousWeekStart = addDays(previousWeekEnd, -6);
  return { monthEnd, lastComparableDate, currentWeekStart, previousWeekEnd, previousWeekStart };
}

export function ledgerWindowFor(month: Month, today: LocalDate): { from: LocalDate; to: LocalDate } {
  const { monthEnd, previousWeekStart } = comparisonWindows(month, today);
  const priorMonthStart = monthStart(previousMonth(month));
  return { from: previousWeekStart < priorMonthStart ? previousWeekStart : priorMonthStart, to: monthEnd };
}

export interface MonthSummaryInput {
  readonly month: Month;
  readonly today: LocalDate;
  readonly asOf: string;
  readonly ledgerWindow: readonly Transaction[];
  readonly budgets: readonly Budget[];
  readonly budgetDefaults: readonly BudgetDefault[];
  readonly categories: readonly Category[];
}

export function summariseMonth(input: MonthSummaryInput): DashboardSummary {
  const { month, today, ledgerWindow } = input;
  const priorMonth = previousMonth(month);
  const windows = comparisonWindows(month, today);

  const transactions = ledgerWindow.filter((transaction) => transaction.localDate.startsWith(month));
  const priorMonthTransactions = ledgerWindow.filter((transaction) => transaction.localDate.startsWith(priorMonth));
  const spentByCategory = spendingByCategory(transactions);

  const spendingMinor = totalByKind(transactions, 'SPENDING');
  const budgets = budgetProgress({
    month,
    budgets: input.budgets,
    budgetDefaults: input.budgetDefaults,
    categories: input.categories,
    spentByCategory,
  });
  const budgetTotalMinor = budgets.reduce((total, budget) => total + budget.limitMinor, 0);
  const budgetedSpendingMinor = budgets.reduce((total, budget) => total + budget.spentMinor, 0);

  return {
    month,
    asOf: input.asOf,
    incomeMinor: totalByKind(transactions, 'INCOME'),
    spendingMinor,
    investmentCreditsMinor: totalAmount(
      transactions.filter((transaction) => transaction.kind === 'INVESTMENT' && transaction.amountMinor > 0),
    ),
    investmentDebitsMinor: -totalAmount(
      transactions.filter((transaction) => transaction.kind === 'INVESTMENT' && transaction.amountMinor < 0),
    ),
    netCashFlowMinor: totalAmount(transactions),
    budgetTotalMinor,
    budgetedSpendingMinor,
    budgetRemainingMinor: budgetTotalMinor - budgetedSpendingMinor,
    uncategorisedSpendingMinor: spentByCategory.get(null) ?? 0,
    transactionCount: transactions.length,
    weekOverWeek: comparison(
      spendingWithin(ledgerWindow, windows.currentWeekStart, windows.lastComparableDate),
      spendingWithin(ledgerWindow, windows.previousWeekStart, windows.previousWeekEnd),
    ),
    monthOverMonth: comparison(spendingMinor, totalByKind(priorMonthTransactions, 'SPENDING')),
    dailySpending: dailySpending(month, today, transactions),
    spendingByCategory: categorySpending(spentByCategory, input.categories),
    budgets,
    recentTransactions: [...transactions]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 6),
  };
}
