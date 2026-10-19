'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { AppShellSkeleton } from '@/components/app-shell/app-shell-skeleton';
import { MobileTabBar, SidebarNav } from '@/components/app-shell/nav';
import { SidebarUser } from '@/components/app-shell/user-menu';
import { useAuth } from '@/providers/auth-provider';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, user, logout } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'loading') return <AppShellSkeleton />;
  if (status === 'unauthenticated' || !user) return null;

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e bg-sidebar px-3 py-5 md:flex">
        <Link href="/dashboard" className="mb-8 rounded-lg px-2 outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50">
          <Logo />
        </Link>
        <SidebarNav />
        <div className="mt-auto border-t pt-3">
          <SidebarUser user={user} logout={logout} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-sm md:hidden">
          <div className="flex h-14 items-center justify-between">
            <Link href="/dashboard" aria-label="Finance, go to dashboard" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Logo />
            </Link>
            <Link
              href="/settings"
              aria-label={`Settings for ${user.email}`}
              className="grid size-9 place-items-center rounded-full bg-ink text-sm font-semibold text-ink-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {user.email.trim().charAt(0).toUpperCase() || "?"}
            </Link>
          </div>
        </header>

        {/* Bottom padding on phones keeps the last row clear of the tab bar. */}
        <main id="main" tabIndex={-1} className="flex-1 px-4 pt-2 pb-28 outline-none sm:px-6 md:px-10 md:py-10">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>

      <MobileTabBar user={user} logout={logout} />
    </div>
  );
}
