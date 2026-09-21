import type { Account } from '../../domain/account.js';
import type { Transaction, TransactionDirection } from '../../domain/transaction.js';
import type { Subscription, SubscriptionStatus } from '../../domain/subscription.js';
import type { CategoryKind } from '../../domain/default-categories.js';
import type { Currency } from '../../domain/currency.js';
import type { SpendingPolicy } from '../../domain/spending-policy.js';
import type { TransactionKind } from '../../domain/transaction-kind.js';
import type { AccountId, CategoryId, UserId } from '../../domain/ids.js';

export interface CategoryRecord {
  id: CategoryId;
  name: string;
  kind: CategoryKind;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
}

export interface NewCategory {
  name: string;
  kind: CategoryKind;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
}

export interface CategoryRepository {
  listForUser(userId: UserId): Promise<CategoryRecord[]>;
  /** Scoped by owner: another user's category is simply "not found". */
  findForUser(id: string, userId: UserId): Promise<CategoryRecord | null>;
  findByNameForUser(name: string, userId: UserId): Promise<CategoryRecord | null>;
  /** Throws ConflictError when the name is already used by this user. */
  create(userId: UserId, category: NewCategory): Promise<CategoryRecord>;
}

export interface AccountRepository {
  create(account: Account): Promise<void>;
  findForUser(id: string, userId: UserId): Promise<Account | null>;
  listForUser(userId: UserId): Promise<Account[]>;
}

export interface TransactionFilter {
  /** Inclusive start instant. */
  from?: Date;
  /** Exclusive end instant. */
  to?: Date;
  accountId?: AccountId;
  categoryId?: CategoryId;
  /** Cursor: only transactions strictly older than this. */
  before?: Date;
  limit: number;
}

/** A transaction shaped for display, joined with its account and category. */
export interface TransactionView {
  id: string;
  accountId: string;
  accountName: string;
  amount: string;
  currency: Currency;
  direction: TransactionDirection;
  kind: TransactionKind;
  countsAsSpending: boolean;
  category: { id: string; name: string; icon: string | null } | null;
  merchant: string;
  occurredAt: Date;
  source: 'sms' | 'manual';
  transferGroupId: string | null;
}

export interface TransactionRepository {
  /** All or nothing. Both sides of a transfer are saved, or neither is —
   *  a half-saved transfer would make money appear or vanish. */
  saveAll(transactions: Transaction[]): Promise<void>;
  list(userId: UserId, filter: TransactionFilter): Promise<TransactionView[]>;
}

export interface UserSettingsRepository {
  getSpendingPolicy(userId: UserId): Promise<SpendingPolicy>;
}

export interface SubscriptionRepository {
  create(subscription: Subscription): Promise<void>;
  save(subscription: Subscription): Promise<void>;
  findForUser(id: string, userId: UserId): Promise<Subscription | null>;
  listForUser(userId: UserId, status?: SubscriptionStatus): Promise<Subscription[]>;
}

// ---------------------------------------------------------------------
// Analytics read model
//
// Reports read ROWS, not entities. Loading every transaction as a domain
// object just to add numbers together would be slow and pointless — the
// entity's job is protecting rules when data CHANGES. Aggregation belongs
// in the database (GROUP BY), which is what Postgres is built for.
// ---------------------------------------------------------------------

/** Half-open: from <= occurredAt < to. */
export interface InstantRange {
  from: Date;
  to: Date;
}

export interface CategoryTotalRow {
  currency: Currency;
  categoryId: string | null;
  direction: TransactionDirection;
  /** Decimal as a string — never a float. */
  total: string;
  count: number;
}

export interface KindTotalRow {
  currency: Currency;
  kind: TransactionKind;
  direction: TransactionDirection;
  total: string;
  count: number;
}

export interface AnalyticsQueries {
  /** Sums of transactions with counts_as_spending = true, per category. */
  spendingByCategory(userId: UserId, range: InstantRange): Promise<CategoryTotalRow[]>;
  /** Sums per kind, for the given kinds only. */
  totalsByKind(userId: UserId, range: InstantRange, kinds: TransactionKind[]): Promise<KindTotalRow[]>;
}
