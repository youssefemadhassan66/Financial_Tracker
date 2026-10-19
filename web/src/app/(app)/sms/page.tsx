'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, MessageSquareText, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { RowsSkeleton, SectionError } from '@/components/dashboard/section';
import { EmptyState } from '@/components/empty-state';
import { LiveRegion } from '@/components/live-region';
import { FadeIn } from '@/components/motion/fade-in';
import { PageHeader } from '@/components/page-header';
import { MessageRow } from '@/components/sms/message-row';
import { PairPanel } from '@/components/sms/pair-panel';
import { Button, buttonVariants } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { apiFetch } from '@/lib/api/client';
import { smsQuery } from '@/lib/api/finance';
import { toFormErrors } from '@/lib/api/form-errors';
import type { RawMessageView, ReprocessResult } from '@/lib/api/types';
import { countByFilter, matchesFilter, reprocessAll, type ReprocessTotals, type SmsFilter } from '@/lib/sms';
import { cn } from '@/lib/utils';

const FILTERS: { value: SmsFilter; label: string }[] = [
  { value: 'attention', label: 'Needs you' },
  { value: 'all', label: 'All' },
  { value: 'parsed', label: 'Transactions' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'ignored', label: 'Ignored' },
];

export default function SmsInboxPage() {
  const queryClient = useQueryClient();
  const sms = useQuery(smsQuery);
  const [chosenFilter, setFilter] = React.useState<SmsFilter | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [progress, setProgress] = React.useState<ReprocessTotals | null>(null);
  const [running, setRunning] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState<string | null>(null);

  const messages = React.useMemo(() => sms.data ?? [], [sms.data]);
  const counts = countByFilter(messages);
  // Open on "Needs you" when something does, otherwise on everything.
  const filter: SmsFilter = chosenFilter ?? (counts.attention > 0 ? 'attention' : 'all');
  const visible = messages.filter((m) => matchesFilter(m.status, filter));
  const selectedMessages = selected
    .map((id) => messages.find((m) => m.id === id))
    .filter((m): m is RawMessageView => m !== undefined);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1], id] : [...s, id]));

  const reprocess = async () => {
    setRunning(true);
    setProgress(null);
    try {
      const totals = await reprocessAll(
        (after) => apiFetch<ReprocessResult>('/api/sms/reprocess', { method: 'POST', body: after ? { after } : {} }),
        setProgress,
      );
      await Promise.all(
        ['sms', 'transactions', 'analytics', 'accounts', 'subscriptions'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      const summary =
        totals.processed === 0
          ? 'Nothing left to re-read.'
          : `Re-read ${totals.processed}: ${totals.parsed} became transactions, ${totals.unparsed} still not read.`;
      toast.success(summary);
      setAnnouncement(summary);
    } catch (err) {
      toast.error(toFormErrors(err, []).general ?? 'Couldn’t re-read the messages.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <LiveRegion message={announcement} />
      <PageHeader
        title="SMS"
        titleAccent="inbox"
        description="What your phone sent, what became a transaction, and the few that need you."
        actions={
          messages.length > 0 ? (
            <Button variant="outline" onClick={() => void reprocess()} disabled={running} className="h-10 gap-1.5">
              {running ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : <RotateCw aria-hidden="true" />}
              {running && progress ? `Re-reading… ${progress.processed}` : 'Re-read messages'}
            </Button>
          ) : undefined
        }
      />

      {sms.isPending ? (
        <div className="rounded-2xl border bg-card pt-5">
          <RowsSkeleton rows={4} />
        </div>
      ) : sms.isError ? (
        <div className="rounded-2xl border bg-card pt-5">
          <SectionError what="your messages" onRetry={() => void sms.refetch()} />
        </div>
      ) : messages.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No bank messages yet"
          action={
            <Link href="/settings" className={cn(buttonVariants(), 'h-10')}>
              Connect your phone
            </Link>
          }
        >
          Once your phone is connected, every SMS from your bank shows up here, and most become transactions on their own.
        </EmptyState>
      ) : (
        <FadeIn className="space-y-4">
          <Segmented
            label="Show"
            size="sm"
            options={FILTERS.map((f) => ({ value: f.value, label: `${f.label} ${counts[f.value]}` }))}
            value={filter}
            onChange={(f) => {
              setFilter(f);
              setSelected([]);
            }}
          />

          {filter === 'attention' && visible.some((m) => m.status === 'awaiting_pair') && (
            <p className="text-sm text-muted-foreground">
              To pair a transfer, tick its two halves: the money leaving one account and arriving in the other.
            </p>
          )}

          {selectedMessages.length === 2 && (
            <PairPanel
              messages={[selectedMessages[0], selectedMessages[1]]}
              onDone={() => setSelected([])}
              onCancel={() => setSelected([])}
            />
          )}

          {visible.length === 0 ? (
            <p className="rounded-2xl border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
              {filter === 'attention' ? 'Nothing needs you. Every message is handled.' : 'No messages here.'}
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card" aria-label="Messages">
              {visible.map((m) => (
                <li key={m.id}>
                  <MessageRow
                    message={m}
                    selectable={m.status === 'awaiting_pair'}
                    selected={selected.includes(m.id)}
                    onToggle={() => toggle(m.id)}
                  />
                </li>
              ))}
            </ul>
          )}
          {messages.length >= 200 && (
            <p className="text-center text-xs text-muted-foreground">Showing your newest 200 messages.</p>
          )}
        </FadeIn>
      )}
    </div>
  );
}
