import { Decimal } from 'decimal.js';
import { Money } from '../../domain/money.js';
import {
  DEFAULT_TIME_ZONE,
  addDays,
  calendarDate,
  daysBetween,
  firstDayOfMonth,
  lastDayOfMonth,
  localDateOf,
  startOfLocalDay,
  type CalendarDate,
} from '../../domain/calendar-date.js';
import type { Currency } from '../../domain/currency.js';
import { DomainError } from '../../domain/errors.js';
import { newCategoryId, type UserId } from '../../domain/ids.js';
import { NotFoundError } from '../errors.js';
import type { Clock } from '../ports/clock.js';
import type { AnalyticsQueries, BudgetRepository, CategoryRepository } from '../ports/finance.js';
import { netByCategory } from '../analytics/category-analytics.js';

/** From this share of the limit on, a budget is "near". */
export const NEAR_SHARE = new Decimal('0.8');

export type BudgetState = 'ok' | 'near' | 'over';

export interface BudgetDto {
  categoryId: string;
  categoryName: string;
  currency: Currency;
  limit: string;
  /** Net: refunds subtract, like analytics. */
  spent: string;
  /** Negative once over the limit, e.g. "-120.00". */
  remaining: string;
  /** Rounded to one decimal, for the progress bar only. */
  percentUsed: number;
  state: BudgetState;
}

export interface BudgetsView {
  /** "2026-10" */
  month: string;
  period: { from: CalendarDate; to: CalendarDate };
  /** Days left including today; 0 for a past month. */
  daysLeft: number;
  budgets: BudgetDto[];
}

/** "2026-10" -> the first day of that month. */
function monthStart(month: string): CalendarDate {
  return calendarDate(`${month}-01`);
}

export function budgetState(spent: Decimal, limit: Decimal): BudgetState {
  if (spent.greaterThan(limit)) return 'over';
  if (spent.greaterThanOrEqualTo(limit.times(NEAR_SHARE))) return 'near';
  return 'ok';
}

/**
 * Budgets for a month: each category's limit in force that month, next to
 * what was spent in that category and currency.
 */
export class ListBudgets {
  constructor(
    private readonly budgets: BudgetRepository,
    private readonly categories: CategoryRepository,
    private readonly analytics: AnalyticsQueries,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId, month?: string): Promise<BudgetsView> {
    const today = localDateOf(this.clock.now(), DEFAULT_TIME_ZONE);
    const from = month === undefined ? firstDayOfMonth(today) : monthStart(month);
    const to = lastDayOfMonth(from);

    const [rows, categories, spending] = await Promise.all([
      this.budgets.effectiveOn(userId, from),
      this.categories.listForUser(userId),
      this.analytics.spendingByCategory(userId, {
        from: startOfLocalDay(from, DEFAULT_TIME_ZONE),
        to: startOfLocalDay(addDays(to, 1), DEFAULT_TIME_ZONE),
      }),
    ]);
    const names = new Map(categories.map((c) => [c.id as string, c.name]));
    const net = netByCategory(spending);

    const budgets = rows
      .filter((r) => !r.limit.isZero())
      .map((r): BudgetDto => {
        const currency = r.limit.getCurrency();
        const limit = new Decimal(r.limit.toDecimalString());
        const spentRaw = net.get(`${currency}|${r.categoryId}`)?.net ?? new Decimal(0);
        // More refunds than purchases is "nothing spent", not negative spending.
        const spent = Decimal.max(spentRaw, 0);
        return {
          categoryId: r.categoryId,
          categoryName: names.get(r.categoryId) ?? 'Category',
          currency,
          limit: limit.toFixed(2),
          spent: spent.toFixed(2),
          remaining: limit.minus(spent).toFixed(2),
          percentUsed: spent.dividedBy(limit).times(100).toDecimalPlaces(1).toNumber(),
          state: budgetState(spent, limit),
        };
      })
      .sort((a, b) => b.percentUsed - a.percentUsed || a.categoryName.localeCompare(b.categoryName));

    const daysLeft = to < today ? 0 : from > today ? daysBetween(from, to) + 1 : daysBetween(today, to) + 1;
    return { month: from.slice(0, 7), period: { from, to }, daysLeft, budgets };
  }
}

/** Sets a category's monthly limit from this month on. */
export class SetBudget {
  constructor(
    private readonly budgets: BudgetRepository,
    private readonly categories: CategoryRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId, categoryId: string, input: { currency: Currency; limit: string }): Promise<void> {
    const category = await this.categories.findForUser(categoryId, userId);
    if (category === null) throw new NotFoundError('Category not found');
    if (category.kind !== 'spending') throw new DomainError('Budgets are for spending categories');
    const limit = Money.create(input.limit, input.currency);
    if (limit.isZero()) throw new DomainError('A budget limit must be greater than zero');
    const month = firstDayOfMonth(localDateOf(this.clock.now(), DEFAULT_TIME_ZONE));
    await this.budgets.setFrom(userId, newCategoryId(category.id), month, limit);
  }
}

/** Stops budgeting a category from this month on; past months keep theirs. */
export class StopBudget {
  constructor(
    private readonly budgets: BudgetRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId, categoryId: string): Promise<void> {
    const month = firstDayOfMonth(localDateOf(this.clock.now(), DEFAULT_TIME_ZONE));
    const current = (await this.budgets.effectiveOn(userId, month)).find((r) => r.categoryId === categoryId);
    if (current === undefined || current.limit.isZero()) throw new NotFoundError('No budget for this category');
    await this.budgets.setFrom(userId, current.categoryId, month, Money.zero(current.limit.getCurrency()));
  }
}
