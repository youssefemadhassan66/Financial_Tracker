import { addDays, daysBetween, type CalendarDate } from './calendar-date.js';
import type { Money } from './money.js';
import type { Subscription } from './subscription.js';
import type { TransactionKind } from './transaction-kind.js';

/** How far a charge may land from its billing date: banks book late, services bill early. */
export const CHARGE_WINDOW_DAYS = 3;

/** A charge on one of your accounts that may pay a subscription. */
export interface ChargeToMatch {
  id: string;
  accountId: string;
  merchantKey: string;
  kind: TransactionKind;
  direction: 'debit' | 'credit';
  /** Local (Cairo) date of the charge. */
  date: CalendarDate;
  /** The amount billed to the account. */
  amount: Money;
  /** What the merchant charged, when that was another currency. */
  original: Money | null;
}

/** The two amounts of a charge, as far as comparing to a price goes. */
export type ChargedAmounts = Pick<ChargeToMatch, 'amount' | 'original'>;

/**
 * Does a charge's merchant key belong to the subscription's?
 *
 * Equal keys, or the charge's key goes on after the subscription's with
 * more words ("NETFLIX" -> "NETFLIX COM"), or the bank cut the name short
 * ("TEST SOFTWARE PL" for "TEST SOFTWARE PLUS"). A cut name must still be 6
 * characters or more: "NET" would match every NET-something.
 * "UBER" does NOT match "UBEREATS": a word has to end where the key ends.
 */
export function merchantMatches(subscriptionKey: string, chargeKey: string): boolean {
  if (chargeKey === subscriptionKey || chargeKey.startsWith(`${subscriptionKey} `)) {
    return true;
  }
  return chargeKey.length >= 6 && subscriptionKey.startsWith(chargeKey);
}

/**
 * The charge in the subscription's currency: its billed amount when that
 * is the currency, else the original (a USD subscription paid by an EGP
 * card carries its dollars there). Null when neither is comparable.
 */
export function comparableAmount(subscription: Subscription, charge: ChargedAmounts): Money | null {
  const currency = subscription.amount.getCurrency();
  if (charge.amount.getCurrency() === currency) {
    return charge.amount;
  }
  return charge.original !== null && charge.original.getCurrency() === currency ? charge.original : null;
}

/**
 * Which subscription, if any, this charge pays.
 *
 * Only an active subscription, only money going out on an expense, only
 * on the subscription's account when it names one, only a matching
 * merchant with a billing date within CHARGE_WINDOW_DAYS. When several
 * fit, the one whose price the charge equals wins; a charge at another
 * price links only when it is the one candidate, and is reported as a
 * price change. Two equally good candidates: no link. It never guesses.
 */
export function matchCharge(
  subscriptions: readonly Subscription[],
  charge: ChargeToMatch,
): { subscriptionId: string; priceChanged: boolean } | null {
  if (charge.kind !== 'expense' || charge.direction !== 'debit') {
    return null;
  }
  const eligible: { subscription: Subscription; exact: boolean }[] = [];
  for (const subscription of subscriptions) {
    if (!subscription.isActive()) continue;
    if (subscription.accountId !== null && subscription.accountId !== charge.accountId) continue;
    if (!merchantMatches(subscription.merchantKey, charge.merchantKey)) continue;
    const amount = comparableAmount(subscription, charge);
    if (amount === null) continue;
    const window = subscription.chargesBetween(
      addDays(charge.date, -CHARGE_WINDOW_DAYS),
      addDays(charge.date, CHARGE_WINDOW_DAYS),
    );
    if (window.length === 0) continue;
    eligible.push({ subscription, exact: amount.equals(subscription.amount) });
  }

  const exact = eligible.filter((e) => e.exact);
  if (exact.length === 1) {
    return { subscriptionId: exact[0]!.subscription.id, priceChanged: false };
  }
  if (exact.length === 0 && eligible.length === 1) {
    return { subscriptionId: eligible[0]!.subscription.id, priceChanged: true };
  }
  return null;
}

/**
 * The latest billing date that went by without a charge, or null.
 *
 * Only for an active subscription that has been charged at least once:
 * billing dates before the first charge we saw are before tracking began,
 * not missed. A date only counts once CHARGE_WINDOW_DAYS have passed,
 * since a charge may still arrive until then.
 */
export function missedCharge(
  subscription: Subscription,
  chargeDates: readonly CalendarDate[],
  today: CalendarDate,
): CalendarDate | null {
  if (!subscription.isActive() || chargeDates.length === 0) {
    return null;
  }
  const first = [...chargeDates].sort()[0]!;
  const due = subscription.chargesBetween(addDays(first, 1), addDays(today, -CHARGE_WINDOW_DAYS));
  for (let i = due.length - 1; i >= 0; i -= 1) {
    const date = due[i]!;
    const paid = chargeDates.some((d) => Math.abs(daysBetween(d, date)) <= CHARGE_WINDOW_DAYS);
    if (!paid) {
      return date;
    }
  }
  return null;
}
