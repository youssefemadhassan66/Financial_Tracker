'use client';

import * as React from 'react';
import { motionElements, type MotionElementTag } from './motion-elements';
import { DURATION_PANEL, EASE_OUT_QUART } from './motion-tokens';

export interface RevealProps {
  children?: React.ReactNode;
  delay?: number;
  as?: MotionElementTag;
  className?: string;
}

/**
 * Scroll-triggered entrance animation that fires once when 30% of the element enters view.
 */
export function Reveal({
  children,
  delay = 0,
  as = 'div',
  className,
}: RevealProps) {
  const Component = motionElements[as] ?? motionElements.div;

  return (
    <Component
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{
        duration: DURATION_PANEL,
        ease: EASE_OUT_QUART,
        delay,
      }}
      className={className}
    >
      {children}
    </Component>
  );
}
