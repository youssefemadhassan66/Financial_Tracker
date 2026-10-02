'use client';

import * as React from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { CountUp } from '@/components/motion/count-up';
import type { Currency, CurrencyAnalytics } from '@/lib/api/types';
import { formatMoney } from '@/lib/format';

export interface AnalyticsSummaryProps {
  currency: Currency;
  spending: CurrencyAnalytics['spending'];
  income: CurrencyAnalytics['income'];
  investing: CurrencyAnalytics['investing'];
  periodDays: number;
}

export function AnalyticsSummary({
  currency,
  spending,
  income,
  investing,
  periodDays,
}: AnalyticsSummaryProps) {
  const transactionCount = React.useMemo(() => {
    return spending.categories.reduce((acc, c) => acc + c.count, 0);
  }, [spending.categories]);

  const comparison = React.useMemo(() => {
    if (spending.changePercent === null) {
      return { text: 'Nothing to compare yet', Icon: null };
    }
    const rounded = Math.round(Math.abs(spending.changePercent));
    const dayLabel = periodDays === 1 ? 'day' : `${periodDays} days`;
    if (rounded === 0) {
      return { text: 'About the same', Icon: Minus };
    }
    const isMore = spending.changePercent > 0;
    return {
      text: `${rounded}% ${isMore ? 'more' : 'less'} than the previous ${dayLabel}`,
      Icon: isMore ? TrendingUp : TrendingDown,
    };
  }, [spending.changePercent, periodDays]);

  const ComparisonIcon = comparison.Icon;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Spent Tile */}
      <div className="rounded-2xl border bg-card p-5">
        <p className="text-sm font-medium text-muted-foreground">Spent</p>
        <p className="mt-2">
          <CountUp
            amount={spending.total}
            currency={currency}
            className="proportional-nums font-sans text-3xl font-semibold tracking-tight text-foreground"
          />
        </p>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          {ComparisonIcon && <ComparisonIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />}
          <span>{comparison.text}</span>
        </div>
      </div>

      {/* Spending Transactions Count */}
      <div className="rounded-2xl border bg-card p-5">
        <p className="text-sm font-medium text-muted-foreground">Transactions</p>
        <p className="mt-2 proportional-nums font-sans text-3xl font-semibold tracking-tight text-foreground">
          {transactionCount}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Across {spending.categories.length} {spending.categories.length === 1 ? 'category' : 'categories'}
        </p>
      </div>

      {/* Income Tile (count > 0 only) */}
      {income.count > 0 && (
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-sm font-medium text-muted-foreground">Income</p>
          <p className="mt-2 proportional-nums font-sans text-3xl font-semibold tracking-tight text-foreground">
            {formatMoney(income.total, currency, '+')}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            {income.count} {income.count === 1 ? 'transaction' : 'transactions'}
          </p>
        </div>
      )}

      {/* Investing Tile (count > 0 only) */}
      {investing.count > 0 && (
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-sm font-medium text-muted-foreground">Invested & withdrawn</p>
          <p className="mt-2 proportional-nums font-sans text-3xl font-semibold tracking-tight text-foreground">
            {formatMoney(investing.net, currency)}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Invested {formatMoney(investing.invested, currency)}, withdrawn {formatMoney(investing.withdrawn, currency)}
          </p>
        </div>
      )}
    </div>
  );
}
