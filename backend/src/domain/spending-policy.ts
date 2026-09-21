import type { TransactionKind } from './transaction-kind.js';

/**
 * User-configurable rules for what counts toward the spending total.
 *
 * Note this lives in Domain as a plain interface, but the VALUE comes
 * from user settings, which the Application layer loads. Domain defines
 * the rule; it never reaches out to fetch the preference itself.
 */
export interface SpendingPolicy {
  /** Brokerage commissions and bank charges. Default true — they are
   *  real money you paid — but the user can turn this off. */
  countFeesAsSpending: boolean;
}

export const DEFAULT_SPENDING_POLICY: SpendingPolicy = {
  countFeesAsSpending: true,
};

/**
 * The DEFAULT answer for whether a transaction counts as spending.
 *
 * This is only a default. The value is stored per transaction, so the
 * user can override any single row, and — importantly — changing the
 * policy later does NOT rewrite history. Past transactions keep the
 * value they were created with.
 *
 * The switch is exhaustive on purpose: add a new TransactionKind and
 * TypeScript will fail to compile here until you decide how it reports.
 */
export function defaultCountsAsSpending(
  kind: TransactionKind,
  policy: SpendingPolicy,
): boolean {
  switch (kind) {
    case 'expense':
      return true;
    case 'interest':
      // Interest charged on a credit card is money you genuinely paid.
      return true;
    case 'fee':
      return policy.countFeesAsSpending;
    case 'income':
    case 'dividend':
    case 'transfer':
    case 'trade':
    case 'adjustment':
      return false;
  }
}
