import { DEFAULT_TIME_ZONE, localDateOf, type CalendarDate } from '../../domain/calendar-date.js';
import type { Currency } from '../../domain/currency.js';
import type { UserId } from '../../domain/ids.js';
import { normalizeMerchantKey } from '../../domain/merchant-key.js';
import type { BillingCycle } from '../../domain/subscription.js';
import {
  suggestSubscriptions,
  type SuggestionCharge,
} from '../../domain/subscription-suggestions.js';
import type { Clock } from '../ports/clock.js';
import type {
  SubscriptionChargeRepository,
  SubscriptionRepository,
  SuggestionDismissalRepository,
} from '../ports/finance.js';

const LOOKBACK_DAYS = 400;

export interface SubscriptionSuggestionDto {
  merchantKey: string;
  name: string;
  amount: string;
  currency: Currency;
  cycle: BillingCycle;
  anchorDate: CalendarDate;
  lastChargeDate: CalendarDate;
  chargeCount: number;
  accountId: string | null;
  transactionIds: string[];
}

/**
 * Discovers potential subscriptions from recurring unlinked charges.
 */
export class SuggestSubscriptions {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly charges: SubscriptionChargeRepository,
    private readonly dismissals: SuggestionDismissalRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId): Promise<SubscriptionSuggestionDto[]> {
    const since = new Date(this.clock.now().getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const unlinked = await this.charges.listUnlinkedCharges(userId, since);

    const suggestionCharges: SuggestionCharge[] = unlinked.map((c) => ({
      id: c.id,
      accountId: c.accountId,
      merchantKey: c.merchantKey,
      merchantRaw: c.merchantRaw,
      date: localDateOf(c.occurredAt, DEFAULT_TIME_ZONE),
      amount: c.amount,
      original: c.original,
    }));

    const existing = await this.subscriptions.listForUser(userId);
    const dismissed = await this.dismissals.listDismissed(userId);
    const today = localDateOf(this.clock.now(), DEFAULT_TIME_ZONE);

    const suggestions = suggestSubscriptions(suggestionCharges, existing, dismissed, today);

    return suggestions.map((s) => ({
      merchantKey: s.merchantKey,
      name: s.name,
      amount: s.amount.toDecimalString(),
      currency: s.amount.getCurrency(),
      cycle: s.cycle,
      anchorDate: s.anchorDate,
      lastChargeDate: s.lastChargeDate,
      chargeCount: s.chargeCount,
      accountId: s.accountId,
      transactionIds: s.transactionIds,
    }));
  }
}

/**
 * Dismisses a subscription suggestion permanently for the user.
 */
export class DismissSuggestion {
  constructor(private readonly dismissals: SuggestionDismissalRepository) {}

  async execute(userId: UserId, merchantKey: string): Promise<void> {
    const normalized = normalizeMerchantKey(merchantKey);
    await this.dismissals.dismiss(userId, normalized);
  }
}
