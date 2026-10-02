'use client';

import * as React from 'react';
import { useQueries } from '@tanstack/react-query';
import { useReducedMotion } from 'motion/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Table as TableIcon } from 'lucide-react';
import { categoryAnalyticsRangeQuery } from '@/lib/api/finance';
import type { MonthRange } from '@/lib/analytics-period';
import type { Currency } from '@/lib/api/types';
import { formatCompactMoney, toChartNumber } from '@/lib/chart-number';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { SectionError } from '@/components/dashboard/section';

export interface SpendingOverTimeProps {
  monthRanges: MonthRange[];
  currency: Currency;
}

export function SpendingOverTime({ monthRanges, currency }: SpendingOverTimeProps) {
  const [showTable, setShowTable] = React.useState(false);
  const shouldReduceMotion = useReducedMotion();

  const results = useQueries({
    queries: monthRanges.map((m) => categoryAnalyticsRangeQuery(m.from, m.to)),
  });

  const chartData = React.useMemo(() => {
    return monthRanges.map((m, idx) => {
      const q = results[idx];
      const currencyBlock = q?.data?.currencies.find((c) => c.currency === currency);
      const totalString = currencyBlock?.spending.total ?? '0.00';
      return {
        label: m.label,
        shortName: m.shortName,
        from: m.from,
        to: m.to,
        amount: toChartNumber(totalString),
        totalString,
      };
    });
  }, [monthRanges, results, currency]);

  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h2 className="font-semibold text-foreground">Spending over time</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Monthly spending in {currency}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTable((prev) => !prev)}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={showTable}
        >
          <TableIcon className="size-3.5" aria-hidden="true" />
          {showTable ? 'Hide table' : 'Show as table'}
        </Button>
      </div>

      {/* A month that is still loading or failed must not be drawn as a zero:
          that would be a wrong number, not a missing one. */}
      {results.some((r) => r.isError) ? (
        <SectionError what="the monthly totals" onRetry={() => results.forEach((r) => r.isError && void r.refetch())} />
      ) : results.some((r) => r.isPending) ? (
        <div className="flex h-64 items-end gap-3 px-2 pb-6" aria-busy="true" aria-label="Loading monthly totals">
          {monthRanges.map((m, i) => (
            <div
              key={m.from}
              className="flex-1 rounded-t-md bg-muted motion-safe:animate-pulse"
              style={{ height: `${30 + ((i * 23) % 50)}%` }}
            />
          ))}
        </div>
      ) : (
      <div className="h-64 w-full" role="img" aria-label={`Monthly spending over time for ${currency}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              tickFormatter={(val: number) => formatCompactMoney(String(val), currency)}
              tick={{ fontSize: 12 }}
              width={65}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
              content={({ active, payload }) => {
                if (active && payload && payload.length > 0) {
                  const item = payload[0].payload as { label: string; totalString: string };
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-1.5 text-xs shadow-md">
                      <p className="font-semibold text-popover-foreground">{item.label}</p>
                      <p className="text-muted-foreground">{formatMoney(item.totalString, currency)}</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar
              dataKey="amount"
              fill="var(--chart-1)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={!shouldReduceMotion}
              animationDuration={600}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      )}

      {/* Accessible Table View Toggle */}
      {showTable && results.every((r) => r.isSuccess) && (
        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="w-full text-start text-xs">
            <caption className="sr-only">Monthly spending summary table for {currency}</caption>
            <thead className="border-b bg-muted/30 text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">Month</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">Period</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">Spending</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {chartData.map((d) => (
                <tr key={d.label}>
                  <td className="px-3 py-2 font-medium text-foreground">{d.label}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.from} to {d.to}</td>
                  <td className="px-3 py-2 text-end tabular-nums font-medium text-foreground">
                    {formatMoney(d.totalString, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
