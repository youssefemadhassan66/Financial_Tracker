import { DomainError } from './errors.js';
import { canHoldPositions, isLiabilityAccount } from './account-type.js';
import type { AccountType } from './account-type.js';
import type { Currency } from './currency.js';
import type { AccountId, UserId } from './ids.js';

export interface CreateAccountInput {
  id: AccountId;
  /** Owner. Every account belongs to exactly one user. */
  userId: UserId;
  name: string;
  type: AccountType;
  currency: Currency;
  /** Last 4 digits of every card and account number that belongs to this
   *  account. Used to match an incoming SMS to the right account. */
  last4s?: readonly string[];
}

/** A bank account rarely has more than its account number, a debit card
 *  and a reissued card or two. The cap stops a runaway client. */
export const MAX_LAST4S = 10;

/**
 * Account is an ENTITY — it has identity and outlives changes to its data.
 * Renaming "CIB Card" to "CIB Visa" doesn't make it a different account.
 *
 * Accounts are ARCHIVED, never deleted. Deleting one would orphan every
 * transaction that points at it, and those transactions are history you
 * still need for last year's reports. Archiving hides it from pickers
 * while keeping the history intact.
 */
export class Account {
  readonly id: AccountId;
  readonly userId: UserId;
  readonly type: AccountType;
  readonly currency: Currency;

  private name: string;
  private last4s: readonly string[];
  private archivedAt: Date | null;

  private constructor(input: CreateAccountInput, name: string, last4s: readonly string[]) {
    this.id = input.id;
    this.userId = input.userId;
    this.type = input.type;
    this.currency = input.currency;
    this.name = name;
    this.last4s = last4s;
    this.archivedAt = null;
  }

  static create(input: CreateAccountInput): Account {
    const name = input.name.trim();
    if (name.length === 0) {
      throw new DomainError('Account name cannot be empty');
    }
    return new Account(input, name, checkLast4s(input.last4s ?? []));
  }

  /** Rebuilds a stored account, re-validating it and keeping its archive state. */
  static restore(input: CreateAccountInput, archivedAt: Date | null): Account {
    const account = Account.create(input);
    account.archivedAt = archivedAt;
    return account;
  }

  rename(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new DomainError('Account name cannot be empty');
    }
    this.name = trimmed;
  }

  /** Replaces the whole list, so dropping a cancelled card is the same call. */
  setLast4s(list: readonly string[]): void {
    this.last4s = checkLast4s(list);
  }

  getLast4s(): readonly string[] {
    return this.last4s;
  }

  hasLast4(digits: string): boolean {
    return this.last4s.includes(digits);
  }

  archive(): void {
    if (this.archivedAt !== null) {
      throw new DomainError('Account is already archived');
    }
    this.archivedAt = new Date();
  }

  getName(): string {
    return this.name;
  }

  isArchived(): boolean {
    return this.archivedAt !== null;
  }

  getArchivedAt(): Date | null {
    return this.archivedAt;
  }

  /** True when a positive balance means debt rather than savings. */
  isLiability(): boolean {
    return isLiabilityAccount(this.type);
  }

  canHoldPositions(): boolean {
    return canHoldPositions(this.type);
  }
}

/**
 * One bank account, several numbers: CIB quotes the debit CARD digits on
 * a purchase ("**4444") but the ACCOUNT digits on an InstaPay transfer
 * ("********2222"). Both have to route to the same account.
 */
function checkLast4s(list: readonly string[]): readonly string[] {
  for (const digits of list) {
    if (!/^\d{4}$/.test(digits)) {
      throw new DomainError(`Card or account digits "${digits}" must be exactly 4 digits`);
    }
  }
  const unique = [...new Set(list)];
  if (unique.length > MAX_LAST4S) {
    throw new DomainError(`An account can have at most ${MAX_LAST4S} card or account numbers`);
  }
  return unique;
}
