import type { PrismaClient, Subscription as SubscriptionRow } from '@prisma/client';
import { Money } from '../../domain/money.js';
import { Account } from '../../domain/account.js';
import { Subscription, type SubscriptionStatus } from '../../domain/subscription.js';
import type { Transaction } from '../../domain/transaction.js';
import { DEFAULT_SPENDING_POLICY, type SpendingPolicy } from '../../domain/spending-policy.js';
import { calendarDate, type CalendarDate } from '../../domain/calendar-date.js';
import {
  newAccountId,
  newCategoryId,
  newMerchantKey,
  newUserId,
  type UserId,
} from '../../domain/ids.js';
import type { TransactionKind } from '../../domain/transaction-kind.js';
import { ConflictError } from '../../application/errors.js';
import type {
  AccountRepository,
  AnalyticsQueries,
  AvailableBalanceRepository,
  CategoryRecord,
  CategoryRepository,
  CategoryTotalRow,
  InstantRange,
  KindTotalRow,
  NewCategory,
  ReportedAvailable,
  SubscriptionRepository,
  TransactionFilter,
  TransactionRepository,
  TransactionView,
  UserSettingsRepository,
} from '../../application/ports/finance.js';
import { isUniqueViolation } from './prisma-errors.js';

// ---------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------

const CATEGORY_FIELDS = { id: true, name: true, kind: true, icon: true, color: true, isSystem: true } as const;

function toCategoryRecord(row: { id: string; name: string; kind: 'spending' | 'income'; icon: string | null; color: string | null; isSystem: boolean }): CategoryRecord {
  return { ...row, id: newCategoryId(row.id) };
}

export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listForUser(userId: UserId): Promise<CategoryRecord[]> {
    const rows = await this.prisma.category.findMany({
      where: { userId },
      select: CATEGORY_FIELDS,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toCategoryRecord);
  }

  async findForUser(id: string, userId: UserId): Promise<CategoryRecord | null> {
    // findFirst with BOTH id and userId — the userId is the tenancy check.
    const row = await this.prisma.category.findFirst({ where: { id, userId }, select: CATEGORY_FIELDS });
    return row === null ? null : toCategoryRecord(row);
  }

  async findByNameForUser(name: string, userId: UserId): Promise<CategoryRecord | null> {
    const row = await this.prisma.category.findUnique({
      where: { userId_name: { userId, name } },
      select: CATEGORY_FIELDS,
    });
    return row === null ? null : toCategoryRecord(row);
  }

  async create(userId: UserId, category: NewCategory): Promise<CategoryRecord> {
    try {
      const row = await this.prisma.category.create({ data: { ...category, userId }, select: CATEGORY_FIELDS });
      return toCategoryRecord(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`You already have a category named "${category.name}"`);
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(account: Account): Promise<void> {
    await this.prisma.account.create({
      data: {
        id: account.id,
        userId: account.userId,
        name: account.getName(),
        type: account.type,
        currency: account.currency,
        last4s: [...account.getLast4s()],
      },
    });
  }

  async findForUser(id: string, userId: UserId): Promise<Account | null> {
    const row = await this.prisma.account.findFirst({ where: { id, userId } });
    return row === null ? null : toAccount(row);
  }

  async update(account: Account): Promise<void> {
    // updateMany with userId, not update by id: the WHERE itself proves
    // ownership, so this can never write another user's account.
    await this.prisma.account.updateMany({
      where: { id: account.id, userId: account.userId },
      data: { name: account.getName(), last4s: [...account.getLast4s()], archivedAt: account.getArchivedAt() },
    });
  }

  async listForUser(userId: UserId): Promise<Account[]> {
    const rows = await this.prisma.account.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toAccount);
  }
}

export class PrismaAvailableBalanceRepository implements AvailableBalanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(account: Account, available: Money, reportedAt: Date): Promise<void> {
    const data = { amount: available.toDecimalString(), reportedAt };
    // Replace only a report OLDER than this one. The date check sits in
    // the WHERE, so it is decided atomically by the database, not by a
    // read-then-write that a racing SMS could slip between.
    const olderOnly = { accountId: account.id, reportedAt: { lt: reportedAt } };
    const updated = await this.prisma.accountAvailableBalance.updateMany({ where: olderOnly, data });
    if (updated.count > 0) {
      return;
    }
    // Nothing updated: either no report yet (create one) or the stored
    // one is newer or the same (keep it; the create then fails).
    try {
      await this.prisma.accountAvailableBalance.create({ data: { accountId: account.id, ...data } });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      // Another run created the row between our update and our create.
      // It may be older than ours, so ask the same question once more.
      await this.prisma.accountAvailableBalance.updateMany({ where: olderOnly, data });
    }
  }

  async listForUser(userId: UserId): Promise<Map<string, ReportedAvailable>> {
    const rows = await this.prisma.accountAvailableBalance.findMany({
      where: { account: { userId } },
      select: { accountId: true, amount: true, reportedAt: true },
    });
    return new Map(rows.map((r) => [r.accountId, { amount: r.amount.toFixed(2), reportedAt: r.reportedAt }]));
  }
}

