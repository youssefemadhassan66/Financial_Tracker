'use client';

import * as React from 'react';
import { motionElements, type MotionElementTag } from './motion-elements';
import { DURATION_PANEL, EASE_OUT_QUART } from './motion-tokens';

export interface FadeInProps {
  children?: React.ReactNode;
  delay?: number;
  as?: MotionElementTag;
  className?: string;
}

/**
 * Fades and translates content upwards into view (opacity 0->1, y 8px->0).
 */
export function FadeIn({
  children,
  delay = 0,
  as = 'div',
  className,
}: FadeInProps) {
  const Component = motionElements[as] ?? motionElements.div;

  return (
    <Component
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
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
