export type Currency = 'GBP';
export type AppLocale = 'en-GB' | 'zh-CN';
export type Month = `${number}-${number}`;
export type LocalDate = `${number}-${number}-${number}`;

export interface UserPreferences {
  locale: AppLocale;
  version: number;
  updatedAt: string;
}

export interface UpdateUserPreferencesInput {
  locale: AppLocale;
  expectedVersion: number;
}

export type AccountType = 'CURRENT' | 'CREDIT_CARD' | 'SAVINGS' | 'INVESTMENT';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balanceMinor: number;
  colour: string;
  deactivatedAt: string | null;
  version: number;
}

export type CategoryGroup =
  'Shopping' | 'Rent' | 'Utilities' | 'Services' | 'Tax' | 'Transport' | 'Income' | 'Investment';

export interface Category {
  id: string;
  name: string;
  group: CategoryGroup;
  colour: string;
  deactivatedAt: string | null;
  version: number;
}

export type TransactionKind = 'INCOME' | 'SPENDING' | 'INVESTMENT';
export type TransactionFlow = 'CREDIT' | 'DEBIT';
export type TransactionOrigin = 'MANUAL' | 'IMPORT' | 'SCHEDULE' | 'ASSISTANT';
export type TimePrecision = 'DATE' | 'MINUTE';

export interface Receipt {
  id: string;
  fileName: string;
  mediaType: 'application/pdf' | 'image/jpeg' | 'image/png';
  sizeBytes: number;
}

