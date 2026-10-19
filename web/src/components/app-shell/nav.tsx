'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ArrowLeftRight,
  ChartColumn,
  ChevronRight,
  Ellipsis,
  House,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MessageSquareText,
  Plus,
  Repeat,
  Settings,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { DURATION_FEEDBACK, EASE_OUT_QUART } from '@/components/motion/motion-tokens';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { User } from '@/lib/api/types';
import { cn } from '@/lib/utils';

// `soon`: the page exists but its feature is not built yet; the tag sets expectations.
export const navItems: { href: string; label: string; icon: LucideIcon; soon?: boolean }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/analytics', label: 'Analytics', icon: ChartColumn },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/subscriptions', label: 'Subscriptions', icon: Repeat },
  { href: '/plans', label: 'Plans', icon: Target },
  { href: '/sms', label: 'SMS inbox', icon: MessageSquareText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

/** "/accounts/123" still highlights "Accounts"; "/" only matches itself. */
export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function SoonTag({ className }: { className?: string }) {
  return (
    <span className={cn('rounded-full bg-muted px-1.5 py-px text-[0.65rem] font-medium text-muted-foreground', className)}>
      Soon
    </span>
  );
}

/** Wide screens: the selected page is an ink pill (Say-style). */
export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {navItems.map(({ href, label, icon: Icon, soon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex h-10 items-center gap-3 rounded-full px-3.5 text-sm font-medium transition-colors',
              'outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50',
              active ? 'text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {active && (
              <motion.div
                layoutId="sidebar-active-indicator"
                className="absolute inset-0 rounded-full bg-sidebar-accent"
                transition={{ duration: DURATION_FEEDBACK, ease: EASE_OUT_QUART }}
              />
            )}
            <Icon aria-hidden="true" className="relative z-10 size-4 shrink-0" />
            <span className="relative z-10">{label}</span>
            {soon && <SoonTag className="relative z-10 ms-auto" />}
          </Link>
        );
      })}
    </nav>
  );
}

const tabs: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/dashboard', label: 'Home', icon: House },
  { href: '/transactions', label: 'Activity', icon: ArrowLeftRight },
  { href: '/analytics', label: 'Insights', icon: ChartColumn },
];

/** Pages reached through More on a phone (everything that is not a tab). */
const moreItems = navItems.filter((i) => !tabs.some((t) => t.href === i.href));

/**
 * Phones: a tab bar at the bottom, in thumb reach. Home, Activity, a big Add
 * button in the middle, Insights and More. It sits above the home indicator
 * (safe-area inset).
 */
export function MobileTabBar({ user, logout }: { user: User; logout: () => Promise<void> }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreActive = moreItems.some((i) => isActive(pathname, i.href));

  const tab = (href: string, label: string, Icon: LucideIcon) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[0.7rem] font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.4 : 2} />
        {label}
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm supports-[backdrop-filter]:bg-card/85 md:hidden"
      >
        <div className="mx-auto flex max-w-md items-end px-2 pt-1.5 pb-1.5">
          {tab(tabs[0].href, tabs[0].label, tabs[0].icon)}
          {tab(tabs[1].href, tabs[1].label, tabs[1].icon)}
          <div className="flex flex-1 justify-center">
            <Link
              href="/transactions?add=1"
              aria-label="Add a transaction"
              className="-mt-5 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background outline-none transition-transform active:scale-95 focus-visible:ring-ring/60"
            >
              <Plus aria-hidden="true" className="size-6" strokeWidth={2.4} />
            </Link>
          </div>
          {tab(tabs[2].href, tabs[2].label, tabs[2].icon)}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[0.7rem] font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              moreActive ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <Ellipsis aria-hidden="true" className="size-5" strokeWidth={moreActive ? 2.4 : 2} />
            More
          </button>
        </div>
      </nav>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} user={user} logout={logout} />
    </>
  );
}

function MoreSheet({
  open,
  onOpenChange,
  user,
  logout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [pending, setPending] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <SheetHeader>
          <SheetTitle>More</SheetTitle>
          <SheetDescription className="truncate">{user.email}</SheetDescription>
        </SheetHeader>
        <ul className="mx-4 divide-y overflow-hidden rounded-2xl border bg-card">
          {moreItems.map(({ href, label, icon: Icon, soon }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => onOpenChange(false)}
                aria-current={isActive(pathname, href) ? 'page' : undefined}
                className="flex h-13 items-center gap-3 px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:bg-muted aria-[current=page]:text-accent-foreground"
              >
                <Icon aria-hidden="true" className="size-4.5 shrink-0 text-muted-foreground" />
                <span className="flex-1">{label}</span>
                {soon && <SoonTag />}
                <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void logout().finally(() => setPending(false));
          }}
          className="mx-4 mt-3 flex h-12 items-center justify-center gap-2 rounded-2xl border bg-card text-sm font-medium text-destructive outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
          ) : (
            <LogOut aria-hidden="true" className="size-4" />
          )}
          Log out
        </button>
      </SheetContent>
    </Sheet>
  );
}
