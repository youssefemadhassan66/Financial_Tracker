'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api/client';
import { toFormErrors } from '@/lib/api/form-errors';
import type { RawMessageView } from '@/lib/api/types';
import { formatInstantDay } from '@/lib/format';

/**
 * Two "half a transfer" messages the user says belong together. The server
 * needs to know which one is money leaving (the debit) and which is the
 * payment arriving (API.md 9, Manual pair).
 */
export function PairPanel({
  messages,
  onDone,
  onCancel,
}: {
  messages: [RawMessageView, RawMessageView];
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [debitId, setDebitId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const pair = async () => {
    if (!debitId) {
      setError('Choose which message is the money leaving.');
      return;
    }
    const paymentId = messages.find((m) => m.id !== debitId)!.id;
    setPending(true);
    setError(null);
    try {
      await apiFetch('/api/sms/pair', { method: 'POST', body: { debitMessageId: debitId, paymentMessageId: paymentId } });
      await Promise.all(
        ['sms', 'transactions', 'analytics', 'accounts'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
      toast.success('Paired as one transfer');
      onDone();
    } catch (err) {
      setError(toFormErrors(err, []).general);
    } finally {
      setPending(false);
    }
  };

  return (
    <div role="group" aria-labelledby="pair-title" className="space-y-3 rounded-2xl border border-primary/30 bg-accent/40 p-4">
      <p id="pair-title" className="font-medium">
        Pair these two as one transfer
      </p>
      <fieldset className="space-y-2">
        <legend className="text-sm text-muted-foreground">Which message is the money leaving your account?</legend>
        {messages.map((m) => (
          <label
            key={m.id}
            className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card px-3.5 py-2.5 has-[:checked]:border-primary has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
          >
            <input
              type="radio"
              name="pair-debit"
              value={m.id}
              checked={debitId === m.id}
              onChange={() => setDebitId(m.id)}
              className="mt-1"
            />
            <span className="min-w-0 text-sm">
              <span className="font-medium">{m.sender}</span>{' '}
              <span className="text-muted-foreground">· {formatInstantDay(m.receivedAt)}</span>
              <span dir="auto" className="mt-0.5 line-clamp-2 block text-muted-foreground">
                {m.body}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-[0.8rem] text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={() => void pair()} disabled={pending} className="h-9">
          {pending && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
          Pair them
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending} className="h-9">
          Cancel
        </Button>
      </div>
    </div>
  );
}
