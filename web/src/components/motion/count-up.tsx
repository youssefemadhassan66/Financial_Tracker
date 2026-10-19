'use client';

import * as React from 'react';
import { animate, useReducedMotion } from 'motion/react';
import type { Currency } from '@/lib/api/types';
import { formatMoney } from '@/lib/format';
import { interpolateAmount } from '@/lib/interpolate-amount';
import { cn } from '@/lib/utils';
import { DURATION_COUNT_UP, EASE_OUT_QUART } from './motion-tokens';

export interface CountUpProps {
  amount: string;
  currency: Currency;
  sign?: '+' | '-';
  className?: string;
}

/**
 * Animated money count-up that preserves decimal strings and announces final value to screen readers.
 */
export function CountUp({ amount, currency, sign, className }: CountUpProps) {
  const shouldReduceMotion = useReducedMotion();
  const [displayAmount, setDisplayAmount] = React.useState<string>(() =>
    shouldReduceMotion ? amount : '0'
  );
  // What is on screen right now. Animations start from here, so a cancelled
  // run (React StrictMode runs effects twice in dev) restarts from where it
  // stopped instead of treating the new amount as already reached.
  const shownRef = React.useRef<string>(shouldReduceMotion ? amount : '0');
  const finalFormatted = formatMoney(amount, currency, sign);

  React.useEffect(() => {
    if (shouldReduceMotion) {
      shownRef.current = amount;
      return;
    }

    const from = shownRef.current;
    const to = amount;
    if (from === to) {
      return;
    }

    const controls = animate(0, 1, {
      duration: DURATION_COUNT_UP,
      ease: EASE_OUT_QUART,
      onUpdate: (latest) => {
        const value = interpolateAmount(from, to, latest);
        shownRef.current = value;
        setDisplayAmount(value);
      },
      onComplete: () => {
        shownRef.current = to;
        setDisplayAmount(to);
      },
    });

    return () => controls.stop();
  }, [amount, shouldReduceMotion]);

  const displayFormatted =
    shouldReduceMotion || displayAmount === amount
      ? finalFormatted
      : formatMoney(displayAmount, currency, sign);

  return (
    <span className={cn('inline-block tabular-nums', className)}>
      <span className="sr-only">{finalFormatted}</span>
      <span aria-hidden="true">{displayFormatted}</span>
    </span>
  );
}
