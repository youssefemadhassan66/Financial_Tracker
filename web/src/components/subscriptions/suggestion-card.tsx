'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api/client';
import { toFormErrors } from '@/lib/api/form-errors';
import type { CreateSubscriptionRequest, SubscriptionSuggestion } from '@/lib/api/types';
import { formatCalendarDay, formatMoney } from '@/lib/format';
import { perCycle } from '@/lib/subscriptions';

/**
 * A repeating charge the app spotted. Track it (with a name the user may
 * edit first) or dismiss it for good (API.md 8, Suggestions).
 */
export function SuggestionCard({ suggestion }: { suggestion: SubscriptionSuggestion }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState(suggestion.name);
  const [pending, setPending] = React.useState<'track' | 'dismiss' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputId = `suggestion-${suggestion.merchantKey.replace(/\W+/g, '-')}`;

  const track = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 60) {
      setError('Give it a name of up to 60 characters.');
      return;
    }
    setPending('track');
    setError(null);
    const body: CreateSubscriptionRequest = {
      name: trimmed,
      amount: suggestion.amount,
      currency: suggestion.currency,
      cycle: suggestion.cycle,
      anchorDate: suggestion.anchorDate,
      merchant: suggestion.merchantKey,
      ...(suggestion.accountId !== null ? { accountId: suggestion.accountId } : {}),
    };
    try {
      await apiFetch('/api/subscriptions', { method: 'POST', body });
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      toast.success(`Tracking ${trimmed}`);
    } catch (err) {
      setError(toFormErrors(err, []).general);
      setPending(null);
    }
  };

  const dismiss = async () => {
    setPending('dismiss');
    setError(null);
    try {
      await apiFetch('/api/subscriptions/suggestions/dismiss', {
        method: 'POST',
        body: { merchantKey: suggestion.merchantKey },
      });
      await queryClient.invalidateQueries({ queryKey: ['subscriptions', 'suggestions'] });
    } catch (err) {
      setError(toFormErrors(err, []).general);
      setPending(null);
    }
  };

  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-accent-foreground">
        <Sparkles aria-hidden="true" className="size-3.5" />
        Looks like a subscription
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {formatMoney(suggestion.amount, suggestion.currency)} {perCycle(suggestion.cycle)}, charged {suggestion.chargeCount}{' '}
        times. Last on {formatCalendarDay(suggestion.lastChargeDate)}.
      </p>
      <label htmlFor={inputId} className="mt-3 block text-[0.8rem] font-medium">
        Name
      </label>
      <Input
        id={inputId}
        maxLength={60}
        className="mt-1 h-10"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={pending !== null}
      />
      {error && (
        <p role="alert" className="mt-2 text-[0.8rem] text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => void track()} disabled={pending !== null} className="h-9">
          {pending === 'track' && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
          Track it
        </Button>
        <Button variant="ghost" onClick={() => void dismiss()} disabled={pending !== null} className="h-9">
          {pending === 'dismiss' && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
          Not a subscription
        </Button>
      </div>
    </div>
  );
}
