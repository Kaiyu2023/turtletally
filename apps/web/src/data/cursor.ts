import { ApiError, type Transaction, type TransactionSort } from './types';

// ADR 0007: a list resumes from the last key it returned. Offset paging cannot
// be served without reading a partition from its start, so the cursor carries
// the whole sort key and the reader continues strictly after it.
export interface LedgerCursor {
  readonly sort: TransactionSort;
  readonly occurredAt: string;
  readonly amountMinor: number;
  readonly id: string;
}

export function cursorOf(transaction: Transaction, sort: TransactionSort): string {
  const cursor: LedgerCursor = {
    sort,
    occurredAt: transaction.occurredAt,
    amountMinor: transaction.amountMinor,
    id: transaction.id,
  };
  return encode(JSON.stringify(cursor));
}

export function parseCursor(value: string, sort: TransactionSort): LedgerCursor {
  let cursor: LedgerCursor;
  try {
    cursor = JSON.parse(decode(value)) as LedgerCursor;
  } catch {
    throw new ApiError('VALIDATION', 'That page cursor is not readable. Start the list again.');
  }

  if (cursor.sort !== sort || typeof cursor.id !== 'string' || typeof cursor.occurredAt !== 'string') {
    throw new ApiError('VALIDATION', 'That page cursor belongs to a different query. Start the list again.');
  }

  return cursor;
}

export function compareForSort(
  left: Pick<LedgerCursor, 'occurredAt' | 'amountMinor' | 'id'>,
  right: Pick<LedgerCursor, 'occurredAt' | 'amountMinor' | 'id'>,
  sort: TransactionSort,
): number {
  if (sort === 'AMOUNT_HIGH') return right.amountMinor - left.amountMinor || right.id.localeCompare(left.id);
  if (sort === 'AMOUNT_LOW') return left.amountMinor - right.amountMinor || left.id.localeCompare(right.id);
  if (sort === 'OLDEST') return left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id);
  return right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id);
}

export function isAfterCursor(transaction: Transaction, cursor: LedgerCursor, sort: TransactionSort): boolean {
  return compareForSort(transaction, cursor, sort) > 0;
}

function encode(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decode(value: string): string {
  return atob(value.replaceAll('-', '+').replaceAll('_', '/'));
}
