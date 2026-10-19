'use client';

import * as React from 'react';
import { LoaderCircle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { User } from '@/lib/api/types';

function initial(email: string): string {
  return email.trim().charAt(0).toUpperCase() || '?';
}

function useLogout(logout: () => Promise<void>) {
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(() => {
    setPending(true);
    void logout().finally(() => setPending(false));
  }, [logout]);
  return { pending, run };
}

/** Bottom of the sidebar: who is signed in, and the way out. */
export function SidebarUser({ user, logout }: { user: User; logout: () => Promise<void> }) {
  const { pending, run } = useLogout(logout);
  return (
    <div className="flex items-center gap-3 rounded-xl p-2">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
      >
        {initial(user.email)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={user.email}>
          {user.email}
        </p>
        <p className="text-xs text-muted-foreground">Main currency {user.defaultCurrency}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={run} disabled={pending} aria-label="Log out" title="Log out">
        {pending ? <LoaderCircle className="motion-safe:animate-spin" /> : <LogOut />}
      </Button>
    </div>
  );
}
