import { describe, expect, it } from 'vitest';
import {
  addDays,
  budgetProgress,
  comparison,
  dailySpending,
  lastDateOfMonth,
  ledgerWindowFor,
  monthStart,
  previousMonth,
  spendingByCategory,
  summariseMonth,
  totalByKind,
} from './aggregates';
import { createMockFixtures, MOCK_NOW, MOCK_TODAY } from './fixtures';
import type { Category, LocalDate, Month, Transaction } from './types';

const MONTH: Month = '2026-08';
const TODAY: LocalDate = MOCK_TODAY;

function fixtureSummary(month: Month = MONTH) {
  const state = createMockFixtures();
  const window = ledgerWindowFor(month, TODAY);
  return summariseMonth({
    month,
    today: TODAY,
    asOf: MOCK_NOW,
    ledgerWindow: state.transactions.filter(
      (transaction) =>
        transaction.voidedAt === null && transaction.localDate >= window.from && transaction.localDate <= window.to,
    ),
    budgets: state.budgets,
    budgetDefaults: state.budgetDefaults,
    categories: state.categories,
  });
}

describe('summariseMonth over the default fixtures', () => {
  it('pins the headline figures for 2026-08', () => {
    const summary = fixtureSummary();

    expect(summary).toMatchObject({
      month: MONTH,
      asOf: MOCK_NOW,
      incomeMinor: 342_500,
      spendingMinor: 169_492,
      investmentCreditsMinor: 1_250,
      investmentDebitsMinor: 25_000,
      netCashFlowMinor: 149_258,
      budgetTotalMinor: 230_500,
      budgetedSpendingMinor: 169_492,
      budgetRemainingMinor: 61_008,
      uncategorisedSpendingMinor: 0,
      transactionCount: 19,
    });
  });

  it('pins the comparison windows', () => {
    const summary = fixtureSummary();

    expect(summary.weekOverWeek).toEqual({
      currentMinor: 22_973,
      previousMinor: 25_520,
      changePercent: -10,
      direction: 'DOWN',
    });
    expect(summary.monthOverMonth).toEqual({
      currentMinor: 169_492,
      previousMinor: 163_200,
      changePercent: 3.9,
      direction: 'UP',
    });
  });

  it('balances net cash flow against its parts', () => {
    const summary = fixtureSummary();

    expect(summary.netCashFlowMinor).toBe(
      summary.incomeMinor - summary.spendingMinor + summary.investmentCreditsMinor - summary.investmentDebitsMinor,
    );
  });

  it('reconciles every breakdown against total spending', () => {
    const summary = fixtureSummary();
    const daily = summary.dailySpending.reduce((total, day) => total + day.amountMinor, 0);
    const byCategory = summary.spendingByCategory.reduce((total, row) => total + row.amountMinor, 0);

    expect(daily).toBe(summary.spendingMinor);
    expect(byCategory).toBe(summary.spendingMinor);
  });

  it('reconciles the budget aggregate against its rows', () => {
    const summary = fixtureSummary();
    const limits = summary.budgets.reduce((total, budget) => total + budget.limitMinor, 0);
    const spent = summary.budgets.reduce((total, budget) => total + budget.spentMinor, 0);
    const remaining = summary.budgets.reduce((total, budget) => total + budget.remainingMinor, 0);

    expect(limits).toBe(summary.budgetTotalMinor);
    expect(spent).toBe(summary.budgetedSpendingMinor);
    expect(remaining).toBe(summary.budgetRemainingMinor);

    for (const budget of summary.budgets) {
      expect(budget.remainingMinor).toBe(budget.limitMinor - budget.spentMinor);
    }
  });

  it('stops the daily series at today for the current month', () => {
    expect(fixtureSummary().dailySpending).toHaveLength(Number(TODAY.slice(8, 10)));
    expect(fixtureSummary('2026-07').dailySpending).toHaveLength(31);
  });

  it('returns the six most recent transactions, newest first', () => {
    const recent = fixtureSummary().recentTransactions;
    const descending = [...recent].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

    expect(recent).toHaveLength(6);
    expect(recent).toEqual(descending);
  });
});

describe('ledgerWindowFor', () => {
  it('covers both comparison weeks and the previous month in one range', () => {
    for (const month of ['2026-08', '2026-07', '2026-01'] as const) {
      const window = ledgerWindowFor(month, TODAY);
      const lastComparableDate = month === TODAY.slice(0, 7) ? addDays(TODAY, -1) : lastDateOfMonth(month);
      const previousWeekStart = addDays(lastComparableDate, -13);

      expect(window.from <= previousWeekStart).toBe(true);
      expect(window.from <= monthStart(previousMonth(month))).toBe(true);
      expect(window.to).toBe(lastDateOfMonth(month));
    }
  });
});

