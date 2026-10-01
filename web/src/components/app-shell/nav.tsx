'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ArrowLeftRight,
  ChartColumn,
  LayoutDashboard,
  MessageSquareText,
  Repeat,
  Settings,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { DURATION_FEEDBACK, EASE_OUT_QUART } from '@/components/motion/motion-tokens';
import { cn } from '@/lib/utils';

export const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/analytics', label: 'Analytics', icon: ChartColumn },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/subscriptions', label: 'Subscriptions', icon: Repeat },
  { href: '/sms', label: 'SMS inbox', icon: MessageSquareText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

/** "/accounts/123" still highlights "Accounts"; "/" only matches itself. */
export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
              'outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50',
              active
                ? 'text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
            )}
          >
            {active && (
              <motion.div
                layoutId="sidebar-active-indicator"
                className="absolute inset-0 rounded-lg bg-sidebar-accent"
                transition={{ duration: DURATION_FEEDBACK, ease: EASE_OUT_QUART }}
              />
            )}
            <Icon aria-hidden="true" className="relative z-10 size-4 shrink-0" />
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone nav: one scrollable row of pills under the top bar. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors',
              'outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'border-transparent text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {active && (
              <motion.div
                layoutId="mobile-active-indicator"
                className="absolute inset-0 rounded-full bg-primary"
                transition={{ duration: DURATION_FEEDBACK, ease: EASE_OUT_QUART }}
              />
            )}
            <Icon aria-hidden="true" className="relative z-10 size-4" />
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
