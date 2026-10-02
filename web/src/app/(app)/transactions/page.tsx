'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, RotateCw, X } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { LiveRegion } from '@/components/live-region';
import { PageHeader } from '@/components/page-header';
import { RowsSkeleton, SectionError } from '@/components/dashboard/section';
import { AddTransactionSheet } from '@/components/transactions/add-transaction-sheet';
import { MoveMoneySheet } from '@/components/transactions/move-money-sheet';
import { TransactionRow } from '@/components/transactions/transaction-row';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { accountsQuery, categoriesQuery, transactionsInfiniteQuery } from '@/lib/api/finance';
import type { TransactionView } from '@/lib/api/types';
import { getCairoDayHeading, toCairoDateString } from '@/lib/cairo-date';
import { addedIds } from '@/lib/new-rows';
import { parseTransactionFilters } from '@/lib/transaction-filters';

const EMPTY_IDS: ReadonlySet<string> = new Set();
import { toast } from 'sonner';

interface DayGroup {
  day: string;
  heading: string;
  transactions: TransactionView[];
}

function TransactionsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [addOpen, setAddOpen] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState<string | null>(null);


  const announce = React.useCallback((msg: string) => {
    setAnnouncement(msg);
    const t = setTimeout(() => setAnnouncement(null), 3000);
    return () => clearTimeout(t);
  }, []);

  const { filters, dateRangeError, hasFilters } = React.useMemo(
    () => parseTransactionFilters(searchParams),
    [searchParams],
  );

  const { data: accounts = [] } = useQuery(accountsQuery);
  const { data: categories = [] } = useQuery(categoriesQuery);

  const visibleAccounts = React.useMemo(
    () => accounts.filter((a) => !a.archived),
    [accounts],
  );

  const spendingCategories = React.useMemo(
    () => categories.filter((c) => c.kind === 'spending'),
    [categories],
  );

  const incomeCategories = React.useMemo(
    () => categories.filter((c) => c.kind === 'income'),
    [categories],
  );

  const filterAccountItems = React.useMemo(
    () => ({
      '': 'All accounts',
      ...Object.fromEntries(
        visibleAccounts.map((a) => [a.id, `${a.name} (${a.currency})`]),
      ),
    }),
    [visibleAccounts],
  );

  const filterCategoryItems = React.useMemo(
    () => ({
      '': 'All categories',
      ...Object.fromEntries(categories.map((c) => [c.id, c.name])),
    }),
    [categories],
  );

  const queryParams = React.useMemo(
    () => ({
      accountId: filters.accountId,
      categoryId: filters.categoryId,
      from: filters.from,
      to: filters.to,
      limit: 50,
    }),
    [filters],
  );

  const infiniteQuery = transactionsInfiniteQuery(queryParams);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    ...infiniteQuery,
    enabled: dateRangeError === null,
  });

  const allTransactions = React.useMemo(() => {
    return data?.pages.flatMap((page) => page) ?? [];
  }, [data]);

  // Ids on screen when a sheet opened. The sheets report success only after the
  // list has refetched, so the "what is new" comparison must use this earlier
  // snapshot. Only the first page is compared, so "Load more" never lights up.
  const [idsWhenOpened, setIdsWhenOpened] = React.useState<ReadonlySet<string> | null>(null);
  const [highlightSince, setHighlightSince] = React.useState<ReadonlySet<string> | null>(null);
  const newlyAddedIds = React.useMemo(
    () => (highlightSince ? addedIds(highlightSince, data?.pages[0] ?? []) : EMPTY_IDS),
    [highlightSince, data],
  );
  React.useEffect(() => {
    if (!highlightSince) return;
    const t = setTimeout(() => setHighlightSince(null), 2000);
    return () => clearTimeout(t);
  }, [highlightSince]);

  const openSheet = (which: 'add' | 'move') => {
    setIdsWhenOpened(new Set(allTransactions.map((tx) => tx.id)));
    if (which === 'add') setAddOpen(true);
    else setMoveOpen(true);
  };

  const groupedTransactions = React.useMemo(() => {
    const groups: DayGroup[] = [];
    for (const tx of allTransactions) {
      const cairoDay = toCairoDateString(new Date(tx.occurredAt));
      let group = groups.find((g) => g.day === cairoDay);
      if (!group) {
        group = {
          day: cairoDay,
          heading: getCairoDayHeading(cairoDay),
          transactions: [],
        };
        groups.push(group);
      }
      group.transactions.push(tx);
    }
    return groups;
  }, [allTransactions]);

  const updateParam = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value && value.trim()) {
      next.set(key, value.trim());
    } else {
      next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const clearFilters = () => {
    router.replace(pathname, { scroll: false });
  };

  return (
    <div className="space-y-8">
      <LiveRegion message={announcement} />

      <PageHeader
        title="Transactions"
        description="Every expense, income and transfer, newest first."
        actions={
          <>
            <Button onClick={() => openSheet('add')} className="h-11 sm:h-10">
              Add transaction
            </Button>
            <Button
              variant="outline"
              onClick={() => openSheet('move')}
              className="h-11 sm:h-10"
            >
              Move money
            </Button>
          </>
        }
      />

      {/* Filters row */}
      <div className="space-y-2 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* Account Filter */}
          <div className="space-y-1">
            <label htmlFor="filter-account" className="text-xs font-medium text-muted-foreground">
              Account
            </label>
            <Select
              items={filterAccountItems}
              value={filters.accountId ?? ''}
              onValueChange={(val) => updateParam('accountId', val ?? undefined)}
            >
              <SelectTrigger id="filter-account" className="h-10 w-full justify-between">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All accounts</SelectItem>
                {visibleAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category Filter */}
          <div className="space-y-1">
            <label htmlFor="filter-category" className="text-xs font-medium text-muted-foreground">
              Category
            </label>
            <Select
              items={filterCategoryItems}
              value={filters.categoryId ?? ''}
              onValueChange={(val) => updateParam('categoryId', val ?? undefined)}
            >
              <SelectTrigger id="filter-category" className="h-10 w-full justify-between">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All categories</SelectItem>
                {spendingCategories.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Spending</SelectLabel>
                    {spendingCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.icon ? `${c.icon} ` : ''}
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {incomeCategories.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Income</SelectLabel>
                      {incomeCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.icon ? `${c.icon} ` : ''}
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* From date */}
          <div className="space-y-1">
            <label htmlFor="filter-from" className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <Input
              id="filter-from"
              type="date"
              className="h-10"
              value={searchParams.get('from') ?? ''}
              onChange={(e) => updateParam('from', e.target.value)}
            />
          </div>

          {/* To date */}
          <div className="space-y-1">
            <label htmlFor="filter-to" className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <Input
              id="filter-to"
              type="date"
              className="h-10"
              value={searchParams.get('to') ?? ''}
              onChange={(e) => updateParam('to', e.target.value)}
            />
          </div>
        </div>

        {dateRangeError && (
          <p className="text-xs text-destructive pt-1">{dateRangeError}</p>
        )}

        {hasFilters && (
          <div className="flex justify-end pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <X aria-hidden="true" className="size-3.5" />
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {/* Content list / Loading / Empty states */}
      {dateRangeError ? null : isLoading ? (
        <div className="rounded-2xl border bg-card pt-6">
          <RowsSkeleton rows={6} />
        </div>
      ) : isError ? (
        <div className="rounded-2xl border bg-card py-6">
          <SectionError what="transactions" onRetry={() => refetch()} />
        </div>
      ) : allTransactions.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Nothing matches these filters"
            action={
              <Button variant="outline" onClick={clearFilters} className="h-11 sm:h-10">
                Clear filters
              </Button>
            }
          >
            Try changing or clearing your filters to see more transactions.
          </EmptyState>
        ) : (
          <EmptyState
            icon={ArrowLeftRight}
            title="No transactions yet"
            action={
              <Button onClick={() => openSheet('add')} className="h-11 sm:h-10">
                Add transaction
              </Button>
            }
          >
            Add one by hand, or connect your phone in Settings.
          </EmptyState>
        )
      ) : (
        <div className="space-y-6">
          {(() => {
            let runningIndex = 0;
            return groupedTransactions.map((group) => (
              <div key={group.day} className="space-y-2">
                <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.heading}
                </h3>
                <ul className="divide-y rounded-2xl border bg-card">
                  {group.transactions.map((tx) => {
                    const idx = runningIndex++;
                    const staggerIndex = idx < 10 ? idx : undefined;
                    const isNew = newlyAddedIds.has(tx.id);
                    return (
                      <TransactionRow
                        key={tx.id}
                        tx={tx}
                        showDate={false}
                        isNew={isNew}
                        staggerIndex={staggerIndex}
                      />
                    );
                  })}
                </ul>
              </div>
            ));
          })()}

          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="h-11 sm:h-10"
              >
                {isFetchingNextPage ? (
                  <>
                    <RotateCw aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                    Loading more…
                  </>
                ) : (
                  'Load more'
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      <AddTransactionSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          setHighlightSince(idsWhenOpened);
          announce('Transaction added');
          toast.success('Transaction added');
        }}
      />

      <MoveMoneySheet
        open={moveOpen}
        onOpenChange={setMoveOpen}
        onSuccess={() => {
          setHighlightSince(idsWhenOpened);
          announce('Transfer added');
          toast.success('Transfer added');
        }}
      />
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="rounded-2xl border bg-card pt-6">
          <RowsSkeleton rows={6} />
        </div>
      }
    >
      <TransactionsContent />
    </React.Suspense>
  );
}
