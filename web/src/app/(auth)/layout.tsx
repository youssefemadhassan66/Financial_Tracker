'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, MessageSquareText, Repeat } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { useAuth } from '@/providers/auth-provider';

const steps = [
  {
    icon: MessageSquareText,
    title: 'Bank SMS become transactions',
    body: 'Your phone forwards bank messages; each one is read and filed for you.',
  },
  {
    icon: FileText,
    title: 'Statements fill the gaps',
    body: 'Upload a card statement and anything a message missed is added.',
  },
  {
    icon: Repeat,
    title: 'Subscriptions spot themselves',
    body: 'Repeating charges are found, with a heads-up when a price changes.',
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  // Already signed in (e.g. a saved session restored on load): skip the form.
  React.useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-sidebar px-12 py-10 lg:flex xl:px-16">
        <Link href="/" aria-label="Finance home" className="self-start rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Logo />
        </Link>
        <div className="max-w-md">
          <h2 className="font-heading text-[2.1rem] leading-[1.15] font-semibold tracking-tight text-balance">
            Know where your money goes, without typing a single expense.
          </h2>
          <Stagger as="ul" className="mt-10 space-y-7">
            {steps.map(({ icon: Icon, title, body }, i) => (
              <StaggerItem as="li" key={title} index={i} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"
                >
                  <Icon className="size-4.5" />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
        <p className="text-sm text-muted-foreground">EGP and USD are always kept apart, never added together.</p>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-8 lg:justify-center lg:py-10">
        <Link href="/" aria-label="Finance home" className="self-start rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10 lg:flex-none lg:py-0">
          {children}
        </div>
      </main>
    </div>
  );
}
