import { DomainError } from './errors.js';
import { canBeCategorized, requiresTransferGroup } from './transaction-kind.js';
import type { TransactionKind } from './transaction-kind.js';
import type { Money } from './money.js';
import type {
  AccountId,
  CategoryId,
  MerchantKey,
  TransactionId,
  TransferGroupId,
  UserId,
} from './ids.js';

export type TransactionDirection = 'debit' | 'credit';
export type TransactionSource = 'sms' | 'manual' | 'statement';

export interface CreateTransactionInput {
  id: TransactionId;
  /** Owner. Denormalized from the account on purpose: it lets every
   *  query filter by user without joining accounts first, and a missing
   *  tenancy filter is the kind of bug that leaks someone else's bank
   *  history. */
  userId: UserId;
  accountId: AccountId;
  amount: Money;
  direction: TransactionDirection;
  kind: TransactionKind;
  /**
   * Whether this counts toward the spending total. The Application layer
   * computes this via defaultCountsAsSpending(kind, policy), or takes an
   * explicit override from the user. Domain does not read user settings
   * itself — it only enforces that the value is coherent with the kind.
   */
  countsAsSpending: boolean;
  merchantKey: MerchantKey;
  /** The merchant name exactly as it appeared in the source — may be
   *  Arabic text from an NBE or Banque Misr SMS, e.g. "كارفور المعادي". */
  merchantRaw: string;
  occurredAt: Date;
  source: TransactionSource;
  /** Required for 'transfer' and 'trade', forbidden otherwise. */
  transferGroupId?: TransferGroupId;
}

/**
 * Transaction is an ENTITY — identity persists across changes. Compare
 * with Money, which is a value object: 100 EGP has no identity, it is
 * simply its value.
 *
 * Most fields are readonly because the underlying event never changes:
 * the SMS said what it said. The two things that CAN change are the
 * category and whether it counts as spending — both are your judgement
 * about a fixed fact, and both change only through methods that enforce
 * the rules below.
 */
export class Transaction {
  readonly id: TransactionId;
  readonly userId: UserId;
  readonly accountId: AccountId;
  readonly amount: Money;
  readonly direction: TransactionDirection;
  readonly kind: TransactionKind;
  readonly merchantKey: MerchantKey;
  readonly merchantRaw: string;
  readonly occurredAt: Date;
  readonly source: TransactionSource;
  readonly transferGroupId: TransferGroupId | null;

  private categoryId: CategoryId | null;
  private countsAsSpending: boolean;

  private constructor(input: CreateTransactionInput) {
    this.id = input.id;
    this.userId = input.userId;
    this.accountId = input.accountId;
    this.amount = input.amount;
    this.direction = input.direction;
    this.kind = input.kind;
    this.merchantKey = input.merchantKey;
    this.merchantRaw = input.merchantRaw;
    this.occurredAt = input.occurredAt;
    this.source = input.source;
    this.transferGroupId = input.transferGroupId ?? null;
    this.countsAsSpending = input.countsAsSpending;
    this.categoryId = null;
  }

  static create(input: CreateTransactionInput): Transaction {
    if (input.merchantRaw.trim().length === 0) {
      throw new DomainError('Transaction merchantRaw cannot be empty');
    }
    // A transaction dated in the future is almost always a parsing bug
    // (wrong timezone, or a date format read as DD/MM instead of MM/DD).
    // Failing here surfaces it immediately instead of quietly corrupting
    // next month's chart.
    if (input.occurredAt.getTime() > Date.now()) {
      throw new DomainError('Transaction occurredAt cannot be in the future');
    }

    const needsGroup = requiresTransferGroup(input.kind);
    if (needsGroup && input.transferGroupId === undefined) {
      throw new DomainError(`A '${input.kind}' transaction requires a transferGroupId`);
    }
    if (!needsGroup && input.transferGroupId !== undefined) {
      throw new DomainError(`A '${input.kind}' transaction cannot have a transferGroupId`);
    }

    // The core guard against double-counting: moving your own money is
    // never spending. A credit card PAYMENT is a transfer; the original
    // CHARGE was the expense. Counting both inflates every total.
    if (input.countsAsSpending && needsGroup) {
      throw new DomainError(`A '${input.kind}' transaction can never count as spending`);
    }

    return new Transaction(input);
  }

  /** Assigns or corrects the spending category. The only way categoryId
   *  is ever written — there is no public setter. */
  categorize(categoryId: CategoryId): void {
    if (!canBeCategorized(this.kind)) {
      throw new DomainError(`A '${this.kind}' transaction cannot be categorized`);
    }
    this.categoryId = categoryId;
  }

  clearCategory(): void {
    this.categoryId = null;
  }

  /**
   * Per-transaction override of the spending default. Lets the user
   * exclude a reimbursed work lunch, or include a fee they'd globally
   * turned off, without touching their settings or any other row.
   */
  setCountsAsSpending(value: boolean): void {
    if (value && requiresTransferGroup(this.kind)) {
      throw new DomainError(`A '${this.kind}' transaction can never count as spending`);
    }
    this.countsAsSpending = value;
  }

  getCategoryId(): CategoryId | null {
    return this.categoryId;
  }

  isCategorized(): boolean {
    return this.categoryId !== null;
  }

  getCountsAsSpending(): boolean {
    return this.countsAsSpending;
  }
}
