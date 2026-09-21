/**
 * Branded (nominal) types.
 *
 * TypeScript's type system is STRUCTURAL: any two `string` types are
 * interchangeable, because it only looks at shape, not name. That means
 * this compiles even though it's a real bug:
 *
 *   function findCategory(id: string) { ... }
 *   findCategory(transaction.id)   // passed a transaction id, no error!
 *
 * A "brand" is a fake property that exists only at the type level (it's
 * erased at runtime — `as` is a compile-time-only assertion, it costs
 * nothing). It gives each id its own identity, so the mistake above
 * becomes a compile error: TransactionId is no longer assignable to
 * CategoryId, even though both are strings underneath.
 */
type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

/** Every row in this app belongs to a user. The app is single-user in
 *  practice today, but tenancy is baked in from the start — adding a
 *  user_id column after real rows exist is a far harder migration. */
export type UserId = Brand<string, 'UserId'>;

export type TransactionId = Brand<string, 'TransactionId'>;
export type CategoryId = Brand<string, 'CategoryId'>;
export type AccountId = Brand<string, 'AccountId'>;

/** Links the two (or more) rows that make up one movement of money:
 *  the debit side and the credit side of a transfer or a trade. */
export type TransferGroupId = Brand<string, 'TransferGroupId'>;

/**
 * A MerchantKey is the NORMALIZED form of a merchant name, used to look
 * up a category. "CARREFOUR CAIRO #1234" and "Carrefour Maadi" should
 * both resolve to the same key so the categorizer only has to learn the
 * merchant once. Normalization itself lives in Application (Module 7) —
 * this is just the branded id type it produces.
 */
export type MerchantKey = Brand<string, 'MerchantKey'>;

export function newUserId(value: string): UserId {
  return value as UserId;
}
export function newTransactionId(value: string): TransactionId {
  return value as TransactionId;
}
export function newCategoryId(value: string): CategoryId {
  return value as CategoryId;
}
export function newAccountId(value: string): AccountId {
  return value as AccountId;
}
export function newTransferGroupId(value: string): TransferGroupId {
  return value as TransferGroupId;
}
export function newMerchantKey(value: string): MerchantKey {
  return value as MerchantKey;
}
