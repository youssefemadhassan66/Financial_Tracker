'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { GrowBar } from '@/components/motion/grow-bar';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api/client';
import { toFormErrors } from '@/lib/api/form-errors';
import type { InstallmentPlanDto } from '@/lib/api/types';
import { formatCalendarDay, formatMoney } from '@/lib/format';
import { dueSoonLabel } from '@/lib/subscriptions';
import { cn } from '@/lib/utils';

/** One plan: "3 of 6 paid", a bar, the next payment and what is left. */
export function InstallmentRow({ plan, today }: { plan: InstallmentPlanDto; today: string }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const cancel = async () => {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/installments/${encodeURIComponent(plan.id)}/cancel`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['installments'] });
      toast.success(`Removed ${plan.name} from your plans`);
    } catch (err) {
      setError(toFormErrors(err, []).general);
      setPending(false);
    }
  };

  const share = (plan.paidInstallments / plan.totalInstallments) * 100;
  const soon = plan.nextDueDate ? dueSoonLabel(plan.nextDueDate, today) : null;
  const next =
    plan.status === 'completed'
      ? `Paid off on ${formatCalendarDay(plan.endDate)}`
      : plan.status === 'cancelled'
        ? 'Removed'
        : plan.nextDueDate
          ? `Next ${formatMoney(plan.installmentAmount, plan.currency)} ${soon ?? `on ${formatCalendarDay(plan.nextDueDate)}`}`
          : '';

  return (
    <div className={cn('px-5 py-4 sm:px-6', plan.status !== 'active' && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold">{plan.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {[plan.provider, `${plan.paidInstallments} of ${plan.totalInstallments} paid`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className="font-semibold tabular-nums">{formatMoney(plan.remainingAmount, plan.currency)}</p>
          <p className="text-xs text-muted-foreground">left of {formatMoney(plan.totalCost, plan.currency)}</p>
        </div>
      </div>
      <GrowBar share={share} className="mt-3 h-2" fillClassName="bg-primary" />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{next}</p>
        {plan.status === 'active' && !confirm && (
          <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
            Remove
          </Button>
        )}
      </div>
      {confirm && (
        <div role="group" aria-label={`Remove ${plan.name}`} className="mt-2 rounded-lg border bg-muted/40 px-3.5 py-3">
          <p className="text-sm">
            Remove {plan.name}? Use this when the plan ended early or was added by mistake. It can&apos;t be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => void cancel()} disabled={pending}>
              {pending && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
              Remove it
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)} disabled={pending}>
              Keep it
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[0.8rem] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
