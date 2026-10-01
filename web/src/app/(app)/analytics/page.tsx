'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChartColumn } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { SectionError } from '@/components/dashboard/section';
import { FadeIn } from '@/components/motion/fade-in';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { categoryAnalyticsRangeQuery } from '@/lib/api/finance';
import type { Currency } from '@/lib/api/types';
import {
  buildMonthlyRanges,
  countDaysInclusive,
  formatPeriodExplicit,
  parsePeriodParams,
  periodRange,
  type PeriodPreset,
} from '@/lib/analytics-period';
import { useAuth } from '@/providers/auth-provider';
import { AnalyticsControls } from '@/components/analytics/analytics-controls';
import { AnalyticsSummary } from '@/components/analytics/analytics-summary';
import { PartToWhole } from '@/components/analytics/part-to-whole';
import { SpendingOverTime } from '@/components/analytics/spending-over-time';
import { ComparisonChart } from '@/components/analytics/comparison-chart';
import { AnalyticsSkeleton } from '@/components/analytics/analytics-skeleton';
import { cn } from '@/lib/utils';

export default function AnalyticsPage() {
  return (
    <React.Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsContent />
    </React.Suspense>
  );
}

function AnalyticsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  // Stable category color map that persists across period and currency switches in this page session
  const [colorMap] = React.useState<Map<string, string>>(() => new Map());

  // Parse current URL parameters
  const parsed = React.useMemo(() => {
    return parsePeriodParams(searchParams);
  }, [searchParams]);

  const customFrom = parsed.customFrom ?? parsed.range.from;
  const customTo = parsed.customTo ?? parsed.range.to;

  // Main analytics query for the chosen period
  const analyticsQuery = useQuery({
    ...categoryAnalyticsRangeQuery(parsed.range.from, parsed.range.to),
    placeholderData: keepPreviousData,
  });

  const availableCurrencies: Currency[] = React.useMemo(() => {
    return analyticsQuery.data?.currencies.map((c) => c.currency) ?? [];
  }, [analyticsQuery.data]);

  // Determine active currency from URL, user default, or response
  const urlCurrency = searchParams.get('currency') as Currency | null;
  const activeCurrency: Currency = React.useMemo(() => {
    if (urlCurrency && availableCurrencies.includes(urlCurrency)) {
      return urlCurrency;
    }
    const defaultCurr = user?.defaultCurrency;
    if (defaultCurr && availableCurrencies.includes(defaultCurr)) {
      return defaultCurr;
    }
    return availableCurrencies[0] ?? 'EGP';
  }, [urlCurrency, user, availableCurrencies]);

  // Find active currency data block
  const currencyBlock = React.useMemo(() => {
    return analyticsQuery.data?.currencies.find((c) => c.currency === activeCurrency);
  }, [analyticsQuery.data, activeCurrency]);

  const periodDays = React.useMemo(() => {
    return countDaysInclusive(parsed.range.from, parsed.range.to);
  }, [parsed.range.from, parsed.range.to]);

  const monthRanges = React.useMemo(() => {
    return buildMonthlyRanges(parsed.range.from, parsed.range.to);
  }, [parsed.range.from, parsed.range.to]);

  const rangeLabel = React.useMemo(() => {
    return formatPeriodExplicit(parsed.range);
  }, [parsed.range]);

  // Handlers for URL state updates
  const handleSelectPreset = (newPreset: PeriodPreset) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('from');
    params.delete('to');
    if (newPreset === 'custom') {
      const currentRange = periodRange('this-month');
      params.set('from', customFrom || currentRange.from);
      params.set('to', customTo || currentRange.to);
      params.delete('period');
    } else if (newPreset === 'this-month') {
      params.delete('period');
    } else {
      params.set('period', newPreset);
    }
    router.replace(`/analytics?${params.toString()}`);
  };

  const handleCustomChange = (newFrom: string, newTo: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('period');
    params.set('from', newFrom);
    params.set('to', newTo);
    router.replace(`/analytics?${params.toString()}`);
  };

  const handleSelectCurrency = (newCurrency: Currency) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('currency', newCurrency);
    router.replace(`/analytics?${params.toString()}`);
  };

  // First load skeleton only
  if (analyticsQuery.isPending) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Spending analytics"
          description="Where your money went and how it compares with earlier periods."
        />
        <AnalyticsSkeleton />
      </div>
    );
  }

  // Error state
  if (analyticsQuery.isError) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Spending analytics"
          description="Where your money went and how it compares with earlier periods."
        />
        <div className="rounded-2xl border bg-card p-6">
          <SectionError what="your spending analytics" onRetry={() => void analyticsQuery.refetch()} />
        </div>
      </div>
    );
  }

  const isUpdating = analyticsQuery.isFetching && !analyticsQuery.isPending;
  const hasSpending =
    currencyBlock &&
    (currencyBlock.spending.categories.length > 0 ||
      (currencyBlock.spending.total !== '0.00' && currencyBlock.spending.total !== '0'));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Spending analytics"
        description="Where your money went and how it compares with earlier periods."
      />

      {/* Controls row */}
      <AnalyticsControls
        preset={parsed.preset}
        onSelectPreset={handleSelectPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomChange={handleCustomChange}
        customError={parsed.error}
        currencies={availableCurrencies}
        selectedCurrency={activeCurrency}
        onSelectCurrency={handleSelectCurrency}
        rangeLabel={rangeLabel}
        isUpdating={isUpdating}
      />

      {/* Content for selected currency and period */}
      {!hasSpending ? (
        <FadeIn>
          <EmptyState
            icon={ChartColumn}
            title={`No spending recorded in ${activeCurrency}`}
            action={
              <Link
                href="/transactions"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                View transactions
              </Link>
            }
          >
            There are no spending transactions recorded in {activeCurrency} for this period. Enjoy the quiet.
          </EmptyState>
        </FadeIn>
      ) : (
        <div className={cn('space-y-8 transition-opacity duration-200', isUpdating && 'opacity-60')}>
          {/* Summary Strip (Stat Tiles) */}
          <FadeIn>
            <AnalyticsSummary
              currency={activeCurrency}
              spending={currencyBlock.spending}
              income={currencyBlock.income}
              investing={currencyBlock.investing}
              periodDays={periodDays}
            />
          </FadeIn>

          {/* Main Charts & Categories Grid */}
          <Stagger className="grid items-start gap-6 lg:grid-cols-2">
            {/* Part to Whole (Left Column) */}
            <StaggerItem index={0}>
              <PartToWhole
                categories={currencyBlock.spending.categories}
                currency={activeCurrency}
                periodFrom={parsed.range.from}
                periodTo={parsed.range.to}
                colorMap={colorMap}
              />
            </StaggerItem>

            {/* Spending Over Time and Comparison (Right Column) */}
            <div className="space-y-6">
              <StaggerItem index={1}>
                <SpendingOverTime monthRanges={monthRanges} currency={activeCurrency} />
              </StaggerItem>

              <StaggerItem index={2}>
                <ComparisonChart categories={currencyBlock.spending.categories} currency={activeCurrency} />
              </StaggerItem>
            </div>
          </Stagger>
        </div>
      )}
    </div>
  );
}
