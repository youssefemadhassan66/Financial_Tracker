'use client';

import * as React from 'react';
import { FadeIn } from '@/components/motion/fade-in';

export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <FadeIn>{children}</FadeIn>;
}
