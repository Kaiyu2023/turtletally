import type { TransactionFlow } from './types';

// Money out is negative, money in is positive. Direction lives in the sign of
// the amount and nowhere else, so an amount and its direction cannot disagree.
export function flowOf(amountMinor: number): TransactionFlow {
  return amountMinor < 0 ? 'DEBIT' : 'CREDIT';
}

export function signedAmount(magnitudeMinor: number, flow: TransactionFlow): number {
  return flow === 'DEBIT' ? -magnitudeMinor : magnitudeMinor;
}

export function magnitudeOf(amountMinor: number): number {
  return Math.abs(amountMinor);
}
