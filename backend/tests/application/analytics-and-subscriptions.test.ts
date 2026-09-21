import { describe, expect, it } from 'vitest';
import { GetCategoryAnalytics } from '../../src/application/analytics/category-analytics.js';
import { GetSubscriptionSummary } from '../../src/application/subscriptions/subscriptions.js';
import type {
  AnalyticsQueries,
  CategoryRecord,
  CategoryRepository,
  CategoryTotalRow,
  InstantRange,
  KindTotalRow,
  SubscriptionRepository,
} from '../../src/application/ports/finance.js';
import { Subscription, type BillingCycle } from '../../src/domain/subscription.js';
import { Money } from '../../src/domain/money.js';
import { calendarDate } from '../../src/domain/calendar-date.js';
import { DomainError } from '../../src/domain/errors.js';
import { newCategoryId, newMerchantKey, newUserId } from '../../src/domain/ids.js';
import { FakeClock } from './fakes.js';

const USER = newUserId('11111111-1111-1111-1111-111111111111');
const FOOD = newCategoryId('c0000000-0000-0000-0000-00000000f00d');
const TRAVEL = newCategoryId('c0000000-0000-0000-0000-0000000007a1');

const categories: CategoryRecord[] = [
  { id: FOOD, name: 'Food & Dining', kind: 'spending', icon: '🍔', color: null, isSystem: true },
  { id: TRAVEL, name: 'Travel', kind: 'spending', icon: '✈️', color: null, isSystem: true },
];

const categoryRepo: CategoryRepository = {
  listForUser: async () => categories,
  findForUser: async () => null,
  findByNameForUser: async () => null,
  create: async () => { throw new Error('unused'); },
};

/** Returns fixed rows, and records the ranges it was asked about. */
class FakeAnalytics implements AnalyticsQueries {
  readonly spendingRanges: InstantRange[] = [];
  constructor(
    private readonly current: CategoryTotalRow[],
    private readonly previous: CategoryTotalRow[] = [],
    private readonly kinds: KindTotalRow[] = [],
  ) {}
  async spendingByCategory(_u: unknown, range: InstantRange): Promise<CategoryTotalRow[]> {
    this.spendingRanges.push(range);
    return this.spendingRanges.length === 1 ? this.current : this.previous;
  }
  async totalsByKind(): Promise<KindTotalRow[]> {
    return this.kinds;
  }
}

const row = (categoryId: string | null, direction: 'debit' | 'credit', total: string, currency: 'EGP' | 'USD' = 'EGP', count = 1): CategoryTotalRow =>
  ({ currency, categoryId, direction, total, count });

// 21 Sep 2026, 10:00 Cairo.
const clock = new FakeClock(new Date('2026-09-21T07:00:00Z'));

