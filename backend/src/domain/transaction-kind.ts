/**
 * WHAT HAPPENED. An immutable fact about the event itself.
 *
 * Deliberately kept separate from "does this count as spending", which
 * is a reporting CHOICE and lives on the transaction as its own boolean.
 * Welding the two together is what makes an expense tracker impossible
 * to extend to credit cards and investments.
 */
export type TransactionKind =
  | 'expense' // money genuinely left your pocket
  | 'income' // salary, freelance, refunds
  | 'transfer' // your own money moving between your own accounts
  | 'trade' // cash <-> asset (buying or selling shares)
  | 'dividend' // payout from a holding
  | 'fee' // brokerage commission, bank charges
  | 'interest' // credit card interest, loan interest
  | 'adjustment'; // manual correction to fix a wrong balance

export const TRANSACTION_KINDS: readonly TransactionKind[] = [
  'expense',
  'income',
  'transfer',
  'trade',
  'dividend',
  'fee',
  'interest',
  'adjustment',
];

/**
 * A transfer and a trade both have TWO sides — money leaves one account
 * and arrives somewhere else. Both rows share a transferGroupId so they
 * can be read back as one movement.
 */
export function requiresTransferGroup(kind: TransactionKind): boolean {
  return kind === 'transfer' || kind === 'trade';
}

/**
 * Spending categories ("Groceries", "Transport") describe where money
 * WENT. Moving your own money between your own accounts has no such
 * answer, so categorizing a transfer or a trade is meaningless and is
 * rejected rather than silently allowed.
 */
export function canBeCategorized(kind: TransactionKind): boolean {
  return !requiresTransferGroup(kind);
}
