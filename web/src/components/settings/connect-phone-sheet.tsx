'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormAlert, SubmitButton } from '@/components/auth/auth-form-parts';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { apiFetch } from '@/lib/api/client';
import { API_URL } from '@/lib/api/config';
import { toFormErrors } from '@/lib/api/form-errors';
import type { DeviceDto } from '@/lib/api/types';
import { endpointReachability, ingestEndpointUrl } from '@/lib/devices';
import { CopyField } from './copy-field';

const deviceNameSchema = z
  .string()
  .trim()
  .min(1, 'Give this phone a name')
  .max(64, 'Name must be at most 64 characters')
  .regex(/^[^\u0000-\u001f\u007f]*$/, 'Name can’t contain control characters');

const JSON_TEMPLATE = `{
  "sender": "<who sent the SMS, e.g. your bank's name>",
  "body": "<the full SMS text>",
  "receivedAt": "<when it arrived, e.g. 2026-09-30T14:05:00+03:00>"
}`;

export interface ConnectPhoneSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Two steps: name the phone, then show its key ONCE with setup instructions.
 * The key lives only in this component's state. It never goes into the query
 * cache, storage, the URL, a toast or a log, and is wiped when the sheet closes.
 */
export function ConnectPhoneSheet({ open, onOpenChange }: ConnectPhoneSheetProps) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState('My phone');
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [nameError, setNameError] = React.useState<string | undefined>();
  const [created, setCreated] = React.useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [savedConfirmed, setSavedConfirmed] = React.useState(false);

  const reset = () => {
    setName('My phone');
    setPending(false);
    setFormError(null);
    setNameError(undefined);
    setCreated(null);
    setCopied(false);
    setSavedConfirmed(false);
  };

  const canFinish = copied || savedConfirmed;

  const handleOpenChange = (nextOpen: boolean) => {
    // While the key is on screen, closing by Escape or a click outside would
    // lose it for good. Only Done closes this step, after the user saved it.
    if (!nextOpen && created && !canFinish) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setNameError(undefined);

    const parsed = deviceNameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message);
      return;
    }

    setPending(true);
    try {
      const res = await apiFetch<{ device: DeviceDto; key: string }>('/api/devices', {
        method: 'POST',
        body: { name: parsed.data },
      });
      setCreated({ name: res.device.name, key: res.key });
      // The list refetches from GET /api/devices, which never contains a key.
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    } catch (err) {
      const errors = toFormErrors(err, ['name']);
      setFormError(errors.general);
      setNameError(errors.fields.name);
    } finally {
      setPending(false);
    }
  };

  const finish = () => {
    if (!canFinish) return;
    reset();
    onOpenChange(false);
    toast.success('Phone connected');
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={!created}
        className="w-full overflow-y-auto sm:max-w-lg"
      >
        {created ? (
          <KeyStep
            deviceName={created.name}
            deviceKey={created.key}
            copied={copied}
            onCopied={() => setCopied(true)}
            savedConfirmed={savedConfirmed}
            onSavedConfirmedChange={setSavedConfirmed}
            canFinish={canFinish}
            onDone={finish}
          />
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Connect a phone</SheetTitle>
              <SheetDescription>
                Your phone forwards your bank’s SMS here, and each one becomes a transaction on its own.
              </SheetDescription>
            </SheetHeader>
            <form onSubmit={handleSubmit} noValidate className="space-y-5 px-4 pb-6">
              <FormAlert message={formError} />
              <FormField
                id="device-name"
                label="Phone name"
                hint="Just for you, so you can tell your phones apart later."
                error={nameError}
              >
                {(control) => (
                  <Input
                    {...control}
                    name="name"
                    autoFocus
                    maxLength={64}
                    className="h-11 sm:h-10"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={pending}
                  />
                )}
              </FormField>
              <SubmitButton pending={pending} pendingLabel="Creating key…">
                Create key
              </SubmitButton>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function KeyStep({
  deviceName,
  deviceKey,
  copied,
  onCopied,
  savedConfirmed,
  onSavedConfirmedChange,
  canFinish,
  onDone,
}: {
  deviceName: string;
  deviceKey: string;
  copied: boolean;
  onCopied: () => void;
  savedConfirmed: boolean;
  onSavedConfirmedChange: (value: boolean) => void;
  canFinish: boolean;
  onDone: () => void;
}) {
  // Only rendered after a click, so window exists.
  const endpoint = ingestEndpointUrl(API_URL, window.location.origin);
  const reachability = endpointReachability(endpoint);

  return (
    <>
      <SheetHeader>
        <SheetTitle>{deviceName} is ready</SheetTitle>
        <SheetDescription>Set up your phone’s SMS forwarder with the details below.</SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-6">
        <div className="space-y-3 rounded-xl border border-primary/30 bg-accent/40 p-4">
          <p className="flex items-start gap-2 text-sm font-medium">
            <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
            This key is shown only now. If you lose it, revoke this phone and add it again.
          </p>
          <CopyField id="device-key" label="Device key" value={deviceKey} onCopied={onCopied} />
          <div className="flex items-center gap-2">
            <input
              id="device-key-saved"
              type="checkbox"
              checked={savedConfirmed}
              onChange={(e) => onSavedConfirmedChange(e.target.checked)}
              className="size-4 rounded border-input text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <label htmlFor="device-key-saved" className="cursor-pointer text-sm">
              I saved it somewhere safe
            </label>
          </div>
        </div>

        <section aria-labelledby="forwarder-setup" className="space-y-4">
          <h3 id="forwarder-setup" className="font-semibold">
            Forwarder settings
          </h3>

          {reachability === 'loopback' && (
            <p className="flex items-start gap-2 rounded-lg border px-3.5 py-3 text-[0.8rem]">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                This address points at this computer, so your phone can’t reach it. Open the app at your
                computer’s Wi-Fi address (like http://192.168.1.20:3001) and copy the address from there.
              </span>
            </p>
          )}

          <CopyField
            id="ingest-url"
            label="Address (URL)"
            value={endpoint}
            hint={
              reachability === 'public'
                ? 'Your phone needs an internet connection to reach it.'
                : 'Your phone must be able to reach this address. While the app runs on your computer, that means the same Wi-Fi.'
            }
          />

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border px-3.5 py-3 text-[0.8rem]">
            <dt className="text-muted-foreground">Method</dt>
            <dd className="font-mono">POST</dd>
            <dt className="text-muted-foreground">Header</dt>
            <dd>
              <span className="font-mono">X-Device-Key</span>
              <span className="text-muted-foreground">: the key above</span>
            </dd>
            <dt className="text-muted-foreground">Header</dt>
            <dd className="font-mono">Content-Type: application/json</dd>
          </dl>

          <div className="space-y-2">
            <p className="text-sm font-medium">Body (JSON)</p>
            <pre className="overflow-x-auto rounded-lg bg-muted px-3.5 py-3 font-mono text-[0.75rem] leading-relaxed">
              {JSON_TEMPLATE}
            </pre>
            <ul className="list-disc space-y-1 ps-5 text-[0.8rem] text-muted-foreground">
              <li>
                <span className="font-mono text-foreground">sender</span>: the name the SMS came from (up to 64 characters).
              </li>
              <li>
                <span className="font-mono text-foreground">body</span>: the whole message, unchanged (up to 2000 characters).
              </li>
              <li>
                <span className="font-mono text-foreground">receivedAt</span>: when it arrived, with the time zone offset at
                the end, like +03:00.
              </li>
            </ul>
          </div>

          <div className="space-y-2 text-[0.8rem]">
            <p>
              <span className="font-medium">Android:</span>{' '}
              <span className="text-muted-foreground">
                Use an SMS-to-webhook forwarder app that lets you set a URL, a custom header and a JSON body. Filter it to
                your bank’s sender names.
              </span>
            </p>
            <p>
              <span className="font-medium">iPhone:</span>{' '}
              <span className="text-muted-foreground">
                iOS does not let apps read SMS. A Shortcuts automation on “Message received” can call the URL instead.
              </span>
            </p>
          </div>
        </section>

        <div className="space-y-2 border-t pt-4">
          <Button type="button" onClick={onDone} disabled={!canFinish} className="h-11 w-full sm:h-10">
            Done
          </Button>
          {!canFinish && (
            <p className="text-center text-[0.8rem] text-muted-foreground">
              Copy the key or tick “I saved it somewhere safe” first.
            </p>
          )}
          {copied && !savedConfirmed && (
            <p className="text-center text-[0.8rem] text-muted-foreground">Key copied. Paste it into your forwarder now.</p>
          )}
        </div>
      </div>
    </>
  );
}
