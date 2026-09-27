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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { apiFetch } from '@/lib/api/client';
import { toFormErrors } from '@/lib/api/form-errors';
import type { AccountDto, AccountType, CreateAccountRequest, Currency } from '@/lib/api/types';
import { withPendingDigits } from '@/lib/card-digits';
import { cn } from '@/lib/utils';
import { ALL_ACCOUNT_TYPES, typeIcon, typeLabel } from './account-meta';

const currencies: { value: Currency; label: string; name: string }[] = [
  { value: 'EGP', label: 'EGP', name: 'Egyptian pound' },
  { value: 'USD', label: 'USD', name: 'US dollar' },
];

const addAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter an account name')
    .max(60, 'Account name must be at most 60 characters'),
  type: z.enum(['checking', 'savings', 'cash', 'wallet', 'credit_card', 'brokerage'] as const),
  currency: z.enum(['EGP', 'USD'] as const),
  last4s: z
    .array(z.string().regex(/^\d{4}$/, 'Must be 4 digits'))
    .max(10, 'At most 10 card numbers allowed')
    .optional(),
});

export interface AddAccountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddAccountSheet({ open, onOpenChange, onSuccess }: AddAccountSheetProps) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState<AccountType>('checking');
  const [currency, setCurrency] = React.useState<Currency>('EGP');
  const [last4s, setLast4s] = React.useState<string[]>([]);
  const [digitInput, setDigitInput] = React.useState('');
  const [digitError, setDigitError] = React.useState<string | null>(null);

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const resetForm = React.useCallback(() => {
    setName('');
    setType('checking');
    setCurrency('EGP');
    setLast4s([]);
    setDigitInput('');
    setDigitError(null);
    setFormError(null);
    setFieldErrors({});
    setPending(false);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

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

    const parseResult = addAccountSchema.safeParse({
      name,
      type,
      currency,
      last4s: digits.length > 0 ? digits : undefined,
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

    setPending(true);

    try {
      const body: CreateAccountRequest = {
        name: parseResult.data.name,
        type: parseResult.data.type,
        currency: parseResult.data.currency,
        ...(digits.length > 0 ? { last4s: digits } : {}),
      };

      await apiFetch<{ account: AccountDto }>('/api/accounts', {
        method: 'POST',
        body,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      ]);

      handleOpenChange(false);
      onSuccess?.();
    } catch (err) {
      const errors = toFormErrors(err, ['name', 'type', 'currency', 'last4s']);
      setFormError(errors.general);
      setFieldErrors(errors.fields);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add account</SheetTitle>
          <SheetDescription>
            Add a card, bank account or cash wallet to organize your transactions.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-5 px-4 pb-6">
          <FormAlert message={formError} />

          <FormField id="account-name" label="Account name" error={fieldErrors.name}>
            {(control) => (
              <Input
                {...control}
                name="name"
                type="text"
                autoFocus
                placeholder="e.g. Test Visa"
                maxLength={60}
                className="h-11 sm:h-10"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
              />
            )}
          </FormField>

          <div className="space-y-2">
            <label htmlFor="account-type" className="text-sm font-medium">
              Account type
            </label>
            <Select
              items={typeLabel}
              value={type}
              onValueChange={(val) => {
                if (val) setType(val as AccountType);
              }}
              disabled={pending}
            >
              <SelectTrigger id="account-type" className="h-11 w-full justify-between sm:h-10">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ALL_ACCOUNT_TYPES.map((t) => {
                  const Icon = typeIcon[t];
                  return (
                    <SelectItem key={t} value={t}>
                      <span className="flex items-center gap-2">
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span>{typeLabel[t]}</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {fieldErrors.type && (
              <p className="flex items-start gap-1.5 text-[0.8rem] text-destructive">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                {fieldErrors.type}
              </p>
            )}
          </div>

          <fieldset className="space-y-2" aria-describedby="currency-hint">
            <legend className="text-sm font-medium">Currency</legend>
            <div className="grid grid-cols-2 gap-2">
              {currencies.map((c) => (
                <label
                  key={c.value}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-3.5 py-2.5 transition-colors',
                    'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                    currency === c.value
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'hover:bg-muted',
                    pending && 'pointer-events-none opacity-50',
                  )}
                >
                  <input
                    type="radio"
                    name="currency"
                    value={c.value}
                    checked={currency === c.value}
                    onChange={() => setCurrency(c.value)}
                    disabled={pending}
                    className="sr-only"
                  />
                  <span className="font-semibold">{c.label}</span>
                  <span className="truncate text-xs opacity-80">{c.name}</span>
                </label>
              ))}
            </div>
            <p id="currency-hint" className="text-[0.8rem] text-muted-foreground">
              Currency cannot be changed after creating the account.
            </p>
            {fieldErrors.currency && (
              <p className="text-[0.8rem] text-destructive">{fieldErrors.currency}</p>
            )}
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="account-digits" className="text-sm font-medium">
              Card or account digits (optional)
            </label>
            <div className="flex gap-2">
              <Input
                id="account-digits"
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
            <SubmitButton pending={pending} pendingLabel="Adding account…">
              Add account
            </SubmitButton>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
