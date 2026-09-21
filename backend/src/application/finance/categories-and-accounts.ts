import { randomUUID } from 'node:crypto';
import { Account } from '../../domain/account.js';
import type { AccountType } from '../../domain/account-type.js';
import type { CategoryKind } from '../../domain/default-categories.js';
import type { Currency } from '../../domain/currency.js';
import { newAccountId, type UserId } from '../../domain/ids.js';
import type { AccountRepository, CategoryRecord, CategoryRepository } from '../ports/finance.js';

// ---------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------

export class ListCategories {
  constructor(private readonly categories: CategoryRepository) {}

  execute(userId: UserId): Promise<CategoryRecord[]> {
    return this.categories.listForUser(userId);
  }
}

export interface CreateCategoryInput {
  name: string;
  kind: CategoryKind;
  icon: string | null;
  color: string | null;
}

export class CreateCategory {
  constructor(private readonly categories: CategoryRepository) {}

  execute(userId: UserId, input: CreateCategoryInput): Promise<CategoryRecord> {
    // Users' own categories are never "system" ones — only the seeded
    // defaults are, whatever the request body claims.
    return this.categories.create(userId, { ...input, isSystem: false });
  }
}

// ---------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------

export interface AccountDto {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  last4: string | null;
  isLiability: boolean;
  archived: boolean;
}

export function toAccountDto(account: Account): AccountDto {
  return {
    id: account.id,
    name: account.getName(),
    type: account.type,
    currency: account.currency,
    last4: account.last4,
    isLiability: account.isLiability(),
    archived: account.isArchived(),
  };
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  currency: Currency;
  last4?: string;
}

export class CreateAccount {
  constructor(private readonly accounts: AccountRepository) {}

  async execute(userId: UserId, input: CreateAccountInput): Promise<AccountDto> {
    const account = Account.create({
      id: newAccountId(randomUUID()),
      userId,
      name: input.name,
      type: input.type,
      currency: input.currency,
      ...(input.last4 === undefined ? {} : { last4: input.last4 }),
    });
    await this.accounts.create(account);
    return toAccountDto(account);
  }
}

export class ListAccounts {
  constructor(private readonly accounts: AccountRepository) {}

  async execute(userId: UserId): Promise<AccountDto[]> {
    return (await this.accounts.listForUser(userId)).map(toAccountDto);
  }
}
