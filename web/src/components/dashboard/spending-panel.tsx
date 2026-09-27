import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { CurrencyAnalytics } from '@/lib/api/types';
import { formatMoney, monthName } from '@/lib/format';

const TOP_CATEGORIES = 5;

/**
 * One currency's spending for the period. EGP and USD each get their own
 * panel; their totals are never added together.
 */
export function SpendingPanel({
  data,
  periodFrom,
  previousFrom,
}: {
  data: CurrencyAnalytics;
  periodFrom: string;
  previousFrom: string;
}) {
  const { currency, spending, income } = data;
  const top = spending.categories.slice(0, TOP_CATEGORIES);
  const hidden = spending.categories.length - top.length;
  const headingId = `spending-${currency}`;

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id={headingId} className="text-sm font-medium text-muted-foreground">
          Spent in {monthName(periodFrom)}
        </h2>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tracking-wide">{currency}</span>
      </div>

      <p className="mt-2 font-heading text-[2rem] leading-none font-semibold tracking-tight">
        {formatMoney(spending.total, currency)}
      </p>

      <Comparison
        changePercent={spending.changePercent}
        previousTotal={formatMoney(spending.previousTotal, currency)}
        previousMonth={monthName(previousFrom)}
      />

      {income.count > 0 && (
        <p className="mt-1 text-sm text-muted-foreground">
          Income this month <span className="font-medium text-foreground">{formatMoney(income.total, currency, '+')}</span>
        </p>
      )}

      {top.length > 0 ? (
        <ul className="mt-6 space-y-3.5" aria-label={`${currency} spending by category`}>
          {top.map((c) => (
            <li key={c.categoryId ?? 'uncategorized'}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{c.name}</span>
                <span className="shrink-0 tabular-nums">
                  {formatMoney(c.total, currency)}
                  <span className="ms-2 inline-block w-10 text-end text-xs text-muted-foreground">
                    {Math.round(c.share)}%
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                {/* share is a percentage from the API, not money: safe to use as a width. */}
                <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.max(c.share, 1.5)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">No spending recorded in {currency} yet this month.</p>
      )}

      {hidden > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          And {hidden} more {hidden === 1 ? 'category' : 'categories'}.
        </p>
      )}
    </section>
  );
}

/** Month-over-month, worded neutrally: more spending is information, not a scolding. */
function Comparison({
  changePercent,
  previousTotal,
  previousMonth,
}: {
  changePercent: number | null;
  previousTotal: string;
  previousMonth: string;
}) {
  if (changePercent === null) {
    return <p className="mt-3 text-sm text-muted-foreground">Nothing to compare with {previousMonth} yet.</p>;
  }
  const rounded = Math.round(Math.abs(changePercent));
  const Icon = rounded === 0 ? Minus : changePercent > 0 ? TrendingUp : TrendingDown;
  const text =
    rounded === 0
      ? `About the same as ${previousMonth}`
      : `${rounded}% ${changePercent > 0 ? 'more' : 'less'} than ${previousMonth}`;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-sm">
      <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      <span className="font-medium">{text}</span>
      <span className="text-muted-foreground">({previousTotal})</span>
    </p>
  );
}
