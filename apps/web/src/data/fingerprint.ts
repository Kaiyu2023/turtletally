import type { LocalDate, TransactionFlow } from './types';

export interface SourceRow {
  readonly accountId: string;
  readonly localDate: LocalDate;
  readonly description: string;
  readonly amountMinor: number;
  readonly flow: TransactionFlow;
}

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result.toString(16).padStart(8, '0');
}

export function rowFingerprint(row: SourceRow): string {
  const normalised = row.description.trim().toLowerCase().replace(/\s+/g, ' ');
  return hash(`${row.accountId}|${row.localDate}|${row.amountMinor}|${row.flow}|${normalised}`);
}

export function batchContentHash(fileName: string, fingerprints: readonly string[]): string {
  return hash(`${fileName.trim().toLowerCase()}|${fingerprints.join(',')}`);
}