function toAccount(row: {
  id: string; userId: string; name: string; type: Account['type']; currency: Account['currency'];
  last4s: string[]; archivedAt: Date | null;
}): Account {
  return Account.restore(
    {
      id: newAccountId(row.id),
      userId: newUserId(row.userId),
      name: row.name,
      type: row.type,
      currency: row.currency,
      last4s: row.last4s,
    },
    row.archivedAt,
  );
}

// ---------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------

/** The one mapping from a domain Transaction to its table row. Shared by
 *  every write path so a new column cannot be saved by one and forgotten
 *  by another. */
export function toTransactionRow(t: Transaction) {
  return {
    id: t.id,
    userId: t.userId,
    accountId: t.accountId,
    amount: t.amount.toDecimalString(),
    currency: t.amount.getCurrency(),
    direction: t.direction,
    kind: t.kind,
    countsAsSpending: t.getCountsAsSpending(),
    categoryId: t.getCategoryId(),
    merchantKey: t.merchantKey,
    merchantRaw: t.merchantRaw,
    occurredAt: t.occurredAt,
    source: t.source,
    transferGroupId: t.transferGroupId,
  };
}

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveAll(transactions: Transaction[]): Promise<void> {
    // An array $transaction runs every insert inside ONE database
    // transaction: if the second leg of a transfer fails, the first is
    // rolled back. No money appears from nowhere or vanishes.
    await this.prisma.$transaction(
      transactions.map((t) => this.prisma.transaction.create({ data: toTransactionRow(t) })),
    );
  }

  async list(userId: UserId, filter: TransactionFilter): Promise<TransactionView[]> {
    // `to` and `before` both cap the range; the earlier one wins.
    const upper = [filter.to, filter.before].filter((d): d is Date => d !== undefined);
    const lt = upper.length === 0 ? undefined : new Date(Math.min(...upper.map((d) => d.getTime())));

    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        ...(filter.accountId === undefined ? {} : { accountId: filter.accountId }),
        ...(filter.categoryId === undefined ? {} : { categoryId: filter.categoryId }),
        occurredAt: {
          ...(filter.from === undefined ? {} : { gte: filter.from }),
          ...(lt === undefined ? {} : { lt }),
        },
      },
      include: {
        account: { select: { name: true } },
        category: { select: { id: true, name: true, icon: true } },
      },
      // id as a tie-breaker keeps paging stable when two share a timestamp.
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: filter.limit,
    });

    return rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      accountName: row.account.name,
      amount: row.amount.toFixed(2),
      currency: row.currency,
      direction: row.direction,
      kind: row.kind,
      countsAsSpending: row.countsAsSpending,
      category: row.category,
      merchant: row.merchantRaw,
      occurredAt: row.occurredAt,
      source: row.source,
      transferGroupId: row.transferGroupId,
    }));
  }
}

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------

export class PrismaUserSettingsRepository implements UserSettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSpendingPolicy(userId: UserId): Promise<SpendingPolicy> {
    const row = await this.prisma.userSettings.findUnique({ where: { userId } });
    return row === null ? DEFAULT_SPENDING_POLICY : { countFeesAsSpending: row.countFeesAsSpending };
  }
}

