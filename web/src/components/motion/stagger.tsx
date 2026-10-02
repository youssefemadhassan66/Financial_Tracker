'use client';

import * as React from 'react';
import type { Variants } from 'motion/react';
import { motionElements, type MotionElementTag } from './motion-elements';
import {
  DURATION_FEEDBACK,
  EASE_OUT_QUART,
  STAGGER_DELAY,
  STAGGER_MAX_INDEX,
} from './motion-tokens';

// The container only propagates "hidden" -> "visible" to its items. It does
// not fade itself and adds no staggerChildren: each item already carries its
// own capped delay, and motion would add the two together.
export const staggerContainerVariants: Variants = {
  hidden: {},
  visible: {},
};

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: (index?: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATION_FEEDBACK,
      ease: EASE_OUT_QUART,
      ...(typeof index === 'number'
        ? { delay: Math.min(index, STAGGER_MAX_INDEX) * STAGGER_DELAY }
        : {}),
    },
  }),
};

export interface StaggerProps {
  children?: React.ReactNode;
  className?: string;
  as?: MotionElementTag;
}

export interface StaggerItemProps {
  children?: React.ReactNode;
  className?: string;
  index?: number;
  as?: MotionElementTag;
}

/**
 * Container and item components orchestrating a 40ms stagger capped after the 8th item.
 */
export function Stagger({
  children,
  className,
  as = 'div',
}: StaggerProps) {
  const Component = motionElements[as] ?? motionElements.div;
  let itemIndex = 0;

  const childrenWithIndex = React.Children.map(children, (child) => {
    if (React.isValidElement(child) && (child.type === StaggerItem || (child.type as { displayName?: string })?.displayName === 'StaggerItem')) {
      const currentProps = child.props as StaggerItemProps;
      const idx = currentProps.index ?? itemIndex++;
      return React.cloneElement(child, { index: idx } as React.Attributes & { index: number });
    }
    return child;
  });

  return (
    <Component
      initial="hidden"
      animate="visible"
      className={className}
      variants={staggerContainerVariants}
    >
      {childrenWithIndex}
    </Component>
  );
}

export function StaggerItem({
  children,
  className,
  index,
  as = 'div',
}: StaggerItemProps) {
  const Component = motionElements[as] ?? motionElements.div;

  return (
    <Component
      custom={index}
      variants={staggerItemVariants}
      className={className}
    >
      {children}
    </Component>
  );
}
StaggerItem.displayName = 'StaggerItem';
