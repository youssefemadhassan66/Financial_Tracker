import { Decimal } from 'decimal.js';
import type { Currency } from '../../domain/currency.js';
import type { UserId } from '../../domain/ids.js';
import { DomainError } from '../../domain/errors.js';
import {
  DEFAULT_TIME_ZONE,
  addDays,
  daysBetween,
  firstDayOfMonth,
  lastDayOfMonth,
  localDateOf,
  startOfLocalDay,
  type CalendarDate,
} from '../../domain/calendar-date.js';
import type { Clock } from '../ports/clock.js';
import type {
  AnalyticsQueries,
  CategoryRecord,
  CategoryRepository,
  CategoryTotalRow,
  InstantRange,
  KindTotalRow,
} from '../ports/finance.js';

/** Longest period one report may cover. Guards against a year-long
 *  scan triggered by a typo in a date. */
const MAX_PERIOD_DAYS = 366;

export interface Period {
  from: CalendarDate;
  to: CalendarDate;
}

export interface CategoryBreakdown {
  categoryId: string | null;
  name: string;
  icon: string | null;
  /** Net spending: charges minus refunds. */
  total: string;
  /** Percentage of this currency's total spending. */
  share: number;
  count: number;
  previousTotal: string;
  /** null when there was nothing to compare against. */
  changePercent: number | null;
}

export interface CurrencyReport {
  currency: Currency;
  spending: {
    total: string;
    previousTotal: string;
    changePercent: number | null;
    categories: CategoryBreakdown[];
  };
  /**
   * Money moved into (and out of) investments — the stock market.
   * Reported SEPARATELY from spending: buying TMG shares for 10,000 EGP
   * did not make you 10,000 poorer, so it must never inflate "spent".
   */
  investing: { invested: string; withdrawn: string; net: string; count: number };
  income: { total: string; count: number };
}

export interface CategoryAnalyticsReport {
  period: Period;
  previousPeriod: Period;
  timeZone: string;
  /** One report per currency. EGP and USD are never added together —
   *  there is no exchange rate to do it honestly. */
  currencies: CurrencyReport[];
}

const UNCATEGORIZED = 'Uncategorized';

function fixed(value: Decimal): string {
  return value.toFixed(2);
}

/** Percentage change, or null when the base is zero (division by zero
 *  would be "infinite growth", which is not a useful number to show). */
function changePercent(current: Decimal, previous: Decimal): number | null {
  if (previous.isZero()) return null;
  return current.minus(previous).dividedBy(previous.abs()).times(100).toDecimalPlaces(1).toNumber();
}

/** Net per currency+category: debits add, credits (refunds) subtract. */
function netByCategory(rows: CategoryTotalRow[]): Map<string, { net: Decimal; count: number }> {
  const result = new Map<string, { net: Decimal; count: number }>();
  for (const row of rows) {
    const key = `${row.currency}|${row.categoryId ?? ''}`;
    const entry = result.get(key) ?? { net: new Decimal(0), count: 0 };
    const amount = new Decimal(row.total);
    entry.net = row.direction === 'debit' ? entry.net.plus(amount) : entry.net.minus(amount);
    entry.count += row.count;
    result.set(key, entry);
  }
  return result;
}

export class GetCategoryAnalytics {
  constructor(
    private readonly analytics: AnalyticsQueries,
    private readonly categories: CategoryRepository,
    private readonly clock: Clock,
    private readonly timeZone: string = DEFAULT_TIME_ZONE,
  ) {}

  async execute(userId: UserId, requested: Partial<Period>): Promise<CategoryAnalyticsReport> {
    const period = this.resolvePeriod(requested);
    const length = daysBetween(period.from, period.to) + 1;
    // The comparison period is the same number of days immediately before.
    const previousPeriod: Period = {
      from: addDays(period.from, -length),
      to: addDays(period.from, -1),
    };

    const [current, previous, kinds, categoryList] = await Promise.all([
      this.analytics.spendingByCategory(userId, this.toRange(period)),
      this.analytics.spendingByCategory(userId, this.toRange(previousPeriod)),
      this.analytics.totalsByKind(userId, this.toRange(period), ['trade', 'income', 'dividend']),
      this.categories.listForUser(userId),
    ]);

    const categoriesById = new Map<string, CategoryRecord>(categoryList.map((c) => [c.id, c]));
    const currentNet = netByCategory(current);
    const previousNet = netByCategory(previous);

    const currencies = new Set<Currency>([
      ...current.map((r) => r.currency),
      ...previous.map((r) => r.currency),
      ...kinds.map((r) => r.currency),
    ]);

    return {
      period,
      previousPeriod,
      timeZone: this.timeZone,
      currencies: [...currencies].sort().map((currency) =>
        this.reportFor(currency, currentNet, previousNet, kinds, categoriesById),
      ),
    };
  }

