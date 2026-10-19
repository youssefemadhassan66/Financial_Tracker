'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api/client';
import { toFormErrors } from '@/lib/api/form-errors';
import type { SubscriptionDto } from '@/lib/api/types';
import { formatCalendarDay, formatMoney } from '@/lib/format';
import { dueSoonLabel, perCycle } from '@/lib/subscriptions';
import { cn } from '@/lib/utils';

type Action = 'pause' | 'resume' | 'cancel';

const DONE: Record<Action, string> = { pause: 'Paused', resume: 'Resumed', cancel: 'Cancelled' };

/** One subscription: what it costs, when it's next, warnings, and pause/resume/cancel. */
export function SubscriptionRow({ sub, today }: { sub: SubscriptionDto; today: string }) {
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [pending, setPending] = React.useState<Action | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = async (action: Action) => {
    setPending(action);
    setError(null);
    try {
      await apiFetch(`/api/subscriptions/${encodeURIComponent(sub.id)}/${action}`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      toast.success(`${DONE[action]}: ${sub.name}`);
      setConfirmCancel(false);
    } catch (err) {
      setError(toFormErrors(err, []).general);
    } finally {
      setPending(null);
    }
  };

  const soon = sub.nextChargeDate ? dueSoonLabel(sub.nextChargeDate, today) : null;
  const initial = sub.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className={cn('px-5 py-4 sm:px-6', sub.status === 'cancelled' && 'opacity-60')}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent font-display text-lg text-accent-foreground"
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{sub.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {sub.status === 'active' && sub.nextChargeDate
              ? soon
                ? `Next charge ${soon}`
                : `Next charge ${formatCalendarDay(sub.nextChargeDate)}`
              : sub.status === 'paused'
                ? 'Paused'
                : 'Cancelled'}
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className="font-medium tabular-nums">{formatMoney(sub.amount, sub.currency)}</p>
          <p className="text-xs text-muted-foreground">{perCycle(sub.cycle)}</p>
        </div>
      </div>

      {(sub.priceChanged || sub.missedCharge) && (
        <ul className="mt-3 space-y-1.5 ps-13">
          {sub.priceChanged && sub.lastCharge && (
            <li className="flex items-start gap-1.5 rounded-lg bg-warning px-2.5 py-1.5 text-[0.8rem] text-warning-foreground">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              Last charge was {formatMoney(sub.lastCharge.amount, sub.lastCharge.currency)}, not{' '}
              {formatMoney(sub.amount, sub.currency)}. The price may have changed.
            </li>
          )}
          {sub.missedCharge && (
            <li className="flex items-start gap-1.5 rounded-lg bg-warning px-2.5 py-1.5 text-[0.8rem] text-warning-foreground">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              No charge seen for {formatCalendarDay(sub.missedCharge)}. Was it cancelled or paid another way?
            </li>
          )}
        </ul>
      )}

      {sub.status !== 'cancelled' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 ps-13">
          {!confirmCancel ? (
            <>
              {sub.status === 'active' ? (
                <Button variant="outline" size="sm" onClick={() => void run('pause')} disabled={pending !== null}>
                  {pending === 'pause' && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
                  Pause
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => void run('resume')} disabled={pending !== null}>
                  {pending === 'resume' && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
                  Resume
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(true)} disabled={pending !== null}>
                Cancel subscription
              </Button>
            </>
          ) : (
            <div role="group" aria-label={`Cancel ${sub.name}`} className="w-full rounded-lg border bg-muted/40 px-3.5 py-3">
              <p className="text-sm">Cancel {sub.name}? This is final: you can add it again later if you need to.</p>
              <div className="mt-3 flex gap-2">
                <Button variant="destructive" size="sm" onClick={() => void run('cancel')} disabled={pending !== null}>
                  {pending === 'cancel' && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
                  Cancel it
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)} disabled={pending !== null}>
                  Keep it
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 ps-13 text-[0.8rem] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
