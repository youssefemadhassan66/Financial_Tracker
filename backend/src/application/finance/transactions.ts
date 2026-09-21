import { randomUUID } from 'node:crypto';
import { Money } from '../../domain/money.js';
import { Transaction, type TransactionDirection } from '../../domain/transaction.js';
import type { TransactionKind } from '../../domain/transaction-kind.js';
import { defaultCountsAsSpending } from '../../domain/spending-policy.js';
import { normalizeMerchantKey } from '../../domain/merchant-key.js';
import { DomainError } from '../../domain/errors.js';
import type { Account } from '../../domain/account.js';
import {
  newCategoryId,
  newTransactionId,
  newTransferGroupId,
  type AccountId,
  type CategoryId,
  type UserId,
} from '../../domain/ids.js';
import {
  DEFAULT_TIME_ZONE,
  addDays,
  startOfLocalDay,
  type CalendarDate,
} from '../../domain/calendar-date.js';
import { NotFoundError } from '../errors.js';
import type {
  AccountRepository,
  CategoryRepository,
  TransactionRepository,
  TransactionView,
  UserSettingsRepository,
} from '../ports/finance.js';

/** Kinds that describe money COMING IN. */
const INFLOW_KINDS: ReadonlySet<TransactionKind> = new Set(['income', 'dividend']);

async function ownedAccount(accounts: AccountRepository, id: string, userId: UserId): Promise<Account> {
  const account = await accounts.findForUser(id, userId);
  if (account === null) {
    // Also the answer for an account that exists but belongs to someone
    // else. "Not found" reveals nothing; "forbidden" would confirm the id.
    throw new NotFoundError('Account not found');
  }
  if (account.isArchived()) {
    throw new DomainError('Cannot record transactions on an archived account');
  }
  return account;
}

export interface RecordTransactionInput {
  accountId: string;
  /** Decimal string, e.g. "450.75". Never a JSON number — see fields.ts. */
  amount: string;
  direction: TransactionDirection;
  kind: TransactionKind;
  categoryId?: string;
  /** Who you paid, who paid you, or the ticker for a trade. */
  merchant: string;
  occurredAt: Date;
  /** Overrides the default from the user's spending policy. */
  countsAsSpending?: boolean;
}

/** Records one manually entered transaction. */
export class RecordTransaction {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository,
    private readonly transactions: TransactionRepository,
    private readonly settings: UserSettingsRepository,
  ) {}

  async execute(userId: UserId, input: RecordTransactionInput): Promise<{ id: string }> {
    if (input.kind === 'transfer') {
      // A transfer has two sides in two accounts. Accepting one side here
      // would record money leaving and never arriving.
      throw new DomainError('Record transfers with the transfer endpoint, which writes both sides');
    }
    if (INFLOW_KINDS.has(input.kind) && input.direction !== 'credit') {
      throw new DomainError(`A '${input.kind}' transaction must be a credit (money coming in)`);
    }

    const account = await ownedAccount(this.accounts, input.accountId, userId);

    let categoryId: CategoryId | null = null;
    if (input.categoryId !== undefined) {
      const category = await this.categories.findForUser(input.categoryId, userId);
      if (category === null) {
        throw new NotFoundError('Category not found');
      }
      // An income category on a grocery bill would silently corrupt both
      // the spending and the income report.
      const wanted = INFLOW_KINDS.has(input.kind) ? 'income' : 'spending';
      if (category.kind !== wanted) {
        throw new DomainError(`A '${input.kind}' transaction needs a ${wanted} category`);
      }
      categoryId = category.id;
    }

    const policy = await this.settings.getSpendingPolicy(userId);

    const transaction = Transaction.create({
      id: newTransactionId(randomUUID()),
      userId,
      accountId: account.id,
      // The account's currency, not the client's word for it: an EGP
      // account cannot hold a USD transaction.
      amount: Money.create(input.amount, account.currency),
      direction: input.direction,
      kind: input.kind,
      countsAsSpending: input.countsAsSpending ?? defaultCountsAsSpending(input.kind, policy),
      merchantKey: normalizeMerchantKey(input.merchant),
      merchantRaw: input.merchant,
      occurredAt: input.occurredAt,
      source: 'manual',
      // A trade's cash leg belongs to a group; the share side lives in
      // holdings (Module 14), linked by this same id.
      ...(input.kind === 'trade' ? { transferGroupId: newTransferGroupId(randomUUID()) } : {}),
    });

    if (categoryId !== null) {
      transaction.categorize(categoryId);
    }

    await this.transactions.saveAll([transaction]);
    return { id: transaction.id };
  }
}

export interface RecordTransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  occurredAt: Date;
}

/**
 * Moves money between two of the user's own accounts — for example,
 * paying the credit card from the bank account.
 *
 * Writes TWO rows sharing one transferGroupId: a debit leaving one
 * account and a credit arriving in the other. Neither counts as
 * spending. The purchases on the card were already counted when they
 * happened; counting the payment too would double every one of them.
 */
export class RecordTransfer {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository,
  ) {}

  async execute(userId: UserId, input: RecordTransferInput): Promise<{ transferGroupId: string }> {
    if (input.fromAccountId === input.toAccountId) {
      throw new DomainError('Cannot transfer to the same account');
    }

    const from = await ownedAccount(this.accounts, input.fromAccountId, userId);
    const to = await ownedAccount(this.accounts, input.toAccountId, userId);

    if (from.currency !== to.currency) {
      // Converting would need an exchange rate for the day, which this
      // app does not have. Refuse rather than silently treat 100 USD as
      // 100 EGP.
      throw new DomainError('Transfers between different currencies are not supported');
    }

    const groupId = newTransferGroupId(randomUUID());
    const amount = Money.create(input.amount, from.currency);

    const leg = (account: Account, direction: TransactionDirection, label: string) =>
      Transaction.create({
        id: newTransactionId(randomUUID()),
        userId,
        accountId: account.id as AccountId,
        amount,
        direction,
        kind: 'transfer',
        countsAsSpending: false,
        merchantKey: normalizeMerchantKey('TRANSFER'),
        merchantRaw: label,
        occurredAt: input.occurredAt,
        source: 'manual',
        transferGroupId: groupId,
      });

    await this.transactions.saveAll([
      leg(from, 'debit', `Transfer to ${to.getName()}`),
      leg(to, 'credit', `Transfer from ${from.getName()}`),
    ]);

    return { transferGroupId: groupId };
  }
}

export interface ListTransactionsInput {
  /** Calendar dates in the user's timezone, both inclusive. */
  from?: CalendarDate;
  to?: CalendarDate;
  accountId?: string;
  categoryId?: string;
  before?: Date;
  limit: number;
}

export class ListTransactions {
  constructor(private readonly transactions: TransactionRepository) {}

  execute(userId: UserId, input: ListTransactionsInput): Promise<TransactionView[]> {
    return this.transactions.list(userId, {
      limit: input.limit,
      ...(input.from === undefined ? {} : { from: startOfLocalDay(input.from, DEFAULT_TIME_ZONE) }),
      // The whole of the `to` day: up to the START of the day after.
      ...(input.to === undefined ? {} : { to: startOfLocalDay(addDays(input.to, 1), DEFAULT_TIME_ZONE) }),
      ...(input.accountId === undefined ? {} : { accountId: input.accountId as AccountId }),
      ...(input.categoryId === undefined ? {} : { categoryId: newCategoryId(input.categoryId) }),
      ...(input.before === undefined ? {} : { before: input.before }),
    });
  }
}
