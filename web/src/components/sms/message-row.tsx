'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import type { RawMessageView } from '@/lib/api/types';
import { formatInstantDay } from '@/lib/format';
import { SMS_STATUS, type SmsTone } from '@/lib/sms';
import { cn } from '@/lib/utils';

// Status chips never rely on color alone: each one has a word, and only
// "needs you" uses the accent.
const toneClass: Record<SmsTone, string> = {
  done: 'bg-muted text-foreground',
  attention: 'bg-accent text-accent-foreground',
  waiting: 'bg-warning text-warning-foreground',
  quiet: 'bg-muted text-muted-foreground',
};

const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });

/** One bank message: who sent it, when, what happened to it, and the text itself. */
export function MessageRow({
  message,
  selectable,
  selected,
  onToggle,
}: {
  message: RawMessageView;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const meta = SMS_STATUS[message.status];
  const details = message.parsedPayload ? Object.entries(message.parsedPayload) : [];
  const checkboxId = `pair-${message.id}`;

  return (
    <div className="flex gap-3 px-5 py-4 sm:px-6">
      {selectable && (
        <div className="pt-0.5">
          <input
            id={checkboxId}
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select the ${message.sender} message from ${formatInstantDay(message.receivedAt)} for pairing`}
            className="size-4 rounded border-input focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-medium">{message.sender}</p>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', toneClass[meta.tone])}>{meta.label}</span>
          <span className="ms-auto text-xs text-muted-foreground tabular-nums">
            {formatInstantDay(message.receivedAt)} · {timeFmt.format(new Date(message.receivedAt))}
          </span>
        </div>
        <p
          dir="auto"
          className={cn('mt-1.5 text-sm text-pretty break-words text-muted-foreground', !open && 'line-clamp-2')}
        >
          {message.body}
        </p>
        {(message.status !== 'parsed' || open) && (
          <p className="mt-1 text-[0.8rem] text-muted-foreground">
            {message.parseError && message.status !== 'parsed' ? message.parseError : meta.explain}
          </p>
        )}
        {open && details.length > 0 && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-[0.8rem]">
            {details.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-mono break-all">{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1.5 inline-flex items-center gap-1 rounded text-[0.8rem] font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {open ? 'Show less' : 'Show full message'}
          <ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
    </div>
  );
}
