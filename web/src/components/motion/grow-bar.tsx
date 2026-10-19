'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { DURATION_BAR, EASE_OUT_QUART } from './motion-tokens';

export interface GrowBarProps {
  share: number;
  className?: string;
  /** Fill color; the chart's first color by default. */
  fillClassName?: string;
  delay?: number;
}

/**
 * Progress bar where the track remains static and the fill scales from inline-start.
 */
export function GrowBar({ share, className, fillClassName = 'bg-chart-1', delay = 0 }: GrowBarProps) {
  // A tiny non-zero share still gets a visible sliver (1.5%); zero stays empty.
  const clamped = Math.min(Math.max(share, 0), 100);
  const targetScale = (clamped > 0 ? Math.max(clamped, 1.5) : 0) / 100;

  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)} aria-hidden="true">
      <motion.div
        className={cn('h-full w-full origin-left rounded-full rtl:origin-right', fillClassName)}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: targetScale }}
        transition={{
          duration: DURATION_BAR,
          ease: EASE_OUT_QUART,
          delay,
        }}
      />
    </div>
  );
}
