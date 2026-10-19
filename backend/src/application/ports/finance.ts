import type { Account } from '../../domain/account.js';
import type { Money } from '../../domain/money.js';
import type { Transaction, TransactionDirection, TransactionSource } from '../../domain/transaction.js';
import type { Subscription, SubscriptionStatus } from '../../domain/subscription.js';
import type { InstallmentPlan } from '../../domain/installment.js';
import type { CalendarDate } from '../../domain/calendar-date.js';
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
  /** Saves name, card/account digits and archive state. */
  update(account: Account): Promise<void>;
}

/** What the bank last said is still available on an account. */
export interface ReportedAvailable {
  /** Decimal string in the account's currency. */
  amount: string;
  reportedAt: Date;
}

export interface AvailableBalanceRepository {
  /**
   * Keeps the NEWEST report per account. SMS can arrive late or be
   * reprocessed out of order, so an older report never replaces a newer
   * one. `account` must already be loaded for its user.
   */
  record(account: Account, available: Money, reportedAt: Date): Promise<void>;
  /** The latest report of each of this user's accounts, by account id. */
  listForUser(userId: UserId): Promise<Map<string, ReportedAvailable>>;
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
  source: TransactionSource;
  transferGroupId: string | null;
  /** What the merchant charged, when that was another currency. */
  original: { amount: string; currency: Currency } | null;
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

export interface InstallmentPlanRepository {
  create(plan: InstallmentPlan): Promise<void>;
  /** Saves the fields the entity lets change (status). */
  save(plan: InstallmentPlan): Promise<void>;
  findForUser(id: string, userId: UserId): Promise<InstallmentPlan | null>;
  listForUser(userId: UserId): Promise<InstallmentPlan[]>;
}

/** A category's monthly limit, in force from `month` until a later row replaces it. */
export interface BudgetRow {
  categoryId: CategoryId;
  /** First day of the month the limit starts. */
  month: CalendarDate;
  /** Zero means "no budget from this month on". */
  limit: Money;
}

export interface BudgetRepository {
  /** Sets the limit from `month` on: one row per user, category and month. */
  setFrom(userId: UserId, categoryId: CategoryId, month: CalendarDate, limit: Money): Promise<void>;
  /** Per category, the newest row whose month is on or before `month`. */
  effectiveOn(userId: UserId, month: CalendarDate): Promise<BudgetRow[]>;
}

/** An expense not yet linked to a subscription. */
export interface UnlinkedCharge {
  id: string;
  accountId: string;
  merchantKey: string;
  merchantRaw: string;
  kind: TransactionKind;
  direction: TransactionDirection;
  occurredAt: Date;
  amount: Money;
  original: Money | null;
}

/** A charge already linked to a subscription. */
export interface LinkedCharge {
  transactionId: string;
  occurredAt: Date;
  amount: Money;
  original: Money | null;
}

/** Which transactions pay which subscription. */
export interface SubscriptionChargeRepository {
  /** Your debit expenses since `since` that pay no subscription yet. */
  listUnlinkedCharges(userId: UserId, since: Date): Promise<UnlinkedCharge[]>;
  /**
   * Links the transaction to the subscription. False, changing nothing,
   * unless both are yours and the transaction is still unlinked.
   */
  link(userId: UserId, transactionId: string, subscriptionId: string): Promise<boolean>;
  /** Per subscription id, its linked charges, oldest first. */
  linkedCharges(userId: UserId): Promise<Map<string, LinkedCharge[]>>;
}

/** Merchants you said are not a subscription: never suggested again. */
export interface SuggestionDismissalRepository {
  listDismissed(userId: UserId): Promise<Set<string>>;
  /** Idempotent: dismissing twice is the same as once. */
  dismiss(userId: UserId, merchantKey: string): Promise<void>;
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
