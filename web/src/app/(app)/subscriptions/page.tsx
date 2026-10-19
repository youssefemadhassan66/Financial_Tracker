'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardSection, RowsSkeleton, SectionError } from '@/components/dashboard/section';
import { EmptyState } from '@/components/empty-state';
import { FadeIn } from '@/components/motion/fade-in';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { PageHeader } from '@/components/page-header';
import { AddSubscriptionSheet } from '@/components/subscriptions/add-subscription-sheet';
import { SubscriptionRow } from '@/components/subscriptions/subscription-row';
import { SuggestionCard } from '@/components/subscriptions/suggestion-card';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import {
  subscriptionsQuery,
  subscriptionSuggestionsQuery,
  subscriptionSummaryQuery,
} from '@/lib/api/finance';
import type { SubscriptionSummary } from '@/lib/api/types';
import { toCairoDateString } from '@/lib/cairo-date';
import { formatMoney } from '@/lib/format';
import { groupSubscriptions } from '@/lib/subscriptions';

export default function SubscriptionsPage() {
  const list = useQuery(subscriptionsQuery);
  const summary = useQuery(subscriptionSummaryQuery(30));
  const suggestions = useQuery(subscriptionSuggestionsQuery);
  const [addOpen, setAddOpen] = React.useState(false);
  const [showCancelled, setShowCancelled] = React.useState(false);
  const today = toCairoDateString(new Date());

  const groups = list.data ? groupSubscriptions(list.data) : null;
  const hasAny = (list.data?.length ?? 0) > 0;

  const addButton = (
    <Button onClick={() => setAddOpen(true)} className="h-10 gap-1.5">
      <Plus aria-hidden="true" />
      Add subscription
    </Button>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Your"
        titleAccent="subscriptions"
        description="What repeats, what it costs, and when it’s due next."
        actions={hasAny ? addButton : undefined}
      />

      {summary.data && summary.data.totals.length > 0 && <TotalsHero summary={summary.data} />}

      {suggestions.data && suggestions.data.length > 0 && (
        <section aria-labelledby="suggestions-heading" className="space-y-3">
          <h2 id="suggestions-heading" className="font-semibold">
            Spotted in your charges
          </h2>
          <Stagger className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {suggestions.data.map((s, i) => (
              <StaggerItem key={s.merchantKey} index={i}>
                <SuggestionCard suggestion={s} />
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      {list.isPending ? (
        <div className="rounded-2xl border bg-card pt-5">
          <RowsSkeleton rows={3} />
        </div>
      ) : list.isError ? (
        <div className="rounded-2xl border bg-card pt-5">
          <SectionError what="your subscriptions" onRetry={() => void list.refetch()} />
        </div>
      ) : !hasAny || !groups ? (
        <EmptyState icon={Repeat} title="Track what repeats" action={addButton}>
          Add a subscription, or wait: repeating charges from your SMS and statements show up above as suggestions.
        </EmptyState>
      ) : (
        <FadeIn className="space-y-6">
          {groups.active.length > 0 && (
            <DashboardSection title="Active" description={`${groups.active.length} running`}>
              <ul className="divide-y border-t">
                {groups.active.map((s) => (
                  <li key={s.id}>
                    <SubscriptionRow sub={s} today={today} />
                  </li>
                ))}
              </ul>
            </DashboardSection>
          )}
          {groups.paused.length > 0 && (
            <DashboardSection title="Paused">
              <ul className="divide-y border-t">
                {groups.paused.map((s) => (
                  <li key={s.id}>
                    <SubscriptionRow sub={s} today={today} />
                  </li>
                ))}
              </ul>
            </DashboardSection>
          )}
          {groups.cancelled.length > 0 && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={showCancelled}
                onClick={() => setShowCancelled((v) => !v)}
              >
                {showCancelled ? 'Hide' : 'Show'} {groups.cancelled.length} cancelled
              </Button>
              {showCancelled && (
                <DashboardSection title="Cancelled" className="mt-3">
                  <ul className="divide-y border-t">
                    {groups.cancelled.map((s) => (
                      <li key={s.id}>
                        <SubscriptionRow sub={s} today={today} />
                      </li>
                    ))}
                  </ul>
                </DashboardSection>
              )}
            </div>
          )}
        </FadeIn>
      )}

      <AddSubscriptionSheet open={addOpen} onOpenChange={setAddOpen} onCreated={(s) => toast.success(`Tracking ${s.name}`)} />
    </div>
  );
}

/** The big number: what subscriptions cost per month or per year, per currency (never added together). */
function TotalsHero({ summary }: { summary: SubscriptionSummary }) {
  const [period, setPeriod] = React.useState<'monthly' | 'yearly'>('monthly');
  return (
    <section aria-labelledby="subs-total" className="rounded-3xl border bg-card p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="subs-total" className="text-sm font-medium text-muted-foreground">
          {period === 'monthly' ? 'Per month' : 'Per year'} · {summary.activeCount} active
        </h2>
        <Segmented
          label="Show cost per"
          options={[
            { value: 'monthly', label: 'Month' },
            { value: 'yearly', label: 'Year' },
          ]}
          value={period}
          onChange={setPeriod}
          size="sm"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
        {summary.totals.map((t) => (
          <p key={t.currency} className="text-[2.4rem] leading-tight font-semibold tracking-tight tabular-nums">
            {formatMoney(period === 'monthly' ? t.monthly : t.yearly, t.currency)}
          </p>
        ))}
      </div>
      {summary.upcoming.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          {summary.upcoming.length} {summary.upcoming.length === 1 ? 'charge' : 'charges'} in the next 30 days.
        </p>
      )}
    </section>
  );
}
