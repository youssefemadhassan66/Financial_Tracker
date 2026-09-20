import { DomainError } from './errors.js';
import type { Money } from './money.js';
import type { AccountId, CategoryId, MerchantKey, TransactionId } from './ids.js';

export type TransactionDirection = 'debit' | 'credit';
export type TransactionSource = 'sms' | 'manual';

export interface CreateTransactionInput {
  id: TransactionId;
  accountId: AccountId;
  amount: Money;
  direction: TransactionDirection;
  merchantKey: MerchantKey;
  /** The merchant name exactly as it appeared in the source — may be
   *  Arabic text from an NBE or Banque Misr SMS, e.g. "كارفور المعادي". */
  merchantRaw: string;
  occurredAt: Date;
  source: TransactionSource;
}

/**
 * Transaction is an ENTITY, not a value object — the direct contrast to
 * Money above.
 *
 * An entity is defined by IDENTITY, not by its current data. Transaction
 * #451 is still transaction #451 after you change its category. Compare
 * that to Money: 100 EGP has no identity — it's just "100 EGP", and if
 * you change the amount, it's a different Money, full stop.
 *
 * That's why this class looks different from Money:
 *  - it has an `id`
 *  - most fields are still readonly (the SMS content itself never
 *    changes after the fact), but `categoryId` is allowed to change,
 *    because "which category this belongs to" is genuinely something
 *    that gets corrected over time — and it changes THROUGH A METHOD,
 *    never through a public field, so the invariant (amount and
 *    category currency must line up, if we ever add that rule) always
 *    has a single place to live.
 */
export class Transaction {
  readonly id: TransactionId;
  readonly accountId: AccountId;
  readonly amount: Money;
  readonly direction: TransactionDirection;
  readonly merchantKey: MerchantKey;
  readonly merchantRaw: string;
  readonly occurredAt: Date;
  readonly source: TransactionSource;

  private categoryId: CategoryId | null;

  private constructor(input: CreateTransactionInput, categoryId: CategoryId | null) {
    this.id = input.id;
    this.accountId = input.accountId;
    this.amount = input.amount;
    this.direction = input.direction;
    this.merchantKey = input.merchantKey;
    this.merchantRaw = input.merchantRaw;
    this.occurredAt = input.occurredAt;
    this.source = input.source;
    this.categoryId = categoryId;
  }

  static create(input: CreateTransactionInput): Transaction {
    if (input.merchantRaw.trim().length === 0) {
      throw new DomainError('Transaction merchantRaw cannot be empty');
    }
    // A "transaction" dated in the future is not a real transaction —
    // it's almost always a parsing bug (wrong timezone, wrong locale
    // for the date format in the SMS). Catching it here, at creation,
    // means the bug surfaces immediately instead of silently corrupting
    // next month's spending chart.
    if (input.occurredAt.getTime() > Date.now()) {
      throw new DomainError('Transaction occurredAt cannot be in the future');
    }

    return new Transaction(input, null);
  }

  /** Assigns or corrects the category. This is the ONLY way categoryId
   *  changes — never assign to it directly, there is no public setter. */
  categorize(categoryId: CategoryId): void {
    this.categoryId = categoryId;
  }

  getCategoryId(): CategoryId | null {
    return this.categoryId;
  }

  isCategorized(): boolean {
    return this.categoryId !== null;
  }
}
