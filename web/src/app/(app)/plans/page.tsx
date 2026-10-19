'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Plus, Target } from 'lucide-react';
import { RowsSkeleton, SectionError } from '@/components/dashboard/section';
import { EmptyState } from '@/components/empty-state';
import { FadeIn } from '@/components/motion/fade-in';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { PageHeader } from '@/components/page-header';
import { AddBudgetSheet } from '@/components/plans/add-budget-sheet';
import { AddInstallmentSheet } from '@/components/plans/add-installment-sheet';
import { BudgetCard } from '@/components/plans/budget-card';
import { InstallmentRow } from '@/components/plans/installment-row';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { budgetsQuery, installmentsQuery } from '@/lib/api/finance';
import { toCairoDateString } from '@/lib/cairo-date';
import { formatMoney, monthName } from '@/lib/format';

type Tab = 'budgets' | 'installments';

function PlansContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'installments' ? 'installments' : 'budgets';
  const setTab = (t: Tab) => router.replace(t === 'budgets' ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  return (
    <div className="space-y-6">
      <PageHeader title="Your" titleAccent="plans" description="Monthly budgets, and what you are still paying off." />
      <Segmented
        label="Show"
        options={[
          { value: 'budgets', label: 'Budgets' },
          { value: 'installments', label: 'Installments' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'budgets' ? <BudgetsTab /> : <InstallmentsTab />}
    </div>
  );
}

function BudgetsTab() {
  const q = useQuery(budgetsQuery());
  const [addOpen, setAddOpen] = React.useState(false);
  const budgeted = React.useMemo(() => new Set((q.data?.budgets ?? []).map((b) => b.categoryId)), [q.data]);
  const addButton = (
    <Button onClick={() => setAddOpen(true)} className="h-10 gap-1.5">
      <Plus aria-hidden="true" />
      Add a budget
    </Button>
  );

  return (
    <>
      {q.isPending ? (
        <div className="rounded-2xl border bg-card pt-5">
          <RowsSkeleton rows={3} />
        </div>
      ) : q.isError ? (
        <div className="rounded-2xl border bg-card pt-5">
          <SectionError what="your budgets" onRetry={() => void q.refetch()} />
        </div>
      ) : q.data.budgets.length === 0 ? (
        <EmptyState icon={Target} title="Give your spending a ceiling" action={addButton}>
          Pick a category, set a monthly limit, and see how much is left as your bank SMS arrive.
        </EmptyState>
      ) : (
        <FadeIn className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {monthName(q.data.period.from)}: {q.data.daysLeft} {q.data.daysLeft === 1 ? 'day' : 'days'} left
            </p>
            {addButton}
          </div>
          <Stagger className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {q.data.budgets.map((b, i) => (
              <StaggerItem key={b.categoryId} index={i}>
                <BudgetCard budget={b} editable />
              </StaggerItem>
            ))}
          </Stagger>
        </FadeIn>
      )}
      <AddBudgetSheet open={addOpen} onOpenChange={setAddOpen} budgetedCategoryIds={budgeted} />
    </>
  );
}

function InstallmentsTab() {
  const q = useQuery(installmentsQuery);
  const [addOpen, setAddOpen] = React.useState(false);
  const [showPast, setShowPast] = React.useState(false);
  const today = toCairoDateString(new Date());
  const addButton = (
    <Button onClick={() => setAddOpen(true)} className="h-10 gap-1.5">
      <Plus aria-hidden="true" />
      Add a plan
    </Button>
  );

  const active = q.data?.plans.filter((p) => p.status === 'active') ?? [];
  const past = q.data?.plans.filter((p) => p.status !== 'active') ?? [];

  return (
    <>
      {q.isPending ? (
        <div className="rounded-2xl border bg-card pt-5">
          <RowsSkeleton rows={3} />
        </div>
      ) : q.isError ? (
        <div className="rounded-2xl border bg-card pt-5">
          <SectionError what="your installments" onRetry={() => void q.refetch()} />
        </div>
      ) : q.data.plans.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Track what you pay off monthly" action={addButton}>
          valU, Halan, Souhoola or a bank plan: see how many payments are left and when the next one is due.
        </EmptyState>
      ) : (
        <FadeIn className="space-y-5">
          {q.data.totals.length > 0 && (
            <section aria-labelledby="inst-total" className="rounded-3xl border bg-card p-5 sm:p-7">
              <h2 id="inst-total" className="text-sm font-medium text-muted-foreground">
                Each month · {active.length} active
              </h2>
              <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
                {q.data.totals.map((t) => (
                  <div key={t.currency}>
                    <p className="text-[2.4rem] leading-tight font-semibold tracking-tight tabular-nums">
                      {formatMoney(t.monthly, t.currency)}
                    </p>
                    <p className="text-sm text-muted-foreground">{formatMoney(t.remaining, t.currency)} left to pay</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          <div className="flex justify-end">{addButton}</div>
          {active.length > 0 && (
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card" aria-label="Active plans">
              {active.map((p) => (
                <li key={p.id}>
                  <InstallmentRow plan={p} today={today} />
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <div>
              <Button variant="ghost" size="sm" aria-expanded={showPast} onClick={() => setShowPast((v) => !v)}>
                {showPast ? 'Hide' : 'Show'} {past.length} finished or removed
              </Button>
              {showPast && (
                <ul className="mt-3 divide-y overflow-hidden rounded-2xl border bg-card" aria-label="Finished or removed plans">
                  {past.map((p) => (
                    <li key={p.id}>
                      <InstallmentRow plan={p} today={today} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </FadeIn>
      )}
      <AddInstallmentSheet open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

export default function PlansPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <React.Suspense fallback={null}>
      <PlansContent />
    </React.Suspense>
  );
}
