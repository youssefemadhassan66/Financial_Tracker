import type { Direction, TransactionView } from './api/types';

/**
 * "455" and "455.00" are the same amount, but the form sends what the user
 * typed while the API always returns two decimals. Compare a canonical form
 * built with string operations only (never a JS number).
 */
export function canonicalAmount(amount: string): string {
  const [whole, fraction = ''] = amount.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

/**
 * Finds a possible duplicate transaction in a set of transactions.
 * Matches when the amount (canonical form) and direction are equal.
 */
export function findPossibleDuplicate(
  rows: readonly TransactionView[],
  amount: string,
  direction: Direction,
): TransactionView | null {
  const wanted = canonicalAmount(amount);
  return rows.find((tx) => canonicalAmount(tx.amount) === wanted && tx.direction === direction) ?? null;
}
