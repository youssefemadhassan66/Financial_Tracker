'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { DURATION_BAR, EASE_OUT_QUART } from './motion-tokens';

export interface GrowBarProps {
  share: number;
  className?: string;
  delay?: number;
}

/**
 * Progress bar where the track remains static and the fill scales from inline-start.
 */
export function GrowBar({ share, className, delay = 0 }: GrowBarProps) {
  // A tiny non-zero share still gets a visible sliver (1.5%); zero stays empty.
  const clamped = Math.min(Math.max(share, 0), 100);
  const targetScale = (clamped > 0 ? Math.max(clamped, 1.5) : 0) / 100;

  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)} aria-hidden="true">
      <motion.div
        className="h-full w-full rounded-full bg-chart-1 origin-left rtl:origin-right"
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
