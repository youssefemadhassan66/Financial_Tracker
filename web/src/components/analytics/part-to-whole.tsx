'use client';

import * as React from 'react';
import Link from 'next/link';
import { Table as TableIcon } from 'lucide-react';
import { GrowBar } from '@/components/motion/grow-bar';
import { foldTopCategories } from '@/lib/chart-categories';
import type { CategorySpending, Currency } from '@/lib/api/types';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PartToWholeProps {
  categories: CategorySpending[];
  currency: Currency;
  periodFrom: string;
  periodTo: string;
  colorMap: Map<string, string>;
}

export function PartToWhole({
  categories,
  currency,
  periodFrom,
  periodTo,
  colorMap,
}: PartToWholeProps) {
  const [showTable, setShowTable] = React.useState(false);

  const { segments, colorMap: nextColorMap } = React.useMemo(() => {
    return foldTopCategories(categories, colorMap);
  }, [categories, colorMap]);

  // Write the assignments back into the page-wide map (one Map object for the
  // whole page session) so a category keeps its color when the user switches
  // period or currency: color follows the category, not its rank.
  React.useEffect(() => {
    colorMap.clear();
    for (const [key, color] of nextColorMap) colorMap.set(key, color);
  }, [colorMap, nextColorMap]);

  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between pb-3">
        <h2 className="font-semibold text-foreground">Where the money went</h2>
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

      {/* 100% Horizontal Stacked Bar */}
      <div
        role="img"
        aria-label={`Spending breakdown by category for ${currency}`}
        className="flex h-6 w-full gap-[2px] overflow-hidden rounded-[4px] bg-muted/20"
      >
        {segments.map((seg, i) => (
          <div
            key={seg.categoryId ?? seg.name}
            style={{
              width: `${Math.max(seg.share, 0.5)}%`,
              backgroundColor: seg.color,
              opacity: seg.isOther ? 0.4 : 1,
            }}
            className={cn(
              'h-full transition-all',
              i === 0 && 'rounded-s-[4px]',
              i === segments.length - 1 && 'rounded-e-[4px]',
            )}
            title={`${seg.name}: ${formatMoney(seg.total, currency)} (${seg.share}%)`}
          />
        ))}
      </div>

      {/* Legend below the bar with direct labels */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-3 text-xs">
        {segments.map((seg) => (
          <div key={seg.categoryId ?? seg.name} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-xs"
              style={{
                backgroundColor: seg.color,
                opacity: seg.isOther ? 0.4 : 1,
              }}
            />
            <span className="font-medium text-foreground">{seg.name}</span>
            <span className="text-muted-foreground">{formatMoney(seg.total, currency)}</span>
            <span className="font-semibold text-muted-foreground">{Math.round(seg.share)}%</span>
          </div>
        ))}
      </div>

      {/* Accessible Table View Toggle */}
      {showTable && (
        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="w-full text-start text-xs">
            <caption className="sr-only">Spending category breakdown for {currency}</caption>
            <thead className="border-b bg-muted/30 text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">Category</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">Amount</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">Share</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">Transactions</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">vs Previous</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {categories.map((c) => (
                <tr key={c.categoryId ?? 'uncategorized'}>
                  <td className="px-3 py-2 font-medium text-foreground">{c.name}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{formatMoney(c.total, currency)}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{c.share}%</td>
                  <td className="px-3 py-2 text-end tabular-nums">{c.count}</td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {c.changePercent === null
                      ? 'new'
                      : `${c.changePercent > 0 ? '+' : ''}${Math.round(c.changePercent)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Full Ranked Category List */}
      <ul className="mt-6 divide-y border-t" aria-label={`All spending categories for ${currency}`}>
        {categories.map((c) => {
          const href = c.categoryId
            ? `/transactions?categoryId=${c.categoryId}&from=${periodFrom}&to=${periodTo}`
            : `/transactions?from=${periodFrom}&to=${periodTo}`;

          const chipText =
            c.changePercent === null
              ? 'new'
              : `${c.changePercent > 0 ? '+' : ''}${Math.round(c.changePercent)}%`;

          return (
            <li key={c.categoryId ?? 'uncategorized'}>
              <Link
                href={href}
                className="group flex flex-col rounded-lg px-2 py-3 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate font-medium text-foreground group-hover:text-primary transition-colors">
                      {c.name}
                    </span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {chipText}
                    </span>
                  </div>
                  <div className="shrink-0 text-end">
                    <span className="tabular-nums font-medium text-foreground">
                      {formatMoney(c.total, currency)}
                    </span>
                    <span className="ms-2 inline-block w-9 text-end text-xs text-muted-foreground">
                      {Math.round(c.share)}%
                    </span>
                  </div>
                </div>
                <GrowBar share={c.share} className="mt-2" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
