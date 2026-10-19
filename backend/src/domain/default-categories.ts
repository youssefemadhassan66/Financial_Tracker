export type CategoryKind = 'spending' | 'income';

export interface DefaultCategory {
  name: string;
  kind: CategoryKind;
  icon: string;
}

/**
 * Categories every new user starts with. They can rename them or add
 * their own; these just make the app useful from the first SMS.
 *
 * Note what is NOT here: "Stock Market" or "Investments". Buying shares
 * is not spending — the money changed form, it didn't leave. Trades are
 * reported in their own INVESTING section of the analytics, beside the
 * spending categories, so they are visible without inflating what you
 * spent. See spending-policy.ts and transaction-kind.ts.
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: 'Food & Dining', kind: 'spending', icon: '🍔' },
  { name: 'Groceries', kind: 'spending', icon: '🛒' },
  { name: 'Transport', kind: 'spending', icon: '🚗' },
  { name: 'Travel', kind: 'spending', icon: '✈️' },
  { name: 'Bills & Utilities', kind: 'spending', icon: '💡' },
  { name: 'Subscriptions', kind: 'spending', icon: '🔁' },
  { name: 'Shopping', kind: 'spending', icon: '🛍️' },
  { name: 'Health', kind: 'spending', icon: '💊' },
  { name: 'Entertainment', kind: 'spending', icon: '🎬' },
  { name: 'Education', kind: 'spending', icon: '📚' },
  { name: 'Fees & Charges', kind: 'spending', icon: '🏦' },
  { name: 'Other', kind: 'spending', icon: '📦' },
  { name: 'Salary', kind: 'income', icon: '💼' },
  { name: 'Freelance', kind: 'income', icon: '💻' },
  { name: 'Other Income', kind: 'income', icon: '💰' },
];

/** The category new subscriptions default to. */
export const SUBSCRIPTIONS_CATEGORY_NAME = 'Subscriptions';
