'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, X } from 'lucide-react';
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
import { toFormErrors } from '@/lib/api/form-errors';
import type { AccountDto, UpdateAccountRequest } from '@/lib/api/types';
import { withPendingDigits } from '@/lib/card-digits';
import { typeIcon, typeLabel } from './account-meta';

const editAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter an account name')
    .max(60, 'Account name must be at most 60 characters'),
  last4s: z
    .array(z.string().regex(/^\d{4}$/, 'Must be 4 digits'))
    .max(10, 'At most 10 card numbers allowed'),
});

export interface EditAccountSheetProps {
  account: AccountDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (digitsAdded: boolean) => void;
}

function EditAccountForm({
  account,
  onClose,
  onSuccess,
}: {
  account: AccountDto;
  onClose: () => void;
  onSuccess?: (digitsAdded: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState(account.name);
  const [last4s, setLast4s] = React.useState<string[]>(account.last4s);
  const [digitInput, setDigitInput] = React.useState('');
  const [digitError, setDigitError] = React.useState<string | null>(null);

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const TypeIcon = typeIcon[account.type];

  const addDigit = () => {
    const trimmed = digitInput.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      setDigitError('Enter exactly 4 digits');
      return;
    }
    if (last4s.includes(trimmed)) {
      setDigitError('This number is already in the list');
      return;
    }
    if (last4s.length >= 10) {
      setDigitError('You can add up to 10 numbers');
      return;
    }
    setLast4s((prev) => [...prev, trimmed]);
    setDigitInput('');
    setDigitError(null);
  };

  const removeDigit = (d: string) => {
    setLast4s((prev) => prev.filter((item) => item !== d));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const pending = withPendingDigits(last4s, digitInput);
    if (!pending.ok) {
      setDigitError(pending.error);
      return;
    }
    const digits = pending.digits;

    const parseResult = editAccountSchema.safeParse({
      name,
      last4s: digits,
    });

    if (!parseResult.success) {
      const errs: Record<string, string> = {};
      for (const issue of parseResult.error.issues) {
        const path = issue.path[0];
        if (typeof path === 'string' && !errs[path]) {
          errs[path] = issue.message;
        }
      }
      setFieldErrors(errs);
      return;
    }

    const trimmedName = parseResult.data.name;
    const nameChanged = trimmedName !== account.name;
    const last4sChanged =
      digits.length !== account.last4s.length ||
      digits.some((d, i) => d !== account.last4s[i]);

    if (!nameChanged && !last4sChanged) {
      onClose();
      return;
    }

    const digitsAdded = digits.some((d) => !account.last4s.includes(d));

    const body: UpdateAccountRequest = {};
    if (nameChanged) body.name = trimmedName;
    if (last4sChanged) body.last4s = digits;

    setPending(true);

    try {
      await apiFetch<{ account: AccountDto }>(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        body,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      ]);

      onClose();
      onSuccess?.(digitsAdded);
    } catch (err) {
      const errors = toFormErrors(err, ['name', 'last4s']);
      setFormError(errors.general);
      setFieldErrors(errors.fields);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-5 px-4 pb-6">
      <FormAlert message={formError} />

      <FormField id="edit-account-name" label="Account name" error={fieldErrors.name}>
        {(control) => (
          <Input
            {...control}
            name="name"
            type="text"
            autoFocus
            maxLength={60}
            className="h-11 sm:h-10"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
          />
        )}
      </FormField>

      <div className="rounded-lg border bg-muted/40 p-3.5 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Type</span>
          <span className="flex items-center gap-1.5 font-medium">
            <TypeIcon className="size-4 text-muted-foreground" />
            {typeLabel[account.type]}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Currency</span>
          <span className="font-medium">{account.currency}</span>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">
          Type and currency cannot be changed after an account is created.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="edit-account-digits" className="text-sm font-medium">
          Card or account digits
        </label>
        <div className="flex gap-2">
          <Input
            id="edit-account-digits"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="1111"
            className="h-11 flex-1 font-mono sm:h-10"
            value={digitInput}
            onChange={(e) => {
              setDigitInput(e.target.value.replace(/\D/g, '').slice(0, 4));
              if (digitError) setDigitError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addDigit();
              }
            }}
            disabled={pending || last4s.length >= 10}
          />
          <Button
            type="button"
            variant="outline"
            onClick={addDigit}
            disabled={pending || digitInput.length !== 4 || last4s.length >= 10}
            className="h-11 shrink-0 sm:h-10"
          >
            <Plus aria-hidden="true" className="size-4" />
            Add
          </Button>
        </div>
        <p className="text-[0.8rem] text-muted-foreground">
          The last 4 digits your bank uses in its SMS. Messages are matched to accounts by these.
        </p>
        {digitError && (
          <p className="flex items-start gap-1.5 text-[0.8rem] text-destructive">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {digitError}
          </p>
        )}
        {fieldErrors.last4s && (
          <p className="flex items-start gap-1.5 text-[0.8rem] text-destructive">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {fieldErrors.last4s}
          </p>
        )}

        {last4s.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {last4s.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-mono font-medium text-foreground"
              >
                •• {d}
                <button
                  type="button"
                  onClick={() => removeDigit(d)}
                  disabled={pending}
                  className="text-muted-foreground hover:text-foreground focus-visible:outline-none"
                  aria-label={`Remove digits ${d}`}
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="pt-2">
        <SubmitButton pending={pending} pendingLabel="Saving changes…">
          Save changes
        </SubmitButton>
      </div>
    </form>
  );
}

export function EditAccountSheet({
  account,
  open,
  onOpenChange,
  onSuccess,
}: EditAccountSheetProps) {
  if (!account) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit account</SheetTitle>
          <SheetDescription>
            Update the account name and card digits for bank SMS matching.
          </SheetDescription>
        </SheetHeader>

        {open && (
          <EditAccountForm
            key={account.id}
            account={account}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