describe('GetCategoryAnalytics', () => {
  it('defaults to the current month on the Cairo calendar', async () => {
    const report = await new GetCategoryAnalytics(new FakeAnalytics([]), categoryRepo, clock).execute(USER, {});
    expect(report.period).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(report.previousPeriod).toEqual({ from: '2026-08-02', to: '2026-08-31' });
  });

  it('queries the exact Cairo-midnight instants, not UTC midnight', async () => {
    const fake = new FakeAnalytics([]);
    await new GetCategoryAnalytics(fake, categoryRepo, clock).execute(USER, {});
    // 1 Sep 00:00 Cairo (UTC+3) is 31 Aug 21:00 UTC.
    expect(fake.spendingRanges[0]?.from.toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect(fake.spendingRanges[0]?.to.toISOString()).toBe('2026-09-30T21:00:00.000Z');
  });

  it('computes totals, shares, and sorts biggest first', async () => {
    const fake = new FakeAnalytics([row(FOOD, 'debit', '750.00', 'EGP', 3), row(TRAVEL, 'debit', '250.00')]);
    const report = await new GetCategoryAnalytics(fake, categoryRepo, clock).execute(USER, {});
    const egp = report.currencies[0]!;

    expect(egp.spending.total).toBe('1000.00');
    expect(egp.spending.categories.map((c) => [c.name, c.total, c.share])).toEqual([
      ['Food & Dining', '750.00', 75],
      ['Travel', '250.00', 25],
    ]);
  });

  it('nets refunds against spending in the same category', async () => {
    const fake = new FakeAnalytics([row(FOOD, 'debit', '500.00'), row(FOOD, 'credit', '120.00')]);
    const report = await new GetCategoryAnalytics(fake, categoryRepo, clock).execute(USER, {});
    expect(report.currencies[0]?.spending.categories[0]?.total).toBe('380.00');
  });

  it('labels spending with no category as Uncategorized', async () => {
    const report = await new GetCategoryAnalytics(new FakeAnalytics([row(null, 'debit', '60.00')]), categoryRepo, clock)
      .execute(USER, {});
    expect(report.currencies[0]?.spending.categories[0]?.name).toBe('Uncategorized');
  });

  it('compares against the previous period', async () => {
    const fake = new FakeAnalytics([row(FOOD, 'debit', '1200.00')], [row(FOOD, 'debit', '1000.00')]);
    const food = (await new GetCategoryAnalytics(fake, categoryRepo, clock).execute(USER, {})).currencies[0]!.spending.categories[0]!;
    expect(food.previousTotal).toBe('1000.00');
    expect(food.changePercent).toBe(20);
  });

  it('reports no percentage change when there is nothing to compare with', async () => {
    const report = await new GetCategoryAnalytics(new FakeAnalytics([row(FOOD, 'debit', '100.00')]), categoryRepo, clock)
      .execute(USER, {});
    expect(report.currencies[0]?.spending.changePercent).toBeNull();
  });

  it('keeps EGP and USD in separate reports — never added together', async () => {
    const fake = new FakeAnalytics([row(FOOD, 'debit', '500.00', 'EGP'), row(FOOD, 'debit', '20.00', 'USD')]);
    const report = await new GetCategoryAnalytics(fake, categoryRepo, clock).execute(USER, {});
    expect(report.currencies.map((c) => [c.currency, c.spending.total])).toEqual([
      ['EGP', '500.00'],
      ['USD', '20.00'],
    ]);
  });

  it('shows the stock market as INVESTING, beside spending but never inside it', async () => {
    const fake = new FakeAnalytics(
      [row(FOOD, 'debit', '800.00')],
      [],
      [
        { currency: 'EGP', kind: 'trade', direction: 'debit', total: '10000.00', count: 1 },
        { currency: 'EGP', kind: 'trade', direction: 'credit', total: '2500.00', count: 1 },
        { currency: 'EGP', kind: 'income', direction: 'credit', total: '30000.00', count: 1 },
        { currency: 'EGP', kind: 'dividend', direction: 'credit', total: '150.00', count: 1 },
      ],
    );
    const egp = (await new GetCategoryAnalytics(fake, categoryRepo, clock).execute(USER, {})).currencies[0]!;

    expect(egp.spending.total).toBe('800.00'); // the 10,000 in shares is NOT here
    expect(egp.investing).toEqual({ invested: '10000.00', withdrawn: '2500.00', net: '7500.00', count: 2 });
    expect(egp.income.total).toBe('30150.00'); // salary + dividend
  });

  it('accepts an explicit period and compares it with the same length before it', async () => {
    const report = await new GetCategoryAnalytics(new FakeAnalytics([]), categoryRepo, clock)
      .execute(USER, { from: calendarDate('2026-09-10'), to: calendarDate('2026-09-16') });
    expect(report.previousPeriod).toEqual({ from: '2026-09-03', to: '2026-09-09' });
  });

  it('rejects a reversed or over-long period', async () => {
    const analytics = new GetCategoryAnalytics(new FakeAnalytics([]), categoryRepo, clock);
    await expect(analytics.execute(USER, { from: calendarDate('2026-09-10'), to: calendarDate('2026-09-01') }))
      .rejects.toBeInstanceOf(DomainError);
    await expect(analytics.execute(USER, { from: calendarDate('2025-01-01'), to: calendarDate('2026-09-01') }))
      .rejects.toBeInstanceOf(DomainError);
  });
});

describe('GetSubscriptionSummary', () => {
  function sub(name: string, amount: string, currency: 'EGP' | 'USD', cycle: BillingCycle, anchor: string) {
    return Subscription.create({
      id: name, userId: USER, name, merchantKey: newMerchantKey(name.toUpperCase()),
      amount: Money.create(amount, currency), cycle, anchorDate: calendarDate(anchor),
      categoryId: null, accountId: null, notes: null,
    });
  }

  function repoOf(subs: Subscription[]): SubscriptionRepository {
    return {
      create: async () => undefined,
      save: async () => undefined,
      findForUser: async () => null,
      listForUser: async (_u, status) => subs.filter((s) => status === undefined || s.status === status),
    };
  }

  it('totals active subscriptions per currency — Netflix in EGP, Claude in USD', async () => {
    const paused = sub('Gym', '900.00', 'EGP', 'monthly', '2026-01-10');
    paused.pause();
    const subs = [
      sub('Netflix', '240.00', 'EGP', 'monthly', '2026-01-05'),
      sub('Shahid', '1200.00', 'EGP', 'yearly', '2026-03-01'),
      sub('Claude', '20.00', 'USD', 'monthly', '2026-02-15'),
      paused,
    ];

    const summary = await new GetSubscriptionSummary(repoOf(subs), clock).execute(USER, 30);

    expect(summary.activeCount).toBe(3);
    expect(summary.totals).toEqual([
      { currency: 'EGP', monthly: '340.00', yearly: '4080.00' }, // 240 + 1200/12; paused gym excluded
      { currency: 'USD', monthly: '20.00', yearly: '240.00' },
    ]);
  });

  it('lists what is due in the next N days, soonest first', async () => {
    const subs = [
      sub('Netflix', '240.00', 'EGP', 'monthly', '2026-01-05'),
      sub('Claude', '20.00', 'USD', 'monthly', '2026-02-25'),
    ];
    const summary = await new GetSubscriptionSummary(repoOf(subs), clock).execute(USER, 30);

    // Today is 21 Sep (Cairo). Window: 21 Sep – 20 Oct.
    expect(summary.asOf).toBe('2026-09-21');
    expect(summary.upcoming.map((u) => [u.name, u.date])).toEqual([
      ['Claude', '2026-09-25'],
      ['Netflix', '2026-10-05'],
    ]);
  });
});