// ---------------------------------------------------------------------
// Analytics — aggregation happens in Postgres, not in JavaScript
// ---------------------------------------------------------------------

export class PrismaAnalyticsQueries implements AnalyticsQueries {
  constructor(private readonly prisma: PrismaClient) {}

  async spendingByCategory(userId: UserId, range: InstantRange): Promise<CategoryTotalRow[]> {
    // Compiles to: SELECT currency, category_id, direction, SUM(amount),
    // COUNT(*) ... WHERE user_id = $1 AND counts_as_spending
    // AND occurred_at >= $2 AND occurred_at < $3 GROUP BY 1, 2, 3.
    // Served by the (user_id, counts_as_spending, occurred_at) index.
    const groups = await this.prisma.transaction.groupBy({
      by: ['currency', 'categoryId', 'direction'],
      where: { userId, countsAsSpending: true, occurredAt: { gte: range.from, lt: range.to } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return groups.map((g) => ({
      currency: g.currency,
      categoryId: g.categoryId,
      direction: g.direction,
      total: (g._sum.amount ?? 0).toString(),
      count: g._count._all,
    }));
  }

  async totalsByKind(userId: UserId, range: InstantRange, kinds: TransactionKind[]): Promise<KindTotalRow[]> {
    const groups = await this.prisma.transaction.groupBy({
      by: ['currency', 'kind', 'direction'],
      where: { userId, kind: { in: kinds }, occurredAt: { gte: range.from, lt: range.to } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return groups.map((g) => ({
      currency: g.currency,
      kind: g.kind,
      direction: g.direction,
      total: (g._sum.amount ?? 0).toString(),
      count: g._count._all,
    }));
  }
}

// ---------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------

/** A Postgres DATE arrives as a JS Date at UTC midnight; this reads the
 *  calendar date back without letting any timezone shift it. */
function toCalendarDate(value: Date): CalendarDate {
  return calendarDate(value.toISOString().slice(0, 10));
}

function fromCalendarDate(value: CalendarDate): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toSubscription(row: SubscriptionRow): Subscription {
  return Subscription.restore({
    id: row.id,
    userId: newUserId(row.userId),
    name: row.name,
    merchantKey: newMerchantKey(row.merchantKey),
    amount: Money.create(row.amount.toFixed(2), row.currency),
    cycle: row.cycle,
    anchorDate: toCalendarDate(row.anchorDate),
    status: row.status,
    cancelledAt: row.cancelledAt,
    categoryId: row.categoryId === null ? null : newCategoryId(row.categoryId),
    accountId: row.accountId === null ? null : newAccountId(row.accountId),
    notes: row.notes,
  });
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(sub: Subscription): Promise<void> {
    await this.prisma.subscription.create({
      data: {
        id: sub.id,
        userId: sub.userId,
        name: sub.name,
        merchantKey: sub.merchantKey,
        amount: sub.amount.toDecimalString(),
        currency: sub.amount.getCurrency(),
        cycle: sub.cycle,
        anchorDate: fromCalendarDate(sub.anchorDate),
        status: sub.status,
        cancelledAt: sub.cancelledAt,
        categoryId: sub.categoryId,
        accountId: sub.accountId,
        notes: sub.notes,
      },
    });
  }

  async save(sub: Subscription): Promise<void> {
    // Only the fields the entity allows to change.
    await this.prisma.subscription.updateMany({
      where: { id: sub.id, userId: sub.userId },
      data: { status: sub.status, cancelledAt: sub.cancelledAt },
    });
  }

  async findForUser(id: string, userId: UserId): Promise<Subscription | null> {
    const row = await this.prisma.subscription.findFirst({ where: { id, userId } });
    return row === null ? null : toSubscription(row);
  }

  async listForUser(userId: UserId, status?: SubscriptionStatus): Promise<Subscription[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { userId, ...(status === undefined ? {} : { status }) },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toSubscription);
  }
}
