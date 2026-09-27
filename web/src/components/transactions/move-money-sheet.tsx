'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, CircleAlert } from 'lucide-react';
import { FormAlert, SubmitButton } from '@/components/auth/auth-form-parts';
import { FormField } from '@/components/form-field';
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
import { accountsQuery } from '@/lib/api/finance';
import type { CreateTransferRequest } from '@/lib/api/types';
import { cairoDateTimeToIso, toCairoDateTimeLocalString } from '@/lib/cairo-date';
import { parseAmount } from '@/lib/money';

export interface MoveMoneySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function MoveMoneyForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useQuery(accountsQuery);

  const visibleAccounts = React.useMemo(
    () => accounts.filter((a) => !a.archived),
    [accounts],
  );

  const [selectedFromAccountId, setSelectedFromAccountId] = React.useState<string | null>(null);
  const fromAccountId = selectedFromAccountId ?? (visibleAccounts[0]?.id ?? '');

  const fromAccount = React.useMemo(
    () => visibleAccounts.find((a) => a.id === fromAccountId),
    [visibleAccounts, fromAccountId],
  );

  const availableToAccounts = React.useMemo(() => {
    if (!fromAccount) return [];
    return visibleAccounts.filter(
      (a) => a.currency === fromAccount.currency && a.id !== fromAccount.id,
    );
  }, [visibleAccounts, fromAccount]);

  const [selectedToAccountId, setSelectedToAccountId] = React.useState('');
  const toAccountId = availableToAccounts.some((a) => a.id === selectedToAccountId)
    ? selectedToAccountId
    : '';

  const [amount, setAmount] = React.useState('');
  const [datetimeLocal, setDatetimeLocal] = React.useState(() => toCairoDateTimeLocalString());

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const fromAccountItems = React.useMemo(
    () =>
      Object.fromEntries(
        visibleAccounts.map((a) => [a.id, `${a.name} (${a.currency})`]),
      ),
    [visibleAccounts],
  );

  const toAccountItems = React.useMemo(
    () =>
      Object.fromEntries(
        availableToAccounts.map((a) => [a.id, `${a.name} (${a.currency})`]),
      ),
    [availableToAccounts],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const amountValidation = parseAmount(amount);
    if (!amountValidation.ok) {
      setFieldErrors({ amount: amountValidation.error });
      return;
    }

    if (!fromAccountId) {
      setFieldErrors({ fromAccountId: 'Select the account you are transferring from' });
      return;
    }

    if (!toAccountId) {
      setFieldErrors({ toAccountId: 'Select the account you are transferring to' });
      return;
    }

    if (fromAccountId === toAccountId) {
      setFieldErrors({ toAccountId: 'Choose a different destination account' });
      return;
    }

    setPending(true);

    try {
      const body: CreateTransferRequest = {
        fromAccountId,
        toAccountId,
        amount: amountValidation.value,
        occurredAt: cairoDateTimeToIso(datetimeLocal || toCairoDateTimeLocalString()),
      };

      await apiFetch<{ transferGroupId: string }>('/api/transfers', {
        method: 'POST',
        body,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
      ]);

      onClose();
      onSuccess?.();
    } catch (err) {
      const errors = toFormErrors(err, ['fromAccountId', 'toAccountId', 'amount', 'occurredAt']);
      setFormError(errors.general);
      setFieldErrors(errors.fields);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-5 px-4 pb-6">
      <FormAlert message={formError} />

      <div className="rounded-xl border border-muted bg-muted/40 p-3.5 text-xs text-muted-foreground flex items-center gap-2">
        <ArrowLeftRight aria-hidden="true" className="size-4 shrink-0" />
        <span>Moving money between your own accounts isn’t spending.</span>
      </div>

      <div className="space-y-2">
        <label htmlFor="transfer-from" className="text-sm font-medium">
          From account
        </label>
        <Select
          items={fromAccountItems}
          value={fromAccountId}
          onValueChange={(val) => {
            if (val) setSelectedFromAccountId(val);
          }}
          disabled={pending}
        >
          <SelectTrigger id="transfer-from" className="h-11 w-full justify-between sm:h-10">
            <SelectValue placeholder="Select source account" />
          </SelectTrigger>
          <SelectContent>
            {visibleAccounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                {acc.name} ({acc.currency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldErrors.fromAccountId && (
          <p className="flex items-start gap-1.5 text-[0.8rem] text-destructive">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {fieldErrors.fromAccountId}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="transfer-to" className="text-sm font-medium">
          To account
        </label>
        <Select
          items={toAccountItems}
          value={toAccountId}
          onValueChange={(val) => {
            if (val) setSelectedToAccountId(val);
          }}
          disabled={pending || availableToAccounts.length === 0}
        >
          <SelectTrigger id="transfer-to" className="h-11 w-full justify-between sm:h-10">
            <SelectValue
              placeholder={
                availableToAccounts.length === 0
                  ? 'No other accounts in this currency'
                  : 'Select destination account'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {availableToAccounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                {acc.name} ({acc.currency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fromAccount && availableToAccounts.length === 0 && (
          <p className="text-[0.8rem] text-muted-foreground">
            You need at least two accounts in {fromAccount.currency} to transfer money.
          </p>
        )}
        {fieldErrors.toAccountId && (
          <p className="flex items-start gap-1.5 text-[0.8rem] text-destructive">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {fieldErrors.toAccountId}
          </p>
        )}
      </div>

      <FormField
        id="transfer-amount"
        label="Amount"
        hint={fromAccount ? `In ${fromAccount.currency}` : undefined}
        error={fieldErrors.amount}
      >
        {(control) => (
          <Input
            {...control}
            name="amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            className="h-11 font-mono text-base sm:h-10"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={pending}
          />
        )}
      </FormField>

      <FormField id="transfer-datetime" label="Date and time" error={fieldErrors.occurredAt}>
        {(control) => (
          <Input
            {...control}
            name="datetime"
            type="datetime-local"
            className="h-11 sm:h-10"
            value={datetimeLocal}
            onChange={(e) => setDatetimeLocal(e.target.value)}
            disabled={pending}
          />
        )}
      </FormField>

      <div className="pt-2">
        <SubmitButton pending={pending} pendingLabel="Moving money…">
          Move money
        </SubmitButton>
      </div>
    </form>
  );
}

export function MoveMoneySheet({ open, onOpenChange, onSuccess }: MoveMoneySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Move money</SheetTitle>
          <SheetDescription>
            Transfer between your own accounts in the same currency.
          </SheetDescription>
        </SheetHeader>

        {open && (
          <MoveMoneyForm
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
