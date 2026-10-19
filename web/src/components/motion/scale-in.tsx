'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { DURATION_FEEDBACK, EASE_OUT_QUART } from './motion-tokens';

/**
 * Scales in content from an initial scale (default 0.9) and fades in opacity.
 */
export function ScaleIn({
  children,
  className,
  initialScale = 0.9,
}: {
  children: React.ReactNode;
  className?: string;
  initialScale?: number;
}) {
  return (
    <motion.span
      aria-hidden="true"
      initial={{ scale: initialScale, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: DURATION_FEEDBACK, ease: EASE_OUT_QUART }}
      className={className}
    >
      {children}
    </motion.span>
  );
}
