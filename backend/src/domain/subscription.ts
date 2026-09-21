import { DomainError } from './errors.js';
import type { Money } from './money.js';
import {
  addDays,
  addMonthsClamped,
  daysBetween,
  monthsBetween,
  type CalendarDate,
} from './calendar-date.js';
import type { AccountId, CategoryId, MerchantKey, UserId } from './ids.js';

export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';

const MONTHS_PER_CYCLE: Record<Exclude<BillingCycle, 'weekly'>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/** Charges per year, per cycle — used for exact yearly totals. */
const CHARGES_PER_YEAR: Record<BillingCycle, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

export interface SubscriptionProps {
  id: string;
  userId: UserId;
  name: string;
  merchantKey: MerchantKey;
  amount: Money;
  cycle: BillingCycle;
  /** The first billing date. Every later one is derived from it. */
  anchorDate: CalendarDate;
  status: SubscriptionStatus;
  cancelledAt: Date | null;
  categoryId: CategoryId | null;
  accountId: AccountId | null;
  notes: string | null;
}

/**
 * A recurring charge — Netflix, Claude, a gym.
 *
 * The next billing date is COMPUTED from the anchor date and the cycle,
 * never stored. A stored "next date" has to be advanced after every
 * charge; the day that update is skipped (a failed job, a missed SMS)
 * the subscription quietly starts showing the wrong date forever.
 * A derived value cannot drift.
 */
export class Subscription {
  private constructor(private props: SubscriptionProps) {}

  static create(props: Omit<SubscriptionProps, 'status' | 'cancelledAt'>): Subscription {
    Subscription.validate(props.name, props.amount);
    return new Subscription({ ...props, name: props.name.trim(), status: 'active', cancelledAt: null });
  }

  /** Rebuilds a stored subscription, re-checking its rules on load. */
  static restore(props: SubscriptionProps): Subscription {
    Subscription.validate(props.name, props.amount);
    return new Subscription({ ...props });
  }

  private static validate(name: string, amount: Money): void {
    if (name.trim().length === 0) {
      throw new DomainError('Subscription name cannot be empty');
    }
    if (amount.isZero()) {
      throw new DomainError('Subscription amount must be greater than zero');
    }
  }

  get id(): string { return this.props.id; }
  get userId(): UserId { return this.props.userId; }
  get name(): string { return this.props.name; }
  get merchantKey(): MerchantKey { return this.props.merchantKey; }
  get amount(): Money { return this.props.amount; }
  get cycle(): BillingCycle { return this.props.cycle; }
  get anchorDate(): CalendarDate { return this.props.anchorDate; }
  get status(): SubscriptionStatus { return this.props.status; }
  get cancelledAt(): Date | null { return this.props.cancelledAt; }
  get categoryId(): CategoryId | null { return this.props.categoryId; }
  get accountId(): AccountId | null { return this.props.accountId; }
  get notes(): string | null { return this.props.notes; }

  isActive(): boolean {
    return this.props.status === 'active';
  }

  // --- lifecycle -------------------------------------------------------

  pause(): void {
    if (this.props.status !== 'active') {
      throw new DomainError(`Cannot pause a ${this.props.status} subscription`);
    }
    this.props.status = 'paused';
  }

  resume(): void {
    if (this.props.status !== 'paused') {
      throw new DomainError(`Cannot resume a ${this.props.status} subscription`);
    }
    this.props.status = 'active';
  }

  /** Final. A cancelled subscription is kept for history, never revived —
   *  re-subscribing later is a new subscription with a new anchor date. */
  cancel(at: Date): void {
    if (this.props.status === 'cancelled') {
      throw new DomainError('Subscription is already cancelled');
    }
    this.props.status = 'cancelled';
    this.props.cancelledAt = at;
  }

  // --- billing dates ---------------------------------------------------

  /**
   * The n-th billing date; n = 0 is the anchor.
   *
   * Always measured FROM THE ANCHOR, never from the previous date. A
   * subscription started on 31 January bills 28 Feb, then 31 March.
   * Stepping month by month from the last date would give 28 Feb, then
   * 28 March — and it would stay on the 28th forever.
   */
  billingDate(n: number): CalendarDate {
    const { cycle, anchorDate } = this.props;
    return cycle === 'weekly'
      ? addDays(anchorDate, 7 * n)
      : addMonthsClamped(anchorDate, MONTHS_PER_CYCLE[cycle] * n);
  }

  /** The first billing date on or after `date`. */
  nextBillingOnOrAfter(date: CalendarDate): CalendarDate {
    if (date <= this.props.anchorDate) {
      return this.props.anchorDate;
    }
    const { cycle, anchorDate } = this.props;
    // Jump close with arithmetic, then step to the exact answer.
    let n =
      cycle === 'weekly'
        ? Math.floor(daysBetween(anchorDate, date) / 7)
        : Math.floor(monthsBetween(anchorDate, date) / MONTHS_PER_CYCLE[cycle]);
    n = Math.max(0, n - 1);
    while (this.billingDate(n) < date) n += 1;
    return this.billingDate(n);
  }

  /** Billing dates from `from` to `to`, both inclusive. Empty unless active. */
  chargesBetween(from: CalendarDate, to: CalendarDate): CalendarDate[] {
    if (!this.isActive()) return [];
    const dates: CalendarDate[] = [];
    let next = this.nextBillingOnOrAfter(from);
    // A weekly subscription can bill several times in one window.
    for (let guard = 0; next <= to && guard < 400; guard += 1) {
      dates.push(next);
      next = this.nextBillingOnOrAfter(addDays(next, 1));
    }
    return dates;
  }

  // --- cost ------------------------------------------------------------

  /** What it costs per month, averaged — for "how much do subscriptions
   *  cost me". Rounded; use yearlyCost() for exact annual figures. */
  monthlyEquivalent(): Money {
    return this.props.amount.scale(CHARGES_PER_YEAR[this.props.cycle], 12);
  }

  /** Exact cost over a year: charge amount × charges per year. */
  yearlyCost(): Money {
    return this.props.amount.scale(CHARGES_PER_YEAR[this.props.cycle], 1);
  }
}
