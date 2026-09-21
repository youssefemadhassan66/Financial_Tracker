/**
 * The kinds of account this app can hold.
 *
 * Deliberately a closed union rather than a free string: adding a new
 * account type should be a decision you make on purpose, and every
 * `switch` over this type will fail to compile until you handle it.
 */
export type AccountType =
  | 'checking'
  | 'savings'
  | 'cash'
  | 'wallet' // Vodafone Cash, InstaPay wallet, etc.
  | 'credit_card'
  | 'brokerage';

export const ACCOUNT_TYPES: readonly AccountType[] = [
  'checking',
  'savings',
  'cash',
  'wallet',
  'credit_card',
  'brokerage',
];

/**
 * A liability account holds money you OWE, not money you have.
 *
 * This matters for net worth: a credit card with a 3,000 EGP balance
 * makes you 3,000 poorer, while a savings account with 3,000 makes you
 * 3,000 richer. Same number, opposite sign. Getting this wrong is the
 * difference between a correct net-worth figure and a nonsense one.
 */
export function isLiabilityAccount(type: AccountType): boolean {
  return type === 'credit_card';
}

/** Only brokerage accounts can hold tradeable positions (Module 14). */
export function canHoldPositions(type: AccountType): boolean {
  return type === 'brokerage';
}