  private resolvePeriod(requested: Partial<Period>): Period {
    // Default: the current month, as the user's calendar sees it.
    const today = localDateOf(this.clock.now(), this.timeZone);
    const from = requested.from ?? firstDayOfMonth(requested.to ?? today);
    const to = requested.to ?? lastDayOfMonth(from);

    if (to < from) {
      throw new DomainError('Period end must not be before its start');
    }
    if (daysBetween(from, to) + 1 > MAX_PERIOD_DAYS) {
      throw new DomainError(`A period may cover at most ${MAX_PERIOD_DAYS} days`);
    }
    return { from, to };
  }

  /** Calendar days -> the exact instants they span in the user's timezone. */
  private toRange(period: Period): InstantRange {
    return {
      from: startOfLocalDay(period.from, this.timeZone),
      to: startOfLocalDay(addDays(period.to, 1), this.timeZone),
    };
  }

  private reportFor(
    currency: Currency,
    currentNet: Map<string, { net: Decimal; count: number }>,
    previousNet: Map<string, { net: Decimal; count: number }>,
    kinds: KindTotalRow[],
    categoriesById: Map<string, CategoryRecord>,
  ): CurrencyReport {
    const prefix = `${currency}|`;
    const sumFor = (map: Map<string, { net: Decimal }>) =>
      [...map.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .reduce((sum, [, v]) => sum.plus(v.net), new Decimal(0));

    const total = sumFor(currentNet);
    const previousTotal = sumFor(previousNet);

    const categoryKeys = new Set(
      [...currentNet.keys(), ...previousNet.keys()].filter((key) => key.startsWith(prefix)),
    );

    const categories: CategoryBreakdown[] = [...categoryKeys].map((key) => {
      const categoryId = key.slice(prefix.length) || null;
      const now = currentNet.get(key) ?? { net: new Decimal(0), count: 0 };
      const before = previousNet.get(key)?.net ?? new Decimal(0);
      const record = categoryId === null ? undefined : categoriesById.get(categoryId);

      return {
        categoryId,
        name: record?.name ?? UNCATEGORIZED,
        icon: record?.icon ?? null,
        total: fixed(now.net),
        share: total.isZero() ? 0 : now.net.dividedBy(total).times(100).toDecimalPlaces(1).toNumber(),
        count: now.count,
        previousTotal: fixed(before),
        changePercent: changePercent(now.net, before),
      };
    });

    // Biggest spending first — the question people actually ask.
    categories.sort((a, b) => new Decimal(b.total).comparedTo(a.total));

    const kindSum = (kind: string, direction: 'debit' | 'credit') =>
      kinds
        .filter((r) => r.currency === currency && r.kind === kind && r.direction === direction)
        .reduce((acc, r) => ({ total: acc.total.plus(r.total), count: acc.count + r.count }), {
          total: new Decimal(0),
          count: 0,
        });

    const bought = kindSum('trade', 'debit');
    const sold = kindSum('trade', 'credit');
    const income = kindSum('income', 'credit');
    const dividends = kindSum('dividend', 'credit');

    return {
      currency,
      spending: {
        total: fixed(total),
        previousTotal: fixed(previousTotal),
        changePercent: changePercent(total, previousTotal),
        categories,
      },
      investing: {
        invested: fixed(bought.total),
        withdrawn: fixed(sold.total),
        net: fixed(bought.total.minus(sold.total)),
        count: bought.count + sold.count,
      },
      income: {
        total: fixed(income.total.plus(dividends.total)),
        count: income.count + dividends.count,
      },
    };
  }
}
