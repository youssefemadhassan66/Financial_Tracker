import { DEFAULT_TIME_ZONE, localDateOf } from '../../domain/calendar-date.js';
import type { UserId } from '../../domain/ids.js';
import { matchCharge } from '../../domain/subscription-matching.js';
import type { Clock } from '../ports/clock.js';
import type { SubscriptionChargeRepository, SubscriptionRepository } from '../ports/finance.js';

/** Far enough back to hold the last charge of a yearly subscription. */
const LOOKBACK_DAYS = 400;

/**
 * Links your expenses to the subscriptions they pay.
 *
 * Safe to run any number of times: a linked charge is never looked at
 * again, and a charge that fits no subscription (or two) stays unlinked.
 * Runs after every SMS and statement import, and on request.
 */
export class MatchSubscriptionCharges {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly charges: SubscriptionChargeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId): Promise<{ linked: number }> {
    const active = await this.subscriptions.listForUser(userId, 'active');
    if (active.length === 0) {
      return { linked: 0 };
    }
    const since = new Date(this.clock.now().getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    let linked = 0;
    for (const charge of await this.charges.listUnlinkedCharges(userId, since)) {
      const match = matchCharge(active, { ...charge, date: localDateOf(charge.occurredAt, DEFAULT_TIME_ZONE) });
      if (match !== null && (await this.charges.link(userId, charge.id, match.subscriptionId))) {
        linked += 1;
      }
    }
    return { linked };
  }
}
