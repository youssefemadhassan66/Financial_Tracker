import { randomUUID } from 'node:crypto';
import { Money } from '../../domain/money.js';
import {
  Subscription,
  type BillingCycle,
  type SubscriptionStatus,
} from '../../domain/subscription.js';
import { normalizeMerchantKey } from '../../domain/merchant-key.js';
import { SUBSCRIPTIONS_CATEGORY_NAME } from '../../domain/default-categories.js';
import {
  DEFAULT_TIME_ZONE,
  addDays,
  localDateOf,
  type CalendarDate,
} from '../../domain/calendar-date.js';
import type { Currency } from '../../domain/currency.js';
import { newAccountId, newCategoryId, type AccountId, type CategoryId, type UserId } from '../../domain/ids.js';
import { DomainError } from '../../domain/errors.js';
import { NotFoundError } from '../errors.js';
import type { Clock } from '../ports/clock.js';
import type { AccountRepository, CategoryRepository, SubscriptionRepository } from '../ports/finance.js';

export interface SubscriptionDto {
  id: string;
  name: string;
  amount: string;
  currency: Currency;
  cycle: BillingCycle;
  anchorDate: CalendarDate;
  status: SubscriptionStatus;
  /** null unless active. */
  nextChargeDate: CalendarDate | null;
  monthlyEquivalent: string;
  yearlyCost: string;
  categoryId: string | null;
  accountId: string | null;
  notes: string | null;
}

function toDto(sub: Subscription, today: CalendarDate): SubscriptionDto {
  return {
    id: sub.id,
    name: sub.name,
    amount: sub.amount.toDecimalString(),
    currency: sub.amount.getCurrency(),
    cycle: sub.cycle,
    anchorDate: sub.anchorDate,
    status: sub.status,
    nextChargeDate: sub.isActive() ? sub.nextBillingOnOrAfter(today) : null,
    monthlyEquivalent: sub.monthlyEquivalent().toDecimalString(),
    yearlyCost: sub.yearlyCost().toDecimalString(),
    categoryId: sub.categoryId,
    accountId: sub.accountId,
    notes: sub.notes,
  };
}

export interface CreateSubscriptionInput {
  name: string;
  amount: string;
  /** The currency you are BILLED in. Claude and many streaming services
   *  bill in USD even when the card is in EGP. */
  currency: Currency;
  cycle: BillingCycle;
  anchorDate: CalendarDate;
  /** Defaults to the user's "Subscriptions" category. */
  categoryId?: string;
  accountId?: string;
  /** How the name appears on bank SMS, if it differs from `name`. */
  merchant?: string;
  notes?: string;
}

export class CreateSubscription {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly categories: CategoryRepository,
    private readonly accounts: AccountRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId, input: CreateSubscriptionInput): Promise<SubscriptionDto> {
    const categoryId = await this.resolveCategory(userId, input.categoryId);
    const accountId = await this.resolveAccount(userId, input.accountId);

    const subscription = Subscription.create({
      id: randomUUID(),
      userId,
      name: input.name,
      merchantKey: normalizeMerchantKey(input.merchant ?? input.name),
      amount: Money.create(input.amount, input.currency),
      cycle: input.cycle,
      anchorDate: input.anchorDate,
      categoryId,
      accountId,
      notes: input.notes ?? null,
    });

    await this.subscriptions.create(subscription);
    return toDto(subscription, localDateOf(this.clock.now(), DEFAULT_TIME_ZONE));
  }

  private async resolveCategory(userId: UserId, requested: string | undefined): Promise<CategoryId | null> {
    if (requested !== undefined) {
      const category = await this.categories.findForUser(requested, userId);
      if (category === null) throw new NotFoundError('Category not found');
      if (category.kind !== 'spending') throw new DomainError('A subscription needs a spending category');
      return category.id;
    }
    const fallback = await this.categories.findByNameForUser(SUBSCRIPTIONS_CATEGORY_NAME, userId);
    return fallback === null ? null : newCategoryId(fallback.id);
  }

  private async resolveAccount(userId: UserId, requested: string | undefined): Promise<AccountId | null> {
    if (requested === undefined) return null;
    const account = await this.accounts.findForUser(requested, userId);
    if (account === null) throw new NotFoundError('Account not found');
    return newAccountId(account.id);
  }
}

export class ListSubscriptions {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId, status?: SubscriptionStatus): Promise<SubscriptionDto[]> {
    const today = localDateOf(this.clock.now(), DEFAULT_TIME_ZONE);
    return (await this.subscriptions.listForUser(userId, status)).map((s) => toDto(s, today));
  }
}

export type SubscriptionAction = 'pause' | 'resume' | 'cancel';

export class ChangeSubscriptionStatus {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId, id: string, action: SubscriptionAction): Promise<SubscriptionDto> {
    const subscription = await this.subscriptions.findForUser(id, userId);
    if (subscription === null) {
      throw new NotFoundError('Subscription not found');
    }

    // The entity decides whether the transition is legal (e.g. a cancelled
    // subscription cannot be resumed). This use case only orchestrates.
    if (action === 'pause') subscription.pause();
    else if (action === 'resume') subscription.resume();
    else subscription.cancel(this.clock.now());

    await this.subscriptions.save(subscription);
    return toDto(subscription, localDateOf(this.clock.now(), DEFAULT_TIME_ZONE));
  }
}

export interface UpcomingCharge {
  subscriptionId: string;
  name: string;
  date: CalendarDate;
  amount: string;
  currency: Currency;
}

export interface SubscriptionSummary {
  asOf: CalendarDate;
  activeCount: number;
  /** Per currency. EGP and USD are never summed together. */
  totals: { currency: Currency; monthly: string; yearly: string }[];
  upcoming: UpcomingCharge[];
}

/** "What do my subscriptions cost me, and what's due soon?" */
export class GetSubscriptionSummary {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId, days: number): Promise<SubscriptionSummary> {
    const today = localDateOf(this.clock.now(), DEFAULT_TIME_ZONE);
    const active = await this.subscriptions.listForUser(userId, 'active');

    const totals = new Map<Currency, { monthly: Money; yearly: Money }>();
    for (const sub of active) {
      const currency = sub.amount.getCurrency();
      const running = totals.get(currency) ?? { monthly: Money.zero(currency), yearly: Money.zero(currency) };
      // Money.add refuses mixed currencies, so grouping by currency first
      // is not just tidy — it is required.
      totals.set(currency, {
        monthly: running.monthly.add(sub.monthlyEquivalent()),
        yearly: running.yearly.add(sub.yearlyCost()),
      });
    }

    const windowEnd = addDays(today, days - 1);
    const upcoming = active
      .flatMap((sub) =>
        sub.chargesBetween(today, windowEnd).map((date) => ({
          subscriptionId: sub.id,
          name: sub.name,
          date,
          amount: sub.amount.toDecimalString(),
          currency: sub.amount.getCurrency(),
        })),
      )
      .sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date < b.date ? -1 : 1));

    return {
      asOf: today,
      activeCount: active.length,
      totals: [...totals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, t]) => ({
          currency,
          monthly: t.monthly.toDecimalString(),
          yearly: t.yearly.toDecimalString(),
        })),
      upcoming,
    };
  }
}
