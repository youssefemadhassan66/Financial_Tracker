'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Plus, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardSection, RowsSkeleton, SectionError } from '@/components/dashboard/section';
import { FadeIn } from '@/components/motion/fade-in';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api/client';
import { devicesQuery } from '@/lib/api/finance';
import type { DeviceDto } from '@/lib/api/types';
import { relativeCairoDay, sortDevices } from '@/lib/devices';
import { formatInstantDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ConnectPhoneSheet } from './connect-phone-sheet';

export function ConnectedPhones() {
  const devices = useQuery(devicesQuery);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const connectButton = (
    <Button onClick={() => setSheetOpen(true)} className="h-10 gap-1.5">
      <Plus aria-hidden="true" />
      Connect a phone
    </Button>
  );

  return (
    <DashboardSection
      title="Connected phones"
      description="Phones that send your bank’s SMS here. Each one has its own key."
    >
      {devices.isPending ? (
        <RowsSkeleton rows={2} />
      ) : devices.isError ? (
        <SectionError what="your phones" onRetry={() => void devices.refetch()} />
      ) : devices.data.length === 0 ? (
        <FadeIn>
          <div className="flex flex-col items-start gap-4 border-t px-5 py-6 sm:px-6">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"
              >
                <Smartphone className="size-4.5" />
              </span>
              <p className="max-w-prose text-sm text-muted-foreground">
                Connect your phone so your bank’s SMS turn into transactions on their own.
              </p>
            </div>
            {connectButton}
          </div>
        </FadeIn>
      ) : (
        <>
          <Stagger as="ul" className="divide-y border-t">
            {sortDevices(devices.data).map((d, i) => (
              <StaggerItem key={d.id} index={i} as="li">
                <DeviceRow device={d} />
              </StaggerItem>
            ))}
          </Stagger>
          <div className="border-t px-5 py-4 sm:px-6">{connectButton}</div>
        </>
      )}

      <ConnectPhoneSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </DashboardSection>
  );
}

function DeviceRow({ device }: { device: DeviceDto }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const revoke = async () => {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/devices/${encodeURIComponent(device.id)}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Phone revoked');
    } catch {
      setError('Couldn’t revoke this phone. Try again.');
      setPending(false);
    }
  };

  const used = device.lastUsedAt
    ? `Last sent a message ${relativeCairoDay(device.lastUsedAt)}`
    : 'Never used yet';

  return (
    <div className={cn('px-5 py-4 sm:px-6', device.revoked && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-medium">
            <span className="truncate">{device.name}</span>
            {device.revoked && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Revoked
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Added {formatInstantDay(device.createdAt)} · {used}
          </p>
        </div>
        {!device.revoked && !confirming && (
          <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
            Revoke
          </Button>
        )}
      </div>

      {!device.revoked && confirming && (
        <div role="group" aria-label={`Revoke ${device.name}`} className="mt-3 rounded-lg border bg-muted/40 px-3.5 py-3">
          <p className="text-sm">
            Revoke {device.name}? It will stop sending messages immediately.
          </p>
          {error && (
            <p role="alert" className="mt-1.5 text-[0.8rem] text-destructive">
              {error}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => void revoke()} disabled={pending}>
              {pending && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
              Revoke
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
  );
}
