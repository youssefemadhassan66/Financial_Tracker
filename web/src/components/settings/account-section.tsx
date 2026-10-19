'use client';

import * as React from 'react';
import { LoaderCircle, LogOut } from 'lucide-react';
import { DashboardSection } from '@/components/dashboard/section';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api/client';
import { useAuth } from '@/providers/auth-provider';

export function AccountSection() {
  const { user, logout } = useAuth();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const signOutEverywhere = async () => {
    setPending(true);
    setError(null);
    try {
      await apiFetch('/api/auth/logout-all', { method: 'POST' });
    } catch {
      setError('Couldn’t sign out your other devices. Try again.');
      setPending(false);
      return;
    }
    // Every session is revoked now, this one included; finish locally.
    await logout();
  };

  return (
    <DashboardSection title="Account">
      <dl className="grid gap-x-6 gap-y-3 border-t px-5 py-4 text-sm sm:grid-cols-[10rem_1fr] sm:px-6">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="truncate font-medium">{user?.email}</dd>
        <dt className="text-muted-foreground">Main currency</dt>
        <dd className="font-medium">{user?.defaultCurrency}</dd>
      </dl>

      <div className="border-t px-5 py-4 sm:px-6">
        {!confirming ? (
          <Button variant="outline" onClick={() => setConfirming(true)} className="h-10 gap-1.5">
            <LogOut aria-hidden="true" />
            Sign out of all devices
          </Button>
        ) : (
          <div role="group" aria-label="Sign out of all devices" className="rounded-lg border bg-muted/40 px-3.5 py-3">
            <p className="text-sm">
              Sign out everywhere, including this browser? Connected phones keep sending SMS; revoke them above if needed.
            </p>
            {error && (
              <p role="alert" className="mt-1.5 text-[0.8rem] text-destructive">
                {error}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Button variant="destructive" size="sm" onClick={() => void signOutEverywhere()} disabled={pending}>
                {pending && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
                Sign out everywhere
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                }}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardSection>
  );
}
