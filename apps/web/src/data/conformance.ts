import {
  budgetProgress,
  lastDateOfMonth,
  ledgerWindowFor,
  monthStart,
  spendingByCategory,
  summariseMonth,
} from './aggregates';
import { batchContentHash, rowFingerprint, type SourceRow } from './fingerprint';
import { createMockFixtures, MOCK_NOW, MOCK_TODAY } from './fixtures';
import { nextOccurrence } from './recurrence';
import { instantAt, zonedDate, zonedTime } from './time';
import type {
  Account,
  Budget,
  BudgetDefault,
  BudgetProgress,
  Category,
  DashboardSummary,
  LocalDate,
  Month,
  Schedule,
  ScheduleRecurrence,
  Transaction,
} from './types';

// ADR 0008: the TypeScript contract is the source of truth and the Rust crate
// conforms to it by re-deriving this vector, not by generated code.
export interface ConformanceVector {
  readonly today: LocalDate;
  readonly now: string;
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly budgets: readonly Budget[];
  readonly budgetDefaults: readonly BudgetDefault[];
  readonly transactions: readonly Transaction[];
  readonly schedules: readonly Schedule[];
  readonly expected: {
    readonly dashboards: readonly {
      readonly month: Month;
      readonly window: { readonly from: LocalDate; readonly to: LocalDate };
      readonly summary: DashboardSummary;
    }[];
    readonly budgetProgress: readonly { readonly month: Month; readonly rows: readonly BudgetProgress[] }[];
    readonly recurrences: readonly {
      readonly recurrence: ScheduleRecurrence;
      readonly currentDue: LocalDate;
      readonly next: LocalDate | null;
    }[];
    readonly fingerprints: readonly { readonly row: SourceRow; readonly fingerprint: string }[];
    readonly batchHashes: readonly {
      readonly fileName: string;
      readonly fingerprints: readonly string[];
      readonly hash: string;
    }[];
    readonly zonedTimes: readonly {
      readonly instant: string;
      readonly localDate: LocalDate;
      readonly localTime: string;
    }[];
    readonly instants: readonly {
      readonly localDate: LocalDate;
      readonly timeOfDay: string;
      readonly instant: string;
    }[];
    readonly referenceOrder: { readonly accountIds: readonly string[]; readonly categoryIds: readonly string[] };
  };
}

const MONTHS: readonly Month[] = ['2026-08', '2026-07', '2026-09'];

const RECURRENCES: readonly { recurrence: ScheduleRecurrence; currentDue: LocalDate }[] = [
  { recurrence: { frequency: 'ONCE', date: '2026-08-20' }, currentDue: '2026-08-20' },
  { recurrence: { frequency: 'WEEKLY', weekday: 'MONDAY', intervalWeeks: 1 }, currentDue: '2026-08-17' },
  { recurrence: { frequency: 'WEEKLY', weekday: 'FRIDAY', intervalWeeks: 4 }, currentDue: '2026-12-25' },
  { recurrence: { frequency: 'MONTHLY', day: 31, endOfMonthPolicy: 'CLAMP' }, currentDue: '2026-01-31' },
  { recurrence: { frequency: 'MONTHLY', day: 31, endOfMonthPolicy: 'SKIP' }, currentDue: '2026-01-31' },
  { recurrence: { frequency: 'MONTHLY', day: 1, endOfMonthPolicy: 'CLAMP' }, currentDue: '2026-12-01' },
  { recurrence: { frequency: 'YEARLY', month: 2, day: 29, endOfMonthPolicy: 'CLAMP' }, currentDue: '2028-02-29' },
  { recurrence: { frequency: 'YEARLY', month: 2, day: 29, endOfMonthPolicy: 'SKIP' }, currentDue: '2028-02-29' },
];

const SOURCE_ROWS: readonly SourceRow[] = [
  { accountId: 'account-demo-everyday', localDate: '2026-08-13', description: 'Weekly groceries', amountMinor: -4_325 },
  {
    accountId: 'account-demo-everyday',
    localDate: '2026-08-13',
    description: '  WEEKLY   groceries  ',
    amountMinor: -4_325,
  },
  { accountId: 'account-demo-credit', localDate: '2026-01-01', description: 'Salary', amountMinor: 250_000 },
];

