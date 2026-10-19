'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/** Header actions: "Log in / Get started" for visitors, "Open dashboard" when signed in. */
export function HeaderActions() {
  const { status } = useAuth();
  if (status === 'authenticated') {
    return (
      <Link href="/dashboard" className={cn(buttonVariants(), 'h-9 px-3.5')}>
        Open dashboard
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Link href="/login" className={cn(buttonVariants({ variant: 'ghost' }), 'h-9 px-3')}>
        Log in
      </Link>
      <Link href="/register" className={cn(buttonVariants(), 'h-9 px-3.5')}>
        Get started
      </Link>
    </div>
  );
}

/** The main call to action. `tone="ink"` is for use on the honey band. */
export function PrimaryCta({ tone = 'honey' }: { tone?: 'honey' | 'ink' }) {
  const { status } = useAuth();
  const signedIn = status === 'authenticated';
  return (
    <Link
      href={signedIn ? '/dashboard' : '/register'}
      className={cn(
        buttonVariants({ size: 'lg' }),
        'h-12 gap-2 rounded-xl px-5 text-base',
        tone === 'ink' && 'bg-foreground text-background hover:bg-foreground/85',
      )}
    >
      {signedIn ? 'Open your dashboard' : 'Create your free account'}
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}