export interface Transaction {
  id: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  description: string;
  amountMinor: number;
  currency: Currency;
  kind: TransactionKind;
  flow: TransactionFlow;
  origin: TransactionOrigin;
  occurredAt: string;
  localDate: LocalDate;
  timePrecision: TimePrecision;
  timezone: 'Europe/London';
  scheduleId: string | null;
  occurrenceDate: LocalDate | null;
  importRowFingerprint: string | null;
  receipt: Receipt | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateTransactionInput {
  accountId: string;
  categoryId: string | null;
  description: string;
  amountMinor: number;
  kind: TransactionKind;
  flow: TransactionFlow;
  localDate: LocalDate;
  occurredAt?: string;
  origin?: TransactionOrigin;
  receipt?: Receipt | null;
}

export interface UpdateTransactionInput {
  expectedVersion: number;
  accountId?: string;
  categoryId?: string | null;
  description?: string;
  amountMinor?: number;
  kind?: TransactionKind;
  flow?: TransactionFlow;
  localDate?: LocalDate;
  occurredAt?: string;
  receipt?: Receipt | null;
}

export type TransactionStatus = 'ACTIVE' | 'VOIDED' | 'ALL';
export type TransactionSort = 'NEWEST' | 'OLDEST' | 'AMOUNT_HIGH' | 'AMOUNT_LOW';

export interface TransactionFilters {
  month?: Month;
  from?: LocalDate;
  to?: LocalDate;
  accountId?: string;
  categoryId?: string;
  kind?: TransactionKind;
  flow?: TransactionFlow;
  origin?: TransactionOrigin;
  status?: TransactionStatus;
  search?: string;
  sort?: TransactionSort;
  page?: number;
  pageSize?: number;
}

export interface TransactionPage {
  items: Transaction[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface Budget {
  id: string;
  month: Month;
  categoryId: string;
  limitMinor: number;
  version: number;
}

export interface BudgetDefault {
  id: string;
  categoryId: string;
  limitMinor: number;
  version: number;
}

export interface BudgetProgress {
  id: string;
  month: Month;
  categoryId: string;
  limitMinor: number;
  version: number | null;
  categoryName: string;
  colour: string;
  spentMinor: number;
  remainingMinor: number;
  percentUsed: number;
}

export interface SetBudgetInput {
  month: Month;
  categoryId: string;
  limitMinor: number;
  expectedVersion: number | null;
}

export interface SetBudgetDefaultInput {
  categoryId: string;
  limitMinor: number;
  expectedVersion: number | null;
}

export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export type EndOfMonthPolicy = 'CLAMP' | 'SKIP';

export type ScheduleRecurrence =
  | { frequency: 'ONCE'; date: LocalDate }
  | { frequency: 'WEEKLY'; weekday: Weekday; intervalWeeks: number }
  | { frequency: 'MONTHLY'; day: number; endOfMonthPolicy: EndOfMonthPolicy }
  | { frequency: 'YEARLY'; month: number; day: number; endOfMonthPolicy: EndOfMonthPolicy };

export interface Schedule {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  description: string;
  amountMinor: number;
  currency: Currency;
  kind: TransactionKind;
  flow: TransactionFlow;
  recurrence: ScheduleRecurrence;
  nextDueDate: LocalDate | null;
  lastGeneratedDate: LocalDate | null;
  deactivatedAt: string | null;
  version: number;
}

export interface CreateScheduleInput {
  name: string;
  accountId: string;
  categoryId: string | null;
  description: string;
  amountMinor: number;
  kind: TransactionKind;
  flow: TransactionFlow;
  recurrence: ScheduleRecurrence;
  nextDueDate: LocalDate;
}

export interface UpdateScheduleInput {
  expectedVersion: number;
  name?: string;
  accountId?: string;
  categoryId?: string | null;
  description?: string;
  amountMinor?: number;
  kind?: TransactionKind;
  flow?: TransactionFlow;
  recurrence?: ScheduleRecurrence;
  nextDueDate?: LocalDate;
}

export type ImportRowStatus = 'READY' | 'DUPLICATE' | 'INVALID';
export type ImportStatus = 'PREVIEW' | 'COMMITTED' | 'EXPIRED';

export interface ImportRow {
  id: string;
  rowNumber: number;
  localDate: LocalDate;
  description: string;
  amountMinor: number;
  flow: TransactionFlow;
  kind: TransactionKind;
  categoryId: string | null;
  categoryName: string | null;
  status: ImportRowStatus;
  sourceFingerprint: string;
  warnings: string[];
  included: boolean;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  accountId: string;
  accountName: string;
  createdAt: string;
  expiresAt: string;
  committedAt: string | null;
  status: ImportStatus;
  contentHash: string;
  rows: ImportRow[];
  importedCount: number;
  version: number;
}

export interface ImportHistoryItem {
  id: string;
  fileName: string;
  accountName: string;
  createdAt: string;
  committedAt: string | null;
  status: ImportStatus;
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
  importedCount: number;
}

export interface CreateImportPreviewInput {
  fileName: string;
  accountId: string;
}

export interface UpdateImportRowInput {
  expectedVersion: number;
  categoryId?: string | null;
  kind?: TransactionKind;
  included?: boolean;
}

export interface ImportCommitResult {
  batch: ImportBatch;
  createdTransactions: Transaction[];
}

export interface SpendingComparison {
  currentMinor: number;
  previousMinor: number;
  changePercent: number | null;
  direction: 'UP' | 'DOWN' | 'FLAT' | 'NOT_COMPARABLE';
}

export interface DailySpending {
  date: LocalDate;
  amountMinor: number;
}

export interface CategorySpending {
  categoryId: string | null;
  categoryName: string;
  colour: string;
  amountMinor: number;
}

export interface DashboardSummary {
  month: Month;
  asOf: string;
  incomeMinor: number;
  spendingMinor: number;
  investmentCreditsMinor: number;
  investmentDebitsMinor: number;
  netCashFlowMinor: number;
  budgetTotalMinor: number;
  budgetedSpendingMinor: number;
  budgetRemainingMinor: number;
  uncategorisedSpendingMinor: number;
  transactionCount: number;
  weekOverWeek: SpendingComparison;
  monthOverMonth: SpendingComparison;
  dailySpending: DailySpending[];
  spendingByCategory: CategorySpending[];
  budgets: BudgetProgress[];
  recentTransactions: Transaction[];
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  balanceMinor: number;
  colour: string;
}

export interface UpdateAccountInput {
  expectedVersion: number;
  name?: string;
  type?: AccountType;
  balanceMinor?: number;
  colour?: string;
}

export interface CreateCategoryInput {
  name: string;
  group: CategoryGroup;
  colour: string;
}

export interface UpdateCategoryInput {
  expectedVersion: number;
  name?: string;
  group?: CategoryGroup;
  colour?: string;
}

export type MockSession = 'ACTIVE' | 'EXPIRED';

export interface MockApiOptions {
  latencyMs?: number;
  session?: MockSession;
}

export type MockScenario = 'DEFAULT' | 'EMPTY';

export type MockApiErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION' | 'UNAUTHENTICATED';

export class MockApiError extends Error {
  readonly code: MockApiErrorCode;

  constructor(code: MockApiErrorCode, message: string) {
    super(message);
    this.name = 'MockApiError';
    this.code = code;
  }
}

export interface MockFinanceApi {
  getUserPreferences(): Promise<UserPreferences>;
  updateUserPreferences(input: UpdateUserPreferencesInput): Promise<UserPreferences>;
  listAccounts(includeInactive?: boolean): Promise<Account[]>;
  createAccount(input: CreateAccountInput): Promise<Account>;
  updateAccount(id: string, input: UpdateAccountInput): Promise<Account>;
  deactivateAccount(id: string, expectedVersion: number): Promise<Account>;
  listCategories(includeInactive?: boolean): Promise<Category[]>;
  createCategory(input: CreateCategoryInput): Promise<Category>;
  updateCategory(id: string, input: UpdateCategoryInput): Promise<Category>;
  deactivateCategory(id: string, expectedVersion: number): Promise<Category>;
  listTransactions(filters?: TransactionFilters): Promise<TransactionPage>;
  getTransaction(id: string): Promise<Transaction>;
  createTransaction(input: CreateTransactionInput): Promise<Transaction>;
  updateTransaction(id: string, input: UpdateTransactionInput): Promise<Transaction>;
  voidTransaction(id: string, expectedVersion: number, reason?: string): Promise<Transaction>;
  listBudgets(month: Month): Promise<BudgetProgress[]>;
  listBudgetDefaults(): Promise<BudgetDefault[]>;
  setBudget(input: SetBudgetInput): Promise<Budget>;
  setBudgetDefault(input: SetBudgetDefaultInput): Promise<BudgetDefault>;
  getDashboard(month: Month): Promise<DashboardSummary>;
  listSchedules(includeInactive?: boolean): Promise<Schedule[]>;
  createSchedule(input: CreateScheduleInput): Promise<Schedule>;
  updateSchedule(id: string, input: UpdateScheduleInput): Promise<Schedule>;
  deactivateSchedule(id: string, expectedVersion: number): Promise<Schedule>;
  runDueSchedules(asOf: LocalDate): Promise<Transaction[]>;
  listImports(): Promise<ImportHistoryItem[]>;
  getImportPreview(id: string): Promise<ImportBatch>;
  previewImport(input: CreateImportPreviewInput): Promise<ImportBatch>;
  updateImportRow(importId: string, rowId: string, input: UpdateImportRowInput): Promise<ImportBatch>;
  commitImport(importId: string, expectedVersion: number, expectedContentHash: string): Promise<ImportCommitResult>;
  reset(): Promise<void>;
}
