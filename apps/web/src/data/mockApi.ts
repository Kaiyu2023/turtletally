import {
  budgetProgress,
  formatDate,
  lastDateOfMonth,
  ledgerWindowFor,
  monthStart,
  spendingByCategory,
  summariseMonth,
} from './aggregates';
import { batchContentHash, rowFingerprint } from './fingerprint';
import { createMockFixtures, MOCK_NOW, MOCK_TODAY, type MockFixtureState } from './fixtures';
import { nextOccurrence } from './recurrence';
import type {
  Account,
  AppLocale,
  Budget,
  BudgetDefault,
  BudgetProgress,
  Category,
  CreateAccountInput,
  CreateCategoryInput,
  CreateImportPreviewInput,
  CreateScheduleInput,
  CreateTransactionInput,
  DashboardSummary,
  ImportBatch,
  ImportCommitResult,
  ImportHistoryItem,
  ImportRow,
  LocalDate,
  MockApiOptions,
  MockFinanceApi,
  MockScenario,
  MockSession,
  Month,
  Schedule,
  ScheduleRecurrence,
  SetBudgetDefaultInput,
  SetBudgetInput,
  Transaction,
  TransactionFilters,
  TransactionPage,
  UpdateImportRowInput,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateScheduleInput,
  UpdateTransactionInput,
  UpdateUserPreferencesInput,
  UserPreferences,
} from './types';
import { MockApiError } from './types';

interface TransactionIdentity {
  readonly scheduleId?: string;
  readonly occurrenceDate?: LocalDate;
  readonly importRowFingerprint?: string;
}

const DEFAULT_LATENCY_MS = 180;
const MAX_PAGE_SIZE = 100;

function copy<T>(value: T): T {
  return structuredClone(value);
}

function initialState(scenario: MockScenario): MockFixtureState {
  const state = createMockFixtures();

  if (scenario === 'EMPTY') {
    return {
      ...state,
      transactions: [],
      budgets: [],
      schedules: [],
      imports: [],
    };
  }

  return state;
}

class InMemoryMockApi implements MockFinanceApi {
  private state: MockFixtureState;
  private sequence = 1;
  private readonly scenario: MockScenario;
  private readonly latencyMs: number;
  private readonly session: MockSession;

  constructor(scenario: MockScenario, latencyMs: number, session: MockSession) {
    this.scenario = scenario;
    this.latencyMs = latencyMs;
    this.session = session;
    this.state = initialState(scenario);
  }

  async getUserPreferences(): Promise<UserPreferences> {
    return this.withLatency(() => copy(this.state.preferences));
  }

  async updateUserPreferences(input: UpdateUserPreferencesInput): Promise<UserPreferences> {
    return this.withLatency(() => {
      this.validLocale(input.locale);
      this.assertVersion(this.state.preferences.version, input.expectedVersion);
      const updated: UserPreferences = {
        locale: input.locale,
        version: this.state.preferences.version + 1,
        updatedAt: MOCK_NOW,
      };
      this.state.preferences = updated;
      return copy(updated);
    });
  }

  async listAccounts(includeInactive = false): Promise<Account[]> {
    return this.withLatency(() =>
      copy(
        this.state.accounts
          .filter((account) => includeInactive || account.deactivatedAt === null)
          .sort((left, right) => left.name.localeCompare(right.name)),
      ),
    );
  }