// Both British Summer Time and Greenwich Mean Time, and the two instants a
// transition moves. A zone bug shows up here rather than in a month total.
const INSTANTS: readonly string[] = [
  '2026-01-15T09:30:00.000Z',
  '2026-06-15T09:30:00.000Z',
  '2026-03-29T00:30:00.000Z',
  '2026-03-29T01:30:00.000Z',
  '2026-10-25T00:30:00.000Z',
  '2026-10-25T01:30:00.000Z',
  '2026-08-17T23:30:00.000Z',
];

const LOCAL_TIMES: readonly { localDate: LocalDate; timeOfDay: string }[] = [
  { localDate: '2026-01-15', timeOfDay: '12:00:00' },
  { localDate: '2026-06-15', timeOfDay: '12:00:00' },
  { localDate: '2026-06-15', timeOfDay: '00:30:00' },
  { localDate: '2026-03-29', timeOfDay: '02:30:00' },
  { localDate: '2026-10-25', timeOfDay: '01:30:00' },
];

function activeBetween(transactions: readonly Transaction[], from: LocalDate, to: LocalDate): Transaction[] {
  return transactions.filter(
    (transaction) => transaction.voidedAt === null && transaction.localDate >= from && transaction.localDate <= to,
  );
}

// Names are a read-model projection resolved from the current entity (ADR 0003),
// so the vector carries them resolved rather than as stored on the record.
function project(transactions: readonly Transaction[], accounts: readonly Account[], categories: readonly Category[]) {
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  return transactions.map((transaction) => ({
    ...transaction,
    accountName: accountNames.get(transaction.accountId) ?? transaction.accountName,
    categoryName: transaction.categoryId ? (categoryNames.get(transaction.categoryId) ?? null) : null,
  }));
}

function byName(left: string, right: string): number {
  const folded = left.toLowerCase().localeCompare(right.toLowerCase());
  return folded !== 0 ? folded : left.localeCompare(right);
}

export function buildConformanceVector(): ConformanceVector {
  const state = createMockFixtures();
  const { accounts, categories, budgets, budgetDefaults, schedules } = state;
  const transactions = project(state.transactions, accounts, categories);

  const dashboards = MONTHS.map((month) => {
    const window = ledgerWindowFor(month, MOCK_TODAY);
    const summary: DashboardSummary = summariseMonth({
      month,
      today: MOCK_TODAY,
      asOf: MOCK_NOW,
      ledgerWindow: activeBetween(transactions, window.from, window.to),
      budgets,
      budgetDefaults,
      categories,
    });
    return { month, window, summary };
  });

  const progress = MONTHS.map((month) => ({
    month,
    rows: budgetProgress({
      month,
      budgets,
      budgetDefaults,
      categories,
      spentByCategory: spendingByCategory(activeBetween(transactions, monthStart(month), lastDateOfMonth(month))),
    }),
  }));

  const fingerprints = SOURCE_ROWS.map((row) => ({ row, fingerprint: rowFingerprint(row) }));
  const batchFingerprints = fingerprints.map((entry) => entry.fingerprint);

  return {
    today: MOCK_TODAY,
    now: MOCK_NOW,
    accounts,
    categories,
    budgets,
    budgetDefaults,
    transactions,
    schedules,
    expected: {
      dashboards,
      budgetProgress: progress,
      recurrences: RECURRENCES.map((entry) => ({ ...entry, next: nextOccurrence(entry.recurrence, entry.currentDue) })),
      fingerprints,
      batchHashes: [
        {
          fileName: 'statement.csv',
          fingerprints: batchFingerprints,
          hash: batchContentHash('statement.csv', batchFingerprints),
        },
        { fileName: '  Statement.CSV ', fingerprints: [], hash: batchContentHash('  Statement.CSV ', []) },
      ],
      zonedTimes: INSTANTS.map((instant) => ({
        instant,
        localDate: zonedDate(instant),
        localTime: zonedTime(instant),
      })),
      instants: LOCAL_TIMES.map((entry) => ({ ...entry, instant: instantAt(entry.localDate, entry.timeOfDay) })),
      referenceOrder: {
        accountIds: [...accounts].sort((left, right) => byName(left.name, right.name)).map((account) => account.id),
        categoryIds: [...categories]
          .sort((left, right) => byName(left.group, right.group) || byName(left.name, right.name))
          .map((category) => category.id),
      },
    },
  };
}

export function serialiseConformanceVector(): string {
  return `${JSON.stringify(buildConformanceVector(), null, 2)}\n`;
}
