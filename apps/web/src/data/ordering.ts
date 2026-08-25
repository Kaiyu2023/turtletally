// Code-point order. `localeCompare` depends on the runtime's collation, and a
// server that serves this contract in another language cannot be relied on to
// reproduce it. Every ordering the contract promises is defined here so both
// implementations can agree exactly.
export function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

export function compareNames(left: string, right: string): number {
  return compareText(left.toLowerCase(), right.toLowerCase()) || compareText(left, right);
}
