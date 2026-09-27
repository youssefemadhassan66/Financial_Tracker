import { daysBetween, type CalendarDate } from './calendar-date.js';
import type { Currency } from './currency.js';
import type { Money } from './money.js';
import type { BillingCycle, Subscription } from './subscription.js';
import { CHARGE_WINDOW_DAYS, merchantMatches } from './subscription-matching.js';

export interface SuggestionCharge {
  id: string;
  accountId: string;
  merchantKey: string;
  merchantRaw: string;
  date: CalendarDate /* local date */;
  amount: Money;
  original: Money | null;
}

export interface SubscriptionSuggestion {
  merchantKey: string;
  name: string;
  amount: Money;
  cycle: BillingCycle;
  anchorDate: CalendarDate;
  lastChargeDate: CalendarDate;
  chargeCount: number;
  accountId: string | null;
  transactionIds: string[];
}

interface CycleConfig {
  cycle: BillingCycle;
  minGap: number;
  maxGap: number;
  minCharges: number;
}

/**
 * Gaps are loose because banks book late and months differ in length
 * (28 Feb -> 28 Mar is 28 days; plus a late booking, 25). The minimum
 * counts are how many repeats it takes before a coincidence is unlikely:
 * two groceries a week apart mean nothing, four do.
 */
const CYCLE_CONFIGS: readonly CycleConfig[] = [
  { cycle: 'weekly', minGap: 5, maxGap: 9, minCharges: 4 },
  { cycle: 'monthly', minGap: 25, maxGap: 35, minCharges: 3 },
  { cycle: 'quarterly', minGap: 85, maxGap: 97, minCharges: 3 },
  { cycle: 'yearly', minGap: 355, maxGap: 375, minCharges: 2 },
];

/** How far back from the latest price an older charge may be and still count as the same plan. */
const PRICE_TOLERANCE_PERCENT = 10;

/**
 * What the merchant asked for. A USD service billed to an EGP card has a
 * steady dollar price while the EGP amount moves with the exchange rate,
 * so the original is the figure that repeats.
 */
function priceOf(charge: SuggestionCharge): Money {
  return charge.original ?? charge.amount;
}

function findCycle(gap: number): CycleConfig | undefined {
  return CYCLE_CONFIGS.find((c) => gap >= c.minGap && gap <= c.maxGap);
}

function isSamePlan(candidatePrice: Money, latestPrice: Money): boolean {
  const minPrice = latestPrice.scale(100 - PRICE_TOLERANCE_PERCENT, 100);
  const maxPrice = latestPrice.scale(100 + PRICE_TOLERANCE_PERCENT, 100);
  if (minPrice.isGreaterThan(candidatePrice)) {
    return false;
  }
  if (candidatePrice.isGreaterThan(maxPrice)) {
    return false;
  }
  return true;
}

/**
 * Subscriptions you seem to pay but do not track yet.
 *
 * Only a streak counts: the same merchant at a steady price on a regular
 * interval, ending at the latest charge. Walking back from the newest
 * charge (not forward from the oldest) means a plan you changed months
 * ago is judged by what you pay now. Anything you already track (in any
 * status) or dismissed is never suggested: a suggestion list that nags
 * about a cancelled gym stops being read. A streak that has not been
 * charged for longer than one cycle plus the grace window has stopped,
 * and is not suggested either. Only suggests; nothing is created here.
 */
export function suggestSubscriptions(
  charges: readonly SuggestionCharge[],
  existing: readonly Subscription[],
  dismissed: ReadonlySet<string>,
  today: CalendarDate,
): SubscriptionSuggestion[] {
  interface Group {
    merchantKey: string;
    currency: Currency;
    charges: SuggestionCharge[];
  }

  const groups = new Map<string, Group>();
  for (const charge of charges) {
    const price = priceOf(charge);
    const key = `${charge.merchantKey}\0${price.getCurrency()}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = { merchantKey: charge.merchantKey, currency: price.getCurrency(), charges: [] };
      groups.set(key, group);
    }
    group.charges.push(charge);
  }

  const suggestions: SubscriptionSuggestion[] = [];

  for (const group of groups.values()) {
    // Skip if dismissed by user.
    if (dismissed.has(group.merchantKey)) {
      continue;
    }

    // Skip if any existing subscription matches this merchantKey.
    if (existing.some((sub) => merchantMatches(sub.merchantKey, group.merchantKey))) {
      continue;
    }

    if (group.charges.length < 2) {
      continue;
    }

    // Sort the group by date, then id.
    const sorted = [...group.charges].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.id.localeCompare(b.id);
    });

    const latest = sorted[sorted.length - 1]!;
    const prev = sorted[sorted.length - 2]!;
    const initialGap = daysBetween(prev.date, latest.date);
    const cycle = findCycle(initialGap);
    if (cycle === undefined) {
      continue;
    }

    const latestPrice = priceOf(latest);
    const streak: SuggestionCharge[] = [latest];

    // Walk backwards from previous charge.
    for (let i = sorted.length - 2; i >= 0; i -= 1) {
      const candidate = sorted[i]!;
      const succeeding = sorted[i + 1]!;
      const gap = daysBetween(candidate.date, succeeding.date);

      if (gap < cycle.minGap || gap > cycle.maxGap) {
        break;
      }
      if (!isSamePlan(priceOf(candidate), latestPrice)) {
        break;
      }
      streak.unshift(candidate);
    }

    if (streak.length < cycle.minCharges) {
      continue;
    }

    // Must still be running: daysBetween(lastChargeDate, today) <= maxGap + CHARGE_WINDOW_DAYS.
    const daysSinceLast = daysBetween(latest.date, today);
    if (daysSinceLast > cycle.maxGap + CHARGE_WINDOW_DAYS) {
      continue;
    }

    const first = streak[0]!;
    const accountId = streak.every((c) => c.accountId === first.accountId) ? first.accountId : null;

    suggestions.push({
      merchantKey: group.merchantKey,
      name: latest.merchantRaw.trim().slice(0, 60),
      amount: latestPrice,
      cycle: cycle.cycle,
      anchorDate: first.date,
      lastChargeDate: latest.date,
      chargeCount: streak.length,
      accountId,
      transactionIds: streak.map((c) => c.id),
    });
  }

  return suggestions.sort((a, b) => {
    if (a.lastChargeDate !== b.lastChargeDate) {
      return b.lastChargeDate.localeCompare(a.lastChargeDate);
    }
    return a.merchantKey.localeCompare(b.merchantKey);
  });
}
