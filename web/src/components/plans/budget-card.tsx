'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { GrowBar } from '@/components/motion/grow-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api/client';
import { toFormErrors } from '@/lib/api/form-errors';
import type { BudgetDto } from '@/lib/api/types';
import { formatMoney } from '@/lib/format';
import { parseAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * One category's budget: spent of limit, a bar, and a plain sentence.
 * Over the limit is said calmly (PRODUCT.md: no budget-shaming red).
 */
export function BudgetCard({ budget, editable }: { budget: BudgetDto; editable: boolean }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = React.useState<'view' | 'edit' | 'stop'>('view');
  const [limit, setLimit] = React.useState(budget.limit);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputId = `budget-limit-${budget.categoryId}`;

  const over = budget.state === 'over';
  const remainingAbs = budget.remaining.startsWith('-') ? budget.remaining.slice(1) : budget.remaining;
  const sentence = over
    ? `Over by ${formatMoney(remainingAbs, budget.currency)}`
    : `${formatMoney(budget.remaining, budget.currency)} left`;

  const done = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: ['budgets'] });
    toast.success(message);
    setMode('view');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseAmount(limit);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/budgets/${encodeURIComponent(budget.categoryId)}`, {
        method: 'PUT',
        body: { currency: budget.currency, limit: parsed.value },
      });
      await done(`${budget.categoryName} budget updated`);
    } catch (err) {
      setError(toFormErrors(err, []).general);
    } finally {
      setPending(false);
    }
  };

  const stop = async () => {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/budgets/${encodeURIComponent(budget.categoryId)}`, { method: 'DELETE' });
      await done(`Stopped the ${budget.categoryName} budget`);
    } catch (err) {
      setError(toFormErrors(err, []).general);
    } finally {
      setPending(false);
    }
  };

  return (
    <article aria-label={`${budget.categoryName} budget`} className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="truncate font-bold">{budget.categoryName}</h3>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            budget.state === 'ok' ? 'bg-accent text-accent-foreground' : 'bg-warning text-warning-foreground',
          )}
        >
          {budget.state === 'ok' ? 'On track' : budget.state === 'near' ? 'Near the limit' : 'Over the limit'}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground tabular-nums">{formatMoney(budget.spent, budget.currency)}</span> of{' '}
        <span className="tabular-nums">{formatMoney(budget.limit, budget.currency)}</span>
      </p>
      <GrowBar
        share={budget.percentUsed}
        className="mt-3 h-2"
        fillClassName={budget.state === 'ok' ? 'bg-primary' : 'bg-warning-foreground'}
      />
      <p className={cn('mt-2 text-sm', over ? 'font-medium text-warning-foreground' : 'text-muted-foreground')}>{sentence}</p>

      {editable && mode === 'view' && (
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setMode('edit')}>
            Change limit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode('stop')}>
            Stop budget
          </Button>
        </div>
      )}
      {mode === 'edit' && (
        <form onSubmit={save} noValidate className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={inputId} className="text-[0.8rem] font-medium">
              Monthly limit ({budget.currency})
            </label>
            <Input
              id={inputId}
              inputMode="decimal"
              autoFocus
              className="mt-1 h-9 font-mono"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              disabled={pending}
            />
          </div>
          <Button type="submit" size="sm" className="h-9" disabled={pending}>
            {pending && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setMode('view')} disabled={pending}>
            Cancel
          </Button>
        </form>
      )}
      {mode === 'stop' && (
        <div role="group" aria-label={`Stop the ${budget.categoryName} budget`} className="mt-3 rounded-lg border bg-muted/40 px-3.5 py-3">
          <p className="text-sm">Stop budgeting {budget.categoryName} from this month? Earlier months keep their budget.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => void stop()} disabled={pending}>
              {pending && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
              Stop it
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode('view')} disabled={pending}>
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
    </article>
  );
}
