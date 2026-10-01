'use client';

import * as React from 'react';
import { MotionConfig } from 'motion/react';

/**
 * Provides global motion configuration, honoring the user's reduced-motion preference.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
