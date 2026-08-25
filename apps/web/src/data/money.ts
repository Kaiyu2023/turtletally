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

// JSON has no negative zero: `-0` serialises as `0`, and the Rust integers on
// the other side of the contract cannot represent it at all. A total that flips
// sign is negated through zero so it never becomes one.
export function negated(amountMinor: number): number {
  return 0 - amountMinor;
}
