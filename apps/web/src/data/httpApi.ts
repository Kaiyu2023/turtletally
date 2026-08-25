import { ApiError } from './types';
import type {
  Account,
  ApiErrorCode,
  Budget,
  BudgetDefault,
  BudgetProgress,
  Category,
  CreateAccountInput,
  CreateCategoryInput,
  CreateImportPreviewInput,
  CreateScheduleInput,
  CreateStatementUploadInput,
  CreateTransactionInput,
  DashboardSummary,
  DownloadGrant,
  FinanceApi,
  ImportHistoryItem,
  LocalDate,
  Month,
  Receipt,
  RequestUploadInput,
  Schedule,
  SetBudgetDefaultInput,
  SetBudgetInput,
  Transaction,
  TransactionFilters,
  TransactionPage,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateImportRowInput,
  UpdateScheduleInput,
  UpdateTransactionInput,
  UpdateUserPreferencesInput,
  UserPreferences,
} from './types';

const CSRF_COOKIE = '__Host-finance_csrf';
const CSRF_HEADER = 'x-csrf-token';
const ERROR_CODES: readonly ApiErrorCode[] = ['NOT_FOUND', 'CONFLICT', 'VALIDATION', 'UNAUTHENTICATED'];

type Query = Record<string, string | number | boolean | undefined>;

function csrfToken(): string | null {
  const match = document.cookie
    .split(';')
    .map((pair) => pair.trim().split('='))
    .find(([name]) => name === CSRF_COOKIE);
  return match?.[1] ?? null;
}

function queryString(query: Query): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(name, String(value));
  }
  const rendered = params.toString();
  return rendered ? `?${rendered}` : '';
}

async function failure(response: Response): Promise<never> {
  const body: unknown = await response.json().catch(() => null);
  const code = (body as { code?: string } | null)?.code;
  const message = (body as { message?: string } | null)?.message;

  if (typeof code === 'string' && (ERROR_CODES as readonly string[]).includes(code)) {
    throw new ApiError(code as ApiErrorCode, message ?? 'That request could not be completed.');
  }
  if (response.status === 401) {
    throw new ApiError('UNAUTHENTICATED', 'The session has ended. Sign in again to continue.');
  }
  throw new Error(`The server responded with ${response.status}.`);
}

