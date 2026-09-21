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
  /** Last 4 digits of the card or account number, when known. Used to
   *  match an incoming SMS to the right account. */
  last4?: string;
}

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
  readonly last4: string | null;

  private name: string;
  private archivedAt: Date | null;

  private constructor(input: CreateAccountInput, name: string) {
    this.id = input.id;
    this.userId = input.userId;
    this.type = input.type;
    this.currency = input.currency;
    this.last4 = input.last4 ?? null;
    this.name = name;
    this.archivedAt = null;
  }

  static create(input: CreateAccountInput): Account {
    const name = input.name.trim();
    if (name.length === 0) {
      throw new DomainError('Account name cannot be empty');
    }
    if (input.last4 !== undefined && !/^\d{4}$/.test(input.last4)) {
      throw new DomainError('Account last4 must be exactly 4 digits');
    }
    return new Account(input, name);
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