describe('budgetProgress', () => {
  const categories: Category[] = [
    { id: 'c1', name: 'Groceries', group: 'Shopping', colour: '#112233', deactivatedAt: null, version: 1 },
    { id: 'c2', name: 'Dining', group: 'Transport', colour: '#445566', deactivatedAt: null, version: 1 },
  ];

  it('marks a row derived from a default as unpersisted', () => {
    const rows = budgetProgress({
      month: MONTH,
      budgets: [],
      budgetDefaults: [{ id: 'd1', categoryId: 'c1', limitMinor: 10_000, version: 1 }],
      categories,
      spentByCategory: new Map([['c1', 4_000]]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ categoryId: 'c1', limitMinor: 10_000, version: null, remainingMinor: 6_000 });
  });

  it('prefers a stored budget over the default for the same category', () => {
    const rows = budgetProgress({
      month: MONTH,
      budgets: [{ id: 'b1', month: MONTH, categoryId: 'c1', limitMinor: 20_000, version: 3 }],
      budgetDefaults: [{ id: 'd1', categoryId: 'c1', limitMinor: 10_000, version: 1 }],
      categories,
      spentByCategory: new Map(),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'b1', limitMinor: 20_000, version: 3 });
  });

  it('ignores a stored budget belonging to another month', () => {
    const rows = budgetProgress({
      month: MONTH,
      budgets: [{ id: 'b1', month: '2026-07', categoryId: 'c1', limitMinor: 20_000, version: 1 }],
      budgetDefaults: [],
      categories,
      spentByCategory: new Map(),
    });

    expect(rows).toEqual([]);
  });

  it('reports a zero limit as fully used only when something was spent', () => {
    const zero = (spent: number) =>
      budgetProgress({
        month: MONTH,
        budgets: [{ id: 'b1', month: MONTH, categoryId: 'c1', limitMinor: 0, version: 1 }],
        budgetDefaults: [],
        categories,
        spentByCategory: new Map([['c1', spent]]),
      })[0]?.percentUsed;

    expect(zero(0)).toBe(0);
    expect(zero(500)).toBe(100);
  });

  it('orders rows by spending, highest first', () => {
    const rows = budgetProgress({
      month: MONTH,
      budgets: [],
      budgetDefaults: [
        { id: 'd1', categoryId: 'c1', limitMinor: 10_000, version: 1 },
        { id: 'd2', categoryId: 'c2', limitMinor: 10_000, version: 1 },
      ],
      categories,
      spentByCategory: new Map([
        ['c1', 1_000],
        ['c2', 9_000],
      ]),
    });

    expect(rows.map((row) => row.categoryId)).toEqual(['c2', 'c1']);
  });
});

describe('signed money handling', () => {
  function spending(id: string, categoryId: string | null, amountMinor: number, flow: 'DEBIT' | 'CREDIT'): Transaction {
    return {
      id,
      accountId: 'a1',
      accountName: 'Everyday',
      categoryId,
      categoryName: categoryId,
      description: id,
      amountMinor: flow === 'DEBIT' ? -amountMinor : amountMinor,
      currency: 'GBP',
      kind: 'SPENDING',
      origin: 'MANUAL',
      occurredAt: '2026-08-03T12:00:00.000Z',
      localDate: '2026-08-03',
      timePrecision: 'DATE',
      timezone: 'Europe/London',
      scheduleId: null,
      occurrenceDate: null,
      importRowFingerprint: null,
      receipt: null,
      voidedAt: null,
      voidReason: null,
      createdAt: MOCK_NOW,
      updatedAt: MOCK_NOW,
      version: 1,
    };
  }

  it('nets a refund against spending in the same category', () => {
    const transactions = [spending('t1', 'c1', 5_000, 'DEBIT'), spending('t2', 'c1', 1_500, 'CREDIT')];

    expect(totalByKind(transactions, 'SPENDING')).toBe(3_500);
    expect(spendingByCategory(transactions).get('c1')).toBe(3_500);
  });

  it('keeps uncategorised spending under the null key', () => {
    const totals = spendingByCategory([spending('t1', null, 2_500, 'DEBIT')]);

    expect(totals.get(null)).toBe(2_500);
  });

  it('buckets daily spending by local date and pads untouched days with zero', () => {
    const series = dailySpending(MONTH, TODAY, [spending('t1', 'c1', 5_000, 'DEBIT')]);

    expect(series.find((day) => day.date === '2026-08-03')?.amountMinor).toBe(5_000);
    expect(series.find((day) => day.date === '2026-08-04')?.amountMinor).toBe(0);
  });
});

describe('comparison', () => {
  it('reports no comparison when the previous period is empty', () => {
    expect(comparison(1_000, 0)).toEqual({
      currentMinor: 1_000,
      previousMinor: 0,
      changePercent: null,
      direction: 'NOT_COMPARABLE',
    });
  });

  it('classifies direction and rounds the change to one decimal place', () => {
    expect(comparison(1_100, 1_000)).toMatchObject({ changePercent: 10, direction: 'UP' });
    expect(comparison(900, 1_000)).toMatchObject({ changePercent: -10, direction: 'DOWN' });
    expect(comparison(1_000, 1_000)).toMatchObject({ changePercent: 0, direction: 'FLAT' });
    expect(comparison(1_039, 1_000)).toMatchObject({ changePercent: 3.9, direction: 'UP' });
  });
});