// The session lives in a cookie the browser attaches itself, and a mutation
// also carries the confirmation token from the readable cookie beside it. The
// server checks both, so a cross-site request fails even with the cookie.
export function createHttpApi(baseUrl: string): FinanceApi {
  const root = baseUrl.replace(/\/$/, '');

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = new Headers();
    if (body !== undefined) headers.set('content-type', 'application/json');

    if (method !== 'GET') {
      const token = csrfToken();
      if (token) headers.set(CSRF_HEADER, token);
    }

    let response: Response;
    try {
      response = await fetch(`${root}${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new Error('The server could not be reached.');
    }

    if (!response.ok) return failure(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  const get = <T>(path: string, query: Query = {}) => request<T>('GET', `${path}${queryString(query)}`);

  return {
    getUserPreferences: () => get<UserPreferences>('/api/preferences'),
    updateUserPreferences: (input: UpdateUserPreferencesInput) =>
      request<UserPreferences>('PUT', '/api/preferences', input),

    listAccounts: (includeInactive = false) => get<Account[]>('/api/accounts', { includeInactive }),
    createAccount: (input: CreateAccountInput) => request<Account>('POST', '/api/accounts', input),
    updateAccount: (id: string, input: UpdateAccountInput) =>
      request<Account>('PATCH', `/api/accounts/${encodeURIComponent(id)}`, input),
    deactivateAccount: (id: string, expectedVersion: number) =>
      request<Account>('POST', `/api/accounts/${encodeURIComponent(id)}/deactivate`, { expectedVersion }),

    listCategories: (includeInactive = false) => get<Category[]>('/api/categories', { includeInactive }),
    createCategory: (input: CreateCategoryInput) => request<Category>('POST', '/api/categories', input),
    updateCategory: (id: string, input: UpdateCategoryInput) =>
      request<Category>('PATCH', `/api/categories/${encodeURIComponent(id)}`, input),
    deactivateCategory: (id: string, expectedVersion: number) =>
      request<Category>('POST', `/api/categories/${encodeURIComponent(id)}/deactivate`, { expectedVersion }),

    listTransactions: (filters: TransactionFilters = {}) => get<TransactionPage>('/api/transactions', filters as Query),
    getTransaction: (id: string) => get<Transaction>(`/api/transactions/${encodeURIComponent(id)}`),
    createTransaction: (input: CreateTransactionInput) => request<Transaction>('POST', '/api/transactions', input),
    updateTransaction: (id: string, input: UpdateTransactionInput) =>
      request<Transaction>('PATCH', `/api/transactions/${encodeURIComponent(id)}`, input),
    voidTransaction: (id: string, expectedVersion: number, reason?: string) =>
      request<Transaction>('POST', `/api/transactions/${encodeURIComponent(id)}/void`, {
        expectedVersion,
        ...(reason === undefined ? {} : { reason }),
      }),

    listBudgets: (month: Month) => get<BudgetProgress[]>('/api/budgets', { month }),
    listBudgetDefaults: () => get<BudgetDefault[]>('/api/budget-defaults'),
    setBudget: (input: SetBudgetInput) => request<Budget>('PUT', '/api/budgets', input),
    setBudgetDefault: (input: SetBudgetDefaultInput) => request<BudgetDefault>('PUT', '/api/budget-defaults', input),

    getDashboard: (month: Month) => get<DashboardSummary>('/api/dashboard', { month }),

    listSchedules: (includeInactive = false) => get<Schedule[]>('/api/schedules', { includeInactive }),
    createSchedule: (input: CreateScheduleInput) => request<Schedule>('POST', '/api/schedules', input),
    updateSchedule: (id: string, input: UpdateScheduleInput) =>
      request<Schedule>('PATCH', `/api/schedules/${encodeURIComponent(id)}`, input),
    deactivateSchedule: (id: string, expectedVersion: number) =>
      request<Schedule>('POST', `/api/schedules/${encodeURIComponent(id)}/deactivate`, { expectedVersion }),
    runDueSchedules: (asOf: LocalDate) => notDeployed(`Scheduled runs happen on the server (${asOf}).`),

    requestReceiptUpload: (input: RequestUploadInput) =>
      request<{ uploadId: string; uploadUrl: string; expiresAt: string }>('POST', '/api/receipts/uploads', input),
    completeReceiptUpload: (uploadId: string, checksum: string) =>
      request<Receipt>('POST', `/api/receipts/uploads/${encodeURIComponent(uploadId)}/complete`, { checksum }),
    getReceiptDownloadUrl: (receiptId: string) =>
      get<DownloadGrant>(`/api/receipts/${encodeURIComponent(receiptId)}/download`),

    // Statement import is a later milestone (ADR 0009). The route exists in the
    // browser draft against the mock and has no server behind it yet.
    requestStatementUpload: (input: CreateStatementUploadInput) => notDeployed(input.fileName),
    listImports: () => Promise.resolve<ImportHistoryItem[]>([]),
    getImportPreview: (id: string) => notDeployed(id),
    previewImport: (input: CreateImportPreviewInput) => notDeployed(input.uploadId),
    updateImportRow: (importId: string, rowId: string, input: UpdateImportRowInput) =>
      notDeployed(`${importId}/${rowId}/${input.expectedVersion}`),
    commitImport: (importId: string) => notDeployed(importId),
  };
}

function notDeployed<T>(_detail: string): Promise<T> {
  return Promise.reject(new ApiError('NOT_FOUND', 'That feature is not part of this release yet.'));
}
