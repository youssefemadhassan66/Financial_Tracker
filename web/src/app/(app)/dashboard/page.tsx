'use client';

import Link from 'next/link';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ArrowRight, FileText, MessageSquareText, Wallet, type LucideIcon } from 'lucide-react';
import { FadeIn } from '@/components/motion/fade-in';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { DashboardSection, RowsSkeleton, SectionError } from '@/components/dashboard/section';
import { AccountsList, UpcomingList } from '@/components/dashboard/side-lists';
import { SpendingPanel } from '@/components/dashboard/spending-panel';
import { TransactionRow } from '@/components/transactions/transaction-row';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  accountsQuery,
  categoryAnalyticsQuery,
  recentTransactionsQuery,
  subscriptionSummaryQuery,
} from '@/lib/api/finance';
import type { CategoryAnalytics } from '@/lib/api/types';
import { formatMoney, monthName } from '@/lib/format';

function greeting(hour: number): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const UPCOMING_DAYS = 30;

export default function DashboardPage() {
  // Four independent requests, fired in parallel; each section handles its own state.
  const analytics = useQuery(categoryAnalyticsQuery);
  const recent = useQuery(recentTransactionsQuery(6));
  const summary = useQuery(subscriptionSummaryQuery(UPCOMING_DAYS));
  const accounts = useQuery(accountsQuery);

  const isEmpty =
    recent.isSuccess && recent.data.length === 0 && accounts.isSuccess && accounts.data.length === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title={greeting(new Date().getHours())}
        description={
          analytics.data
            ? `Here’s ${monthName(analytics.data.period.from)} so far.`
            : 'Here’s this month so far.'
        }
      />

      {isEmpty ? (
        <GettingStarted />
      ) : (
        <>
          <SpendingOverview query={analytics} />

          <div className="grid items-start gap-6 lg:grid-cols-5">
            <DashboardSection
              title="Recent activity"
              href="/transactions"
              hrefLabel="All transactions"
              className="lg:col-span-3"
            >
              {recent.isPending ? (
                <RowsSkeleton rows={6} />
              ) : recent.isError ? (
                <SectionError what="recent activity" onRetry={() => void recent.refetch()} />
              ) : recent.data.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground sm:px-6">
                  Nothing yet. Transactions appear here as your bank’s messages arrive.
                </p>
              ) : (
                <FadeIn>
                  <ul className="divide-y border-t">
                    {recent.data.map((tx, i) => (
                      <TransactionRow key={tx.id} tx={tx} staggerIndex={i} />
                    ))}
                  </ul>
                </FadeIn>
              )}
            </DashboardSection>

            <div className="space-y-6 lg:col-span-2">
              <DashboardSection
                title="Coming up"
                description={
                  summary.data && summary.data.totals.length > 0
                    ? `Subscriptions: ${summary.data.totals
                        .map((t) => `${formatMoney(t.monthly, t.currency)} a month`)
                        .join(', ')}`
                    : `Subscription charges due in the next ${UPCOMING_DAYS} days`
                }
                href="/subscriptions"
                hrefLabel="All"
              >
                {summary.isPending ? (
                  <RowsSkeleton rows={2} />
                ) : summary.isError ? (
                  <SectionError what="upcoming charges" onRetry={() => void summary.refetch()} />
                ) : (
                  <FadeIn>
                    <UpcomingList summary={summary.data} />
                  </FadeIn>
                )}
              </DashboardSection>

              <DashboardSection title="Accounts" href="/accounts" hrefLabel="Manage">
                {accounts.isPending ? (
                  <RowsSkeleton rows={3} />
                ) : accounts.isError ? (
                  <SectionError what="your accounts" onRetry={() => void accounts.refetch()} />
                ) : (
                  <FadeIn>
                    <AccountsList accounts={accounts.data} />
                  </FadeIn>
                )}
              </DashboardSection>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SpendingOverview({ query }: { query: UseQueryResult<CategoryAnalytics> }) {
  if (query.isPending) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Spending</h2>
          <Link
            href="/analytics"
            className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            See analytics
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
        <div className="grid gap-6 md:grid-cols-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-80 rounded-2xl border bg-card p-6">
              <div className="h-4 w-32 rounded bg-muted motion-safe:animate-pulse" />
              <div className="mt-4 h-8 w-48 rounded bg-muted motion-safe:animate-pulse" />
              <div className="mt-8 space-y-4">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="h-6 rounded bg-muted motion-safe:animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (query.isError) {
    return (
      <DashboardSection title="Spending" href="/analytics" hrefLabel="See analytics">
        <SectionError what="your spending summary" onRetry={() => void query.refetch()} />
      </DashboardSection>
    );
  }
  const { currencies, period, previousPeriod } = query.data;
  if (currencies.length === 0) {
    return (
      <FadeIn>
        <DashboardSection
          title="Spending"
          description="Nothing spent yet this month. Enjoy the quiet."
          href="/analytics"
          hrefLabel="See analytics"
        >
          <div className="pb-2" />
        </DashboardSection>
      </FadeIn>
    );
  }
  return (
    <FadeIn>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Spending</h2>
          <Link
            href="/analytics"
            className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            See analytics
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
        <Stagger className={currencies.length > 1 ? 'grid gap-6 md:grid-cols-2' : 'grid gap-6'}>
          {currencies.map((c, i) => (
            <StaggerItem key={c.currency} index={i}>
              <SpendingPanel data={c} periodFrom={period.from} previousFrom={previousPeriod.from} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </FadeIn>
  );
}

// Each step links to the page where it happens. A step without an action is not
// built yet and says so honestly.
const setupSteps: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { href: string; label: string };
}[] = [
  {
    icon: Wallet,
    title: 'Add your accounts',
    body: 'Cards and bank accounts, with the last 4 digits your bank uses in its messages.',
    action: { href: '/accounts', label: 'Add an account' },
  },
  {
    icon: MessageSquareText,
    title: 'Connect your phone',
    body: 'A small forwarder app sends bank SMS here, so spending records itself.',
    action: { href: '/settings', label: 'Connect' },
  },
  {
    icon: FileText,
    title: 'Import a card statement',
    body: 'Fills in what messages missed, like fees and foreign-currency charges in EGP.',
  },
];

/** First run: no accounts and no transactions yet. Teaches what to do next. */
function GettingStarted() {
  return (
    <section aria-labelledby="setup-heading" className="rounded-2xl border bg-card">
      <div className="border-b px-5 py-4 sm:px-6">
        <h2 id="setup-heading" className="font-semibold">
          Let’s get you set up
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Three steps and your spending starts recording itself.
        </p>
      </div>
      <ol className="divide-y">
        {setupSteps.map(({ icon: Icon, title, body, action }, i) => (
          <li key={title} className="flex flex-wrap items-start gap-4 px-5 py-4 sm:flex-nowrap sm:px-6">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"
            >
              <Icon className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                <span className="sr-only">Step {i + 1}: </span>
                {title}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
            </div>
            {action ? (
              <Link
                href={action.href}
                className={cn(buttonVariants({ size: 'sm' }), 'ms-13 h-9 shrink-0 gap-1.5 px-3 sm:ms-0')}
              >
                {action.label}
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            ) : (
              <span className="mt-1 shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Coming soon
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="border-t px-5 py-3 text-sm text-muted-foreground sm:px-6">
        Want to try it right away?{' '}
        <Link href="/transactions" className="font-medium text-accent-foreground underline-offset-4 hover:underline">
          Add a transaction by hand
        </Link>
        .
      </p>
    </section>
  );
}