  async createAccount(input: CreateAccountInput): Promise<Account> {
    return this.withLatency(() => {
      const name = this.validName(input.name, 'Account name');
      this.validSignedMinor(input.openingBalanceMinor, 'Opening balance');
      this.validColour(input.colour);

      if (
        this.state.accounts.some(
          (account) => account.deactivatedAt === null && account.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new MockApiError('CONFLICT', 'An active account already uses that name.');
      }

      const account: Account = {
        id: this.nextId('account'),
        name,
        type: input.type,
        currency: 'GBP',
        balanceMinor: input.openingBalanceMinor,
        colour: input.colour,
        deactivatedAt: null,
        version: 1,
      };
      this.state.accounts.push(account);
      return copy(account);
    });
  }

  async updateAccount(id: string, input: UpdateAccountInput): Promise<Account> {
    return this.withLatency(() => {
      const account = this.findAccount(id);
      this.assertVersion(account.version, input.expectedVersion);
      this.assertActive(account.deactivatedAt, 'Account');
      const name = input.name === undefined ? account.name : this.validName(input.name, 'Account name');
      const colour = input.colour ?? account.colour;
      this.validColour(colour);

      if (
        this.state.accounts.some(
          (candidate) =>
            candidate.id !== id &&
            candidate.deactivatedAt === null &&
            candidate.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new MockApiError('CONFLICT', 'An active account already uses that name.');
      }

      const updated: Account = {
        ...account,
        name,
        type: input.type ?? account.type,
        colour,
        version: account.version + 1,
      };
      this.replace(this.state.accounts, updated);
      return copy(updated);
    });
  }

  async deactivateAccount(id: string, expectedVersion: number): Promise<Account> {
    return this.withLatency(() => {
      const account = this.findAccount(id);
      this.assertVersion(account.version, expectedVersion);
      this.assertActive(account.deactivatedAt, 'Account');
      const updated = { ...account, deactivatedAt: MOCK_NOW, version: account.version + 1 };
      this.replace(this.state.accounts, updated);
      return copy(updated);
    });
  }

  async listCategories(includeInactive = false): Promise<Category[]> {
    return this.withLatency(() =>
      copy(
        this.state.categories
          .filter((category) => includeInactive || category.deactivatedAt === null)
          .sort((left, right) => left.group.localeCompare(right.group) || left.name.localeCompare(right.name)),
      ),
    );
  }

  async createCategory(input: CreateCategoryInput): Promise<Category> {
    return this.withLatency(() => {
      const name = this.validName(input.name, 'Category name');
      this.validColour(input.colour);

      if (
        this.state.categories.some(
          (category) =>
            category.deactivatedAt === null &&
            category.group === input.group &&
            category.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new MockApiError('CONFLICT', 'An active category already uses that name in this group.');
      }

      const category: Category = {
        id: this.nextId('category'),
        name,
        group: input.group,
        colour: input.colour,
        deactivatedAt: null,
        version: 1,
      };
      this.state.categories.push(category);
      return copy(category);
    });
  }

  async updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
    return this.withLatency(() => {
      const category = this.findCategory(id);
      this.assertVersion(category.version, input.expectedVersion);
      this.assertActive(category.deactivatedAt, 'Category');
      const name = input.name === undefined ? category.name : this.validName(input.name, 'Category name');
      const group = input.group ?? category.group;
      const colour = input.colour ?? category.colour;
      this.validColour(colour);

      if (
        this.state.categories.some(
          (candidate) =>
            candidate.id !== id &&
            candidate.deactivatedAt === null &&
            candidate.group === group &&
            candidate.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new MockApiError('CONFLICT', 'An active category already uses that name in this group.');
      }

      const updated: Category = {
        ...category,
        name,
        group,
        colour,
        version: category.version + 1,
      };
      this.replace(this.state.categories, updated);
      return copy(updated);
    });
  }

  async deactivateCategory(id: string, expectedVersion: number): Promise<Category> {
    return this.withLatency(() => {
      const category = this.findCategory(id);
      this.assertVersion(category.version, expectedVersion);
      this.assertActive(category.deactivatedAt, 'Category');
      const updated = { ...category, deactivatedAt: MOCK_NOW, version: category.version + 1 };
      this.replace(this.state.categories, updated);
      return copy(updated);
    });
  }

  async listTransactions(filters: TransactionFilters = {}): Promise<TransactionPage> {
    return this.withLatency(() => {
      const page = filters.page ?? 1;
      const pageSize = filters.pageSize ?? 10;
      this.validPage(page, pageSize);

      const status = filters.status ?? 'ACTIVE';
      const query = filters.search?.trim().toLowerCase();
      const items = this.state.transactions.filter((transaction) => {
        if (filters.month && !transaction.localDate.startsWith(filters.month)) return false;
        if (filters.from && transaction.localDate < filters.from) return false;
        if (filters.to && transaction.localDate > filters.to) return false;
        if (filters.accountId && transaction.accountId !== filters.accountId) return false;
        if (filters.categoryId && transaction.categoryId !== filters.categoryId) return false;
        if (filters.kind && transaction.kind !== filters.kind) return false;
        if (filters.flow && transaction.flow !== filters.flow) return false;
        if (filters.origin && transaction.origin !== filters.origin) return false;
        if (status === 'ACTIVE' && transaction.voidedAt !== null) return false;
        if (status === 'VOIDED' && transaction.voidedAt === null) return false;
        if (query) {
          const projected = this.projectTransaction(transaction);
          const haystack =
            `${projected.description} ${projected.accountName} ${projected.categoryName ?? ''}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      });

      this.sortTransactions(items, filters.sort ?? 'NEWEST');
      const totalItems = items.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const start = (page - 1) * pageSize;

      return copy({
        items: items.slice(start, start + pageSize).map((transaction) => this.projectTransaction(transaction)),
        page,
        pageSize,
        totalItems,
        totalPages,
      });
    });
  }

  async getTransaction(id: string): Promise<Transaction> {
    return this.withLatency(() => copy(this.projectTransaction(this.findTransaction(id))));
  }

  async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
    return this.withLatency(() => {
      const transaction = this.buildTransaction(input, input.origin ?? 'MANUAL');
      this.state.transactions.push(transaction);
      this.adjustBalance(transaction, 1);
      return copy(transaction);
    });
  }

  async updateTransaction(id: string, input: UpdateTransactionInput): Promise<Transaction> {
    return this.withLatency(() => {
      const transaction = this.findTransaction(id);
      this.assertVersion(transaction.version, input.expectedVersion);
      this.assertActive(transaction.voidedAt, 'Transaction');

      const accountChanged = input.accountId !== undefined && input.accountId !== transaction.accountId;
      const account = accountChanged
        ? this.findActiveAccount(input.accountId as string)
        : this.findAccount(transaction.accountId);
      const categoryId = 'categoryId' in input ? (input.categoryId ?? null) : transaction.categoryId;
      const categoryChanged = categoryId !== transaction.categoryId;
      const category = categoryId
        ? categoryChanged
          ? this.findActiveCategory(categoryId)
          : this.findCategory(categoryId)
        : null;
      const description =
        input.description === undefined ? transaction.description : this.validName(input.description, 'Description');
      const amountMinor = input.amountMinor ?? transaction.amountMinor;
      this.validMinor(amountMinor, 'Amount');
      const localDate = input.localDate ?? transaction.localDate;
      this.validDate(localDate);
      const occurredAt = input.occurredAt ?? (input.localDate ? `${localDate}T12:00:00.000Z` : transaction.occurredAt);
      this.validOccurredAt(occurredAt, localDate);

      this.adjustBalance(transaction, -1);
      const updated: Transaction = {
        ...transaction,
        accountId: account.id,
        accountName: account.name,
        categoryId,
        categoryName: category?.name ?? null,
        description,
        amountMinor,
        kind: input.kind ?? transaction.kind,
        flow: input.flow ?? transaction.flow,
        localDate,
        occurredAt,
        timePrecision:
          input.occurredAt || input.localDate ? (input.occurredAt ? 'MINUTE' : 'DATE') : transaction.timePrecision,
        receipt: 'receipt' in input ? (input.receipt ?? null) : transaction.receipt,
        updatedAt: MOCK_NOW,
        version: transaction.version + 1,
      };
      this.replace(this.state.transactions, updated);
      this.adjustBalance(updated, 1);
      return copy(updated);
    });
  }

  async voidTransaction(id: string, expectedVersion: number, reason?: string): Promise<Transaction> {
    return this.withLatency(() => {
      const transaction = this.findTransaction(id);
      this.assertVersion(transaction.version, expectedVersion);
      this.assertActive(transaction.voidedAt, 'Transaction');
      const voidReason = reason === undefined ? null : this.validName(reason, 'Void reason');
      const updated: Transaction = {
        ...transaction,
        voidedAt: MOCK_NOW,
        voidReason,
        updatedAt: MOCK_NOW,
        version: transaction.version + 1,
      };
      this.replace(this.state.transactions, updated);
      this.adjustBalance(transaction, -1);
      return copy(this.projectTransaction(updated));
    });
  }

  async listBudgets(month: Month): Promise<BudgetProgress[]> {
    return this.withLatency(() => {
      this.validMonth(month);
      return copy(
        budgetProgress({
          month,
          budgets: this.state.budgets,
          budgetDefaults: this.state.budgetDefaults,
          categories: this.state.categories,
          spentByCategory: spendingByCategory(this.activeTransactionsForMonth(month)),
        }),
      );
    });
  }

  async listBudgetDefaults(): Promise<BudgetDefault[]> {
    return this.withLatency(() =>
      copy(
        this.state.budgetDefaults.sort((left, right) => {
          const leftName = this.findCategory(left.categoryId).name;
          const rightName = this.findCategory(right.categoryId).name;
          return leftName.localeCompare(rightName);
        }),
      ),
    );
  }

  async setBudget(input: SetBudgetInput): Promise<Budget> {
    return this.withLatency(() => {
      this.validMonth(input.month);
      this.validMinor(input.limitMinor, 'Budget', true);
      this.findActiveSpendingCategory(input.categoryId);
      const existing = this.state.budgets.find(
        (budget) => budget.month === input.month && budget.categoryId === input.categoryId,
      );

      if (existing) {
        if (input.expectedVersion === null)
          throw new MockApiError('CONFLICT', 'The budget already exists. Refresh and try again.');
        this.assertVersion(existing.version, input.expectedVersion);
        const updated = { ...existing, limitMinor: input.limitMinor, version: existing.version + 1 };
        this.replace(this.state.budgets, updated);
        return copy(updated);
      }

      if (input.expectedVersion !== null)
        throw new MockApiError('CONFLICT', 'The budget does not exist. Refresh and try again.');
      const budget: Budget = {
        id: this.nextId(`budget-${input.month}`),
        month: input.month,
        categoryId: input.categoryId,
        limitMinor: input.limitMinor,
        version: 1,
      };
      this.state.budgets.push(budget);
      return copy(budget);
    });
  }

  async setBudgetDefault(input: SetBudgetDefaultInput): Promise<BudgetDefault> {
    return this.withLatency(() => {
      this.validMinor(input.limitMinor, 'Default budget', true);
      this.findActiveSpendingCategory(input.categoryId);
      const existing = this.state.budgetDefaults.find((budget) => budget.categoryId === input.categoryId);

      if (existing) {
        if (input.expectedVersion === null)
          throw new MockApiError('CONFLICT', 'The default budget already exists. Refresh and try again.');
        this.assertVersion(existing.version, input.expectedVersion);
        const updated = { ...existing, limitMinor: input.limitMinor, version: existing.version + 1 };
        this.replace(this.state.budgetDefaults, updated);
        return copy(updated);
      }

      if (input.expectedVersion !== null)
        throw new MockApiError('CONFLICT', 'The default budget does not exist. Refresh and try again.');
      const budget: BudgetDefault = {
        id: this.nextId('budget-default'),
        categoryId: input.categoryId,
        limitMinor: input.limitMinor,
        version: 1,
      };
      this.state.budgetDefaults.push(budget);
      return copy(budget);
    });
  }

  async getDashboard(month: Month): Promise<DashboardSummary> {
    return this.withLatency(() => copy(this.dashboard(month)));
  }

  async listSchedules(includeInactive = false): Promise<Schedule[]> {
    return this.withLatency(() =>
      copy(
        this.state.schedules
          .filter((schedule) => includeInactive || schedule.deactivatedAt === null)
          .map((schedule) => this.projectSchedule(schedule))
          .sort((left, right) => (left.nextDueDate ?? '9999-12-31').localeCompare(right.nextDueDate ?? '9999-12-31')),
      ),
    );
  }

  async createSchedule(input: CreateScheduleInput): Promise<Schedule> {
    return this.withLatency(() => {
      const account = this.findActiveAccount(input.accountId);
      const category = input.categoryId ? this.findActiveCategory(input.categoryId) : null;
      const name = this.validName(input.name, 'Schedule name');
      const description = this.validName(input.description, 'Description');
      this.validMinor(input.amountMinor, 'Amount');
      this.validRecurrence(input.recurrence);
      this.validDate(input.nextDueDate);

      const schedule: Schedule = {
        id: this.nextId('schedule'),
        name,
        accountId: account.id,
        accountName: account.name,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        description,
        amountMinor: input.amountMinor,
        currency: 'GBP',
        kind: input.kind,
        flow: input.flow,
        recurrence: copy(input.recurrence),
        nextDueDate: input.nextDueDate,
        lastGeneratedDate: null,
        deactivatedAt: null,
        version: 1,
      };
      this.state.schedules.push(schedule);
      return copy(schedule);
    });
  }

  async updateSchedule(id: string, input: UpdateScheduleInput): Promise<Schedule> {
    return this.withLatency(() => {
      const schedule = this.findSchedule(id);
      this.assertVersion(schedule.version, input.expectedVersion);
      this.assertActive(schedule.deactivatedAt, 'Schedule');
      const account =
        input.accountId === undefined
          ? this.findActiveAccount(schedule.accountId)
          : this.findActiveAccount(input.accountId);
      const categoryId = 'categoryId' in input ? (input.categoryId ?? null) : schedule.categoryId;
      const category = categoryId ? this.findActiveCategory(categoryId) : null;
      const name = input.name === undefined ? schedule.name : this.validName(input.name, 'Schedule name');
      const description =
        input.description === undefined ? schedule.description : this.validName(input.description, 'Description');
      const amountMinor = input.amountMinor ?? schedule.amountMinor;
      const recurrence = input.recurrence ?? schedule.recurrence;
      const nextDueDate = input.nextDueDate ?? schedule.nextDueDate;
      this.validMinor(amountMinor, 'Amount');
      this.validRecurrence(recurrence);
      if (nextDueDate === null) throw new MockApiError('VALIDATION', 'An active schedule needs a next due date.');
      this.validDate(nextDueDate);

      const updated: Schedule = {
        ...schedule,
        name,
        accountId: account.id,
        accountName: account.name,
        categoryId,
        categoryName: category?.name ?? null,
        description,
        amountMinor,
        kind: input.kind ?? schedule.kind,
        flow: input.flow ?? schedule.flow,
        recurrence: copy(recurrence),
        nextDueDate,
        version: schedule.version + 1,
      };
      this.replace(this.state.schedules, updated);
      return copy(updated);
    });
  }

  async deactivateSchedule(id: string, expectedVersion: number): Promise<Schedule> {
    return this.withLatency(() => {
      const schedule = this.findSchedule(id);
      this.assertVersion(schedule.version, expectedVersion);
      this.assertActive(schedule.deactivatedAt, 'Schedule');
      const updated: Schedule = {
        ...schedule,
        nextDueDate: null,
        deactivatedAt: MOCK_NOW,
        version: schedule.version + 1,
      };
      this.replace(this.state.schedules, updated);
      return copy(this.projectSchedule(updated));
    });
  }

  async runDueSchedules(asOf: LocalDate): Promise<Transaction[]> {
    return this.withLatency(() => {
      this.validDate(asOf);
      const created: Transaction[] = [];

      for (const schedule of this.state.schedules) {
        if (schedule.deactivatedAt !== null) continue;

        let due = schedule.nextDueDate;
        let lastGeneratedDate = schedule.lastGeneratedDate;
        let generated = false;

        while (due !== null && due <= asOf) {
          const alreadyGenerated = this.state.transactions.some(
            (transaction) => transaction.scheduleId === schedule.id && transaction.occurrenceDate === due,
          );

          if (!alreadyGenerated) {
            const transaction = this.buildTransaction(
              {
                accountId: schedule.accountId,
                categoryId: schedule.categoryId,
                description: schedule.description,
                amountMinor: schedule.amountMinor,
                kind: schedule.kind,
                flow: schedule.flow,
                localDate: due,
              },
              'SCHEDULE',
              { scheduleId: schedule.id, occurrenceDate: due },
            );
            this.state.transactions.push(transaction);
            this.adjustBalance(transaction, 1);
            created.push(transaction);
          }

          lastGeneratedDate = due;
          generated = true;
          due = nextOccurrence(schedule.recurrence, due);
        }

        if (generated) {
          this.replace(this.state.schedules, {
            ...schedule,
            nextDueDate: due,
            lastGeneratedDate,
            version: schedule.version + 1,
          });
        }
      }

      return copy(created);
    });
  }

  async listImports(): Promise<ImportHistoryItem[]> {
    return this.withLatency(() =>
      copy(
        this.state.imports
          .map((batch) => ({
            id: batch.id,
            fileName: batch.fileName,
            accountName: batch.accountName,
            createdAt: batch.createdAt,
            committedAt: batch.committedAt,
            status: batch.status,
            readyCount: batch.rows.filter((row) => row.status === 'READY').length,
            duplicateCount: batch.rows.filter((row) => row.status === 'DUPLICATE').length,
            invalidCount: batch.rows.filter((row) => row.status === 'INVALID').length,
            importedCount: batch.importedCount,
          }))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      ),
    );
  }

  async getImportPreview(id: string): Promise<ImportBatch> {
    return this.withLatency(() => copy(this.findImport(id)));
  }

  async previewImport(input: CreateImportPreviewInput): Promise<ImportBatch> {
    return this.withLatency(() => {
      if (!input.fileName.trim().toLowerCase().endsWith('.csv')) {
        throw new MockApiError('VALIDATION', 'Choose a CSV file for this mock import.');
      }
      const account = this.findActiveAccount(input.accountId);
      const id = this.nextId('import');
      const rows: ImportRow[] = [
        this.importRow(id, account.id, 2, '2026-08-13', 'Weekly groceries', 4_325, 'category-demo-groceries'),
        this.importRow(id, account.id, 3, '2026-08-14', 'Rail travel', 2_600, 'category-demo-rail'),
        this.importRow(id, account.id, 4, '2026-08-12', 'Local travel', 1_560, 'category-demo-transit'),
      ];
      const batch: ImportBatch = {
        id,
        fileName: input.fileName.trim(),
        accountId: account.id,
        accountName: account.name,
        createdAt: MOCK_NOW,
        expiresAt: '2026-08-19T12:00:00.000Z',
        committedAt: null,
        status: 'PREVIEW',
        contentHash: batchContentHash(
          input.fileName,
          rows.map((row) => row.sourceFingerprint),
        ),
        rows,
        importedCount: 0,
        version: 1,
      };
      this.state.imports.push(batch);
      return copy(batch);
    });
  }

  async updateImportRow(importId: string, rowId: string, input: UpdateImportRowInput): Promise<ImportBatch> {
    return this.withLatency(() => {
      const batch = this.findImport(importId);
      this.assertImportEditable(batch);
      this.assertVersion(batch.version, input.expectedVersion);
      const row = batch.rows.find((candidate) => candidate.id === rowId);
      if (!row) throw new MockApiError('NOT_FOUND', 'Import row not found.');
      if (input.included && row.status !== 'READY')
        throw new MockApiError('VALIDATION', 'Duplicate or invalid rows cannot be included.');

      const categoryId = 'categoryId' in input ? (input.categoryId ?? null) : row.categoryId;
      const category = categoryId ? this.findActiveCategory(categoryId) : null;
      const warnings =
        row.status === 'DUPLICATE' ? row.warnings : category ? [] : ['Choose a category before committing'];
      const updatedRow: ImportRow = {
        ...row,
        categoryId,
        categoryName: category?.name ?? null,
        kind: input.kind ?? row.kind,
        included: input.included ?? row.included,
        warnings,
      };
      const updated: ImportBatch = {
        ...batch,
        rows: batch.rows.map((candidate) => (candidate.id === rowId ? updatedRow : candidate)),
        version: batch.version + 1,
      };
      this.replace(this.state.imports, updated);
      return copy(updated);
    });
  }

  async commitImport(
    importId: string,
    expectedVersion: number,
    expectedContentHash: string,
  ): Promise<ImportCommitResult> {
    return this.withLatency(() => {
      const batch = this.findImport(importId);
      this.assertImportEditable(batch);
      this.assertVersion(batch.version, expectedVersion);
      if (batch.contentHash !== expectedContentHash) {
        throw new MockApiError('CONFLICT', 'The statement changed since it was previewed. Preview it again.');
      }
      const includedRows = batch.rows.filter((row) => row.included);

      if (includedRows.length === 0) throw new MockApiError('VALIDATION', 'Select at least one row to import.');
      if (includedRows.some((row) => row.status !== 'READY' || row.categoryId === null)) {
        throw new MockApiError('VALIDATION', 'Resolve all selected row warnings before committing.');
      }

      const createdTransactions = includedRows.map((row) =>
        this.buildTransaction(
          {
            accountId: batch.accountId,
            categoryId: row.categoryId,
            description: row.description,
            amountMinor: row.amountMinor,
            kind: row.kind,
            flow: row.flow,
            localDate: row.localDate,
          },
          'IMPORT',
          { importRowFingerprint: row.sourceFingerprint },
        ),
      );
      for (const transaction of createdTransactions) {
        this.state.transactions.push(transaction);
        this.adjustBalance(transaction, 1);
      }

      const updated: ImportBatch = {
        ...batch,
        committedAt: MOCK_NOW,
        status: 'COMMITTED',
        importedCount: createdTransactions.length,
        version: batch.version + 1,
      };
      this.replace(this.state.imports, updated);
      return copy({ batch: updated, createdTransactions });
    });
  }

  async reset(): Promise<void> {
    return this.withLatency(() => {
      this.state = initialState(this.scenario);
      this.sequence = 1;
    });
  }

  private dashboard(month: Month): DashboardSummary {
    this.validMonth(month);
    const window = ledgerWindowFor(month, MOCK_TODAY);
    return summariseMonth({
      month,
      today: MOCK_TODAY,
      asOf: MOCK_NOW,
      ledgerWindow: this.activeTransactionsBetween(window.from, window.to).map((transaction) =>
        this.projectTransaction(transaction),
      ),
      budgets: this.state.budgets,
      budgetDefaults: this.state.budgetDefaults,
      categories: this.state.categories,
    });
  }

  private activeTransactionsForMonth(month: Month): Transaction[] {
    return this.activeTransactionsBetween(monthStart(month), lastDateOfMonth(month));
  }

  private activeTransactionsBetween(from: LocalDate, to: LocalDate): Transaction[] {
    return this.state.transactions.filter(
      (transaction) => transaction.voidedAt === null && transaction.localDate >= from && transaction.localDate <= to,
    );
  }

  private buildTransaction(
    input: CreateTransactionInput,
    origin: Transaction['origin'],
    identity: TransactionIdentity = {},
  ): Transaction {
    const account = this.findActiveAccount(input.accountId);
    const category = input.categoryId ? this.findActiveCategory(input.categoryId) : null;
    const description = this.validName(input.description, 'Description');
    this.validMinor(input.amountMinor, 'Amount');
    this.validDate(input.localDate);
    const occurredAt = input.occurredAt ?? `${input.localDate}T12:00:00.000Z`;
    this.validOccurredAt(occurredAt, input.localDate);

    return {
      id: this.nextId('transaction'),
      accountId: account.id,
      accountName: account.name,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      description,
      amountMinor: input.amountMinor,
      currency: 'GBP',
      kind: input.kind,
      flow: input.flow,
      origin,
      occurredAt,
      localDate: input.localDate,
      timePrecision: input.occurredAt ? 'MINUTE' : 'DATE',
      timezone: 'Europe/London',
      scheduleId: identity.scheduleId ?? null,
      occurrenceDate: identity.occurrenceDate ?? null,
      importRowFingerprint: identity.importRowFingerprint ?? null,
      receipt: input.receipt ? copy(input.receipt) : null,
      voidedAt: null,
      voidReason: null,
      createdAt: MOCK_NOW,
      updatedAt: MOCK_NOW,
      version: 1,
    };
  }

  private importRow(
    importId: string,
    accountId: string,
    rowNumber: number,
    localDate: LocalDate,
    description: string,
    amountMinor: number,
    categoryId: string,
  ): ImportRow {
    const category = this.findActiveCategory(categoryId);
    const sourceFingerprint = rowFingerprint({ accountId, localDate, description, amountMinor, flow: 'DEBIT' });
    const duplicate = this.state.transactions.some(
      (transaction) => transaction.voidedAt === null && transaction.importRowFingerprint === sourceFingerprint,
    );

    return {
      id: `${importId}-row-${rowNumber}`,
      rowNumber,
      localDate,
      description,
      amountMinor,
      flow: 'DEBIT',
      kind: 'SPENDING',
      categoryId: category.id,
      categoryName: category.name,
      status: duplicate ? 'DUPLICATE' : 'READY',
      sourceFingerprint,
      warnings: duplicate ? ['Matches an existing transaction'] : [],
      included: !duplicate,
    };
  }

  private adjustBalance(transaction: Transaction, direction: 1 | -1): void {
    const account = this.findAccount(transaction.accountId);
    const signedAmount = transaction.flow === 'CREDIT' ? transaction.amountMinor : -transaction.amountMinor;
    account.balanceMinor += signedAmount * direction;
  }

  private sortTransactions(transactions: Transaction[], sort: NonNullable<TransactionFilters['sort']>): void {
    transactions.sort((left, right) => {
      if (sort === 'OLDEST') return left.occurredAt.localeCompare(right.occurredAt);
      if (sort === 'AMOUNT_HIGH') return right.amountMinor - left.amountMinor;
      if (sort === 'AMOUNT_LOW') return left.amountMinor - right.amountMinor;
      return right.occurredAt.localeCompare(left.occurredAt);
    });
  }

  private validRecurrence(recurrence: ScheduleRecurrence): void {
    if (recurrence.frequency === 'ONCE') {
      this.validDate(recurrence.date);
      return;
    }
    if (recurrence.frequency === 'WEEKLY') {
      if (
        !Number.isInteger(recurrence.intervalWeeks) ||
        recurrence.intervalWeeks < 1 ||
        recurrence.intervalWeeks > 52
      ) {
        throw new MockApiError('VALIDATION', 'Weekly interval must be between 1 and 52.');
      }
      return;
    }
    if (!Number.isInteger(recurrence.day) || recurrence.day < 1 || recurrence.day > 31) {
      throw new MockApiError('VALIDATION', 'Schedule day must be between 1 and 31.');
    }
    if (
      recurrence.frequency === 'YEARLY' &&
      (!Number.isInteger(recurrence.month) || recurrence.month < 1 || recurrence.month > 12)
    ) {
      throw new MockApiError('VALIDATION', 'Schedule month must be between 1 and 12.');
    }
  }

  private assertImportEditable(batch: ImportBatch): void {
    if (batch.status !== 'PREVIEW') throw new MockApiError('CONFLICT', 'This import can no longer be changed.');
    if (batch.expiresAt <= MOCK_NOW) throw new MockApiError('CONFLICT', 'This import preview has expired.');
  }

  private projectTransaction(transaction: Transaction): Transaction {
    return {
      ...transaction,
      accountName: this.findAccount(transaction.accountId).name,
      categoryName: transaction.categoryId ? this.findCategory(transaction.categoryId).name : null,
    };
  }

  private projectSchedule(schedule: Schedule): Schedule {
    return {
      ...schedule,
      accountName: this.findAccount(schedule.accountId).name,
      categoryName: schedule.categoryId ? this.findCategory(schedule.categoryId).name : null,
    };
  }

  private findAccount(id: string): Account {
    const account = this.state.accounts.find((candidate) => candidate.id === id);
    if (!account) throw new MockApiError('NOT_FOUND', 'Account not found.');
    return account;
  }

  private findActiveAccount(id: string): Account {
    const account = this.findAccount(id);
    this.assertActive(account.deactivatedAt, 'Account');
    return account;
  }

  private findCategory(id: string): Category {
    const category = this.state.categories.find((candidate) => candidate.id === id);
    if (!category) throw new MockApiError('NOT_FOUND', 'Category not found.');
    return category;
  }

  private findActiveCategory(id: string): Category {
    const category = this.findCategory(id);
    this.assertActive(category.deactivatedAt, 'Category');
    return category;
  }

  private findActiveSpendingCategory(id: string): Category {
    const category = this.findActiveCategory(id);
    if (category.group === 'Income' || category.group === 'Investment') {
      throw new MockApiError('VALIDATION', 'Budgets can only be set for spending categories.');
    }
    return category;
  }

  private findTransaction(id: string): Transaction {
    const transaction = this.state.transactions.find((candidate) => candidate.id === id);
    if (!transaction) throw new MockApiError('NOT_FOUND', 'Transaction not found.');
    return transaction;
  }

  private findSchedule(id: string): Schedule {
    const schedule = this.state.schedules.find((candidate) => candidate.id === id);
    if (!schedule) throw new MockApiError('NOT_FOUND', 'Schedule not found.');
    return schedule;
  }

  private findImport(id: string): ImportBatch {
    const batch = this.state.imports.find((candidate) => candidate.id === id);
    if (!batch) throw new MockApiError('NOT_FOUND', 'Import not found.');
    return batch;
  }

  private replace<T extends { id: string }>(items: T[], updated: T): void {
    const index = items.findIndex((item) => item.id === updated.id);
    if (index === -1) throw new MockApiError('NOT_FOUND', 'Item not found.');
    items[index] = updated;
  }

  private assertVersion(actual: number, expected: number): void {
    if (actual !== expected)
      throw new MockApiError('CONFLICT', 'This item changed since it was loaded. Refresh and try again.');
  }

  private assertActive(deactivatedAt: string | null, label: string): void {
    if (deactivatedAt !== null) throw new MockApiError('CONFLICT', `${label} is already inactive.`);
  }

  private validName(value: string, label: string): string {
    const name = value.trim();
    if (name.length < 1 || name.length > 100)
      throw new MockApiError('VALIDATION', `${label} must be between 1 and 100 characters.`);
    return name;
  }

  private validMinor(value: number, label: string, allowZero = false): void {
    const minimum = allowZero ? 0 : 1;
    if (!Number.isSafeInteger(value) || value < minimum)
      throw new MockApiError('VALIDATION', `${label} must be a whole number of pence${allowZero ? ' or zero' : ''}.`);
  }

  private validSignedMinor(value: number, label: string): void {
    if (!Number.isSafeInteger(value)) throw new MockApiError('VALIDATION', `${label} must be a whole number of pence.`);
  }

  private validColour(value: string): void {
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new MockApiError('VALIDATION', 'Colour must be a six-digit hex value.');
  }

  private validLocale(value: AppLocale): void {
    if (value !== 'en-GB' && value !== 'zh-CN') {
      throw new MockApiError('VALIDATION', 'Locale is not supported.');
    }
  }

  private validMonth(value: Month): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new MockApiError('VALIDATION', 'Month must use YYYY-MM format.');
  }

  private validDate(value: LocalDate): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value))
      throw new MockApiError('VALIDATION', 'Date must use YYYY-MM-DD format.');
    const parsed = new Date(`${value}T12:00:00.000Z`);
    if (Number.isNaN(parsed.valueOf()) || formatDate(parsed) !== value)
      throw new MockApiError('VALIDATION', 'Date is not valid.');
  }

  private validOccurredAt(value: string, localDate: LocalDate): void {
    if (!value.startsWith(localDate) || Number.isNaN(Date.parse(value))) {
      throw new MockApiError('VALIDATION', 'Transaction time must be an ISO timestamp on the selected local date.');
    }
  }

  private validPage(page: number, pageSize: number): void {
    if (!Number.isInteger(page) || page < 1)
      throw new MockApiError('VALIDATION', 'Page must be a positive whole number.');
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new MockApiError('VALIDATION', `Page size must be between 1 and ${MAX_PAGE_SIZE}.`);
    }
  }

  private nextId(prefix: string): string {
    const id = `${prefix}-demo-new-${String(this.sequence).padStart(4, '0')}`;
    this.sequence += 1;
    return id;
  }

  private async withLatency<T>(operation: () => T): Promise<T> {
    if (this.latencyMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.latencyMs));
    }
    if (this.session === 'EXPIRED') {
      throw new MockApiError('UNAUTHENTICATED', 'The session has ended. Sign in again to continue.');
    }
    return operation();
  }
}

export function createMockApi(scenario: MockScenario = 'DEFAULT', options: MockApiOptions = {}): MockFinanceApi {
  const latencyMs = options.latencyMs ?? DEFAULT_LATENCY_MS;
  if (!Number.isFinite(latencyMs) || latencyMs < 0)
    throw new MockApiError('VALIDATION', 'Mock latency cannot be negative.');
  return new InMemoryMockApi(scenario, latencyMs, options.session ?? 'ACTIVE');
}

export const mockApi = createMockApi();
