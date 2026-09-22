import { randomUUID } from 'node:crypto';
import { Account } from '../../domain/account.js';
import type { AccountType } from '../../domain/account-type.js';
import type { CategoryKind } from '../../domain/default-categories.js';
import type { Currency } from '../../domain/currency.js';
import { newAccountId, type UserId } from '../../domain/ids.js';
import { ConflictError, NotFoundError } from '../errors.js';
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
  last4s: string[];
  isLiability: boolean;
  archived: boolean;
}

export function toAccountDto(account: Account): AccountDto {
  return {
    id: account.id,
    name: account.getName(),
    type: account.type,
    currency: account.currency,
    last4s: [...account.getLast4s()],
    isLiability: account.isLiability(),
    archived: account.isArchived(),
  };
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  currency: Currency;
  last4s?: string[];
}

/**
 * Refuses digits another of your ACTIVE accounts already uses. Two
 * accounts ending in 4444 would leave every "**4444" SMS unparsed as
 * ambiguous; saying so now, while you are typing it, is kinder than a
 * pile of unparsed messages later. Archived accounts do not count: a
 * closed card's digits may be reissued to a new one.
 */
async function assertLast4sFree(accounts: AccountRepository, account: Account): Promise<void> {
  const others = (await accounts.listForUser(account.userId)).filter(
    (a) => a.id !== account.id && !a.isArchived(),
  );
  for (const digits of account.getLast4s()) {
    const owner = others.find((a) => a.hasLast4(digits));
    if (owner !== undefined) {
      throw new ConflictError(`Digits ${digits} already belong to your account "${owner.getName()}"`);
    }
  }
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
      ...(input.last4s === undefined ? {} : { last4s: input.last4s }),
    });
    await assertLast4sFree(this.accounts, account);
    await this.accounts.create(account);
    return toAccountDto(account);
  }
}

export interface UpdateAccountInput {
  name?: string;
  /** The FULL new list; omitted digits are removed. */
  last4s?: string[];
}

export class UpdateAccount {
  constructor(private readonly accounts: AccountRepository) {}

  async execute(userId: UserId, accountId: string, input: UpdateAccountInput): Promise<AccountDto> {
    const account = await this.accounts.findForUser(accountId, userId);
    if (account === null) {
      throw new NotFoundError('Account not found');
    }
    if (input.name !== undefined) {
      account.rename(input.name);
    }
    if (input.last4s !== undefined) {
      account.setLast4s(input.last4s);
      await assertLast4sFree(this.accounts, account);
    }
    await this.accounts.update(account);
    return toAccountDto(account);
  }
}

export class ListAccounts {
  constructor(private readonly accounts: AccountRepository) {}

  async execute(userId: UserId): Promise<AccountDto[]> {
    return (await this.accounts.listForUser(userId)).map(toAccountDto);
  }
}
