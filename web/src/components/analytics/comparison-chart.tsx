'use client';

import * as React from 'react';
import { useReducedMotion } from 'motion/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Table as TableIcon } from 'lucide-react';
import type { CategorySpending, Currency } from '@/lib/api/types';
import { formatCompactMoney, toChartNumber } from '@/lib/chart-number';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';

export interface ComparisonChartProps {
  categories: CategorySpending[];
  currency: Currency;
}

export function ComparisonChart({ categories, currency }: ComparisonChartProps) {
  const [showTable, setShowTable] = React.useState(false);
  const shouldReduceMotion = useReducedMotion();

  const top6 = React.useMemo(() => {
    return categories.slice(0, 6);
  }, [categories]);

  const chartData = React.useMemo(() => {
    return top6.map((c) => ({
      name: c.name,
      thisPeriod: toChartNumber(c.total),
      prevPeriod: toChartNumber(c.previousTotal),
      thisPeriodTotal: c.total,
      prevPeriodTotal: c.previousTotal,
      changePercent: c.changePercent,
    }));
  }, [top6]);

  const chartHeight = Math.max(top6.length * 48 + 50, 180);

  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h2 className="font-semibold text-foreground">Compared with previous period</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Top {top6.length} categories in {currency}</p>
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

      {/* Chart */}
      <div
        style={{ height: chartHeight }}
        className="w-full"
        role="img"
        aria-label={`Spending comparison with previous period by category for ${currency}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            accessibilityLayer
            layout="vertical"
            data={chartData}
            margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="" horizontal={false} />
            <XAxis
              type="number"
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              tickFormatter={(val: number) => formatCompactMoney(String(val), currency)}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              width={100}
              tick={{ fontSize: 12 }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              wrapperStyle={{ paddingBottom: '12px', fontSize: '12px' }}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
              content={({ active, payload }) => {
                if (active && payload && payload.length > 0) {
                  const item = payload[0].payload as {
                    name: string;
                    thisPeriodTotal: string;
                    prevPeriodTotal: string;
                  };
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                      <p className="font-semibold text-popover-foreground mb-1">{item.name}</p>
                      <div className="space-y-1">
                        <p className="flex items-center justify-between gap-4 text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <span className="size-2 rounded-full" style={{ backgroundColor: 'var(--chart-1)' }} />
                            This period:
                          </span>
                          <span className="font-medium text-foreground">{formatMoney(item.thisPeriodTotal, currency)}</span>
                        </p>
                        <p className="flex items-center justify-between gap-4 text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <span className="size-2 rounded-full" style={{ backgroundColor: 'var(--chart-3)' }} />
                            Previous period:
                          </span>
                          <span className="font-medium text-foreground">{formatMoney(item.prevPeriodTotal, currency)}</span>
                        </p>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar
              dataKey="thisPeriod"
              name="This period"
              fill="var(--chart-1)"
              radius={[0, 4, 4, 0]}
              maxBarSize={14}
              isAnimationActive={!shouldReduceMotion}
              animationDuration={600}
              animationEasing="ease-out"
            />
            <Bar
              dataKey="prevPeriod"
              name="Previous period"
              fill="var(--chart-3)"
              radius={[0, 4, 4, 0]}
              maxBarSize={14}
              isAnimationActive={!shouldReduceMotion}
              animationDuration={600}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Accessible Table View Toggle */}
      {showTable && (
        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="w-full text-start text-xs">
            <caption className="sr-only">Top categories period comparison table for {currency}</caption>
            <thead className="border-b bg-muted/30 text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">Category</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">This period</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">Previous period</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {chartData.map((d) => (
                <tr key={d.name}>
                  <td className="px-3 py-2 font-medium text-foreground">{d.name}</td>
                  <td className="px-3 py-2 text-end tabular-nums font-medium text-foreground">
                    {formatMoney(d.thisPeriodTotal, currency)}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums text-muted-foreground">
                    {formatMoney(d.prevPeriodTotal, currency)}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums text-muted-foreground">
                    {d.changePercent === null
                      ? 'new'
                      : `${d.changePercent > 0 ? '+' : ''}${Math.round(d.changePercent)}%`}
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
