'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

/**
 * Say-style pill tabs: a white track with the selected option as an ink
 * (near-black) pill. A radio group underneath: one Tab stop, arrow keys move
 * the selection, like native radios.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'default',
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: 'default' | 'sm';
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    // In RTL, ArrowRight moves backwards visually.
    const rtl = (e.currentTarget as HTMLElement).closest('[dir="rtl"]') !== null;
    const horizontal = e.key === 'ArrowRight' || e.key === 'ArrowLeft';
    const step = horizontal && rtl ? -dir : dir;
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      // One line that scrolls sideways on narrow screens, never a wrapped two-line pill.
      className={cn(
        'inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border bg-card p-1 shadow-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'shrink-0 rounded-full font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              size === 'sm' ? 'px-3 py-1 text-[0.8rem]' : 'px-3.5 py-1.5 text-sm',
              selected ? 'bg-ink text-ink-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
