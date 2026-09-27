'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
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
import { accountsQuery, categoriesQuery } from '@/lib/api/finance';
import type {
  CreateTransactionRequest,
  Direction,
  TransactionView,
} from '@/lib/api/types';
import {
  cairoDateTimeToIso,
  toCairoDateString,
  toCairoDateTimeLocalString,
} from '@/lib/cairo-date';
import { findPossibleDuplicate } from '@/lib/duplicate-guard';
import { formatInstantDay, formatMoney } from '@/lib/format';
import { parseAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

export interface AddTransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type TransactionMode = 'out' | 'in';

function AddTransactionForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useQuery(accountsQuery);
  const { data: categories = [] } = useQuery(categoriesQuery);

  const visibleAccounts = React.useMemo(
    () => accounts.filter((a) => !a.archived),
    [accounts],
  );

  const [mode, setMode] = React.useState<TransactionMode>('out');
  const [amount, setAmount] = React.useState('');
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState('');
  const [isRefund, setIsRefund] = React.useState(false);
  const [merchant, setMerchant] = React.useState('');
  const [datetimeLocal, setDatetimeLocal] = React.useState(() => toCairoDateTimeLocalString());

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [duplicateWarning, setDuplicateWarning] = React.useState<TransactionView | null>(null);

  // Default to an account the bank doesn't text about (cash, a wallet): that is
  // what people add by hand. Defaulting to a card invites duplicates of its SMS.
  const defaultAccount = visibleAccounts.find((a) => a.last4s.length === 0) ?? visibleAccounts[0];
  const accountId = selectedAccountId ?? defaultAccount?.id ?? '';

  const selectedAccount = React.useMemo(
    () => visibleAccounts.find((a) => a.id === accountId),
    [visibleAccounts, accountId],
  );

  const accountItems = React.useMemo(
    () =>
      Object.fromEntries(
        visibleAccounts.map((a) => [a.id, `${a.name} (${a.currency})`]),
      ),
    [visibleAccounts],
  );

  // Filter categories according to mode and refund status
  const availableCategories = React.useMemo(() => {
    const isSpending = mode === 'out' || isRefund;
    const targetKind = isSpending ? 'spending' : 'income';
    return categories.filter((c) => c.kind === targetKind);
  }, [categories, mode, isRefund]);

  // Derived effective categoryId
  const categoryId = availableCategories.some((c) => c.id === selectedCategoryId)
    ? selectedCategoryId
    : '';

  const categoryItems = React.useMemo(
    () => ({
      '': 'Uncategorized',
      ...Object.fromEntries(availableCategories.map((c) => [c.id, c.name])),
    }),
    [availableCategories],
  );

  const executeSubmit = async (skipDuplicateCheck = false) => {
    setFormError(null);
    setFieldErrors({});

    const amountValidation = parseAmount(amount);
    if (!amountValidation.ok) {
      setFieldErrors({ amount: amountValidation.error });
      return;
    }

    if (!accountId) {
      setFieldErrors({ accountId: 'Select an account' });
      return;
    }

    if (merchant.trim().length > 120) {
      setFieldErrors({ merchant: 'Merchant or note must be at most 120 characters' });
      return;
    }

    const direction: Direction = mode === 'out' ? 'debit' : 'credit';
    const kind = mode === 'out' || isRefund ? 'expense' : 'income';
    const countsAsSpending = mode === 'out' || isRefund;
    const occurredAt = cairoDateTimeToIso(datetimeLocal || toCairoDateTimeLocalString());

    setPending(true);

    try {
      if (!skipDuplicateCheck) {
        const cairoDay = toCairoDateString(new Date(occurredAt));
        const res = await apiFetch<{ transactions: TransactionView[] }>(
          `/api/transactions?accountId=${encodeURIComponent(accountId)}&from=${cairoDay}&to=${cairoDay}&limit=200`,
        );

        const dup = findPossibleDuplicate(res.transactions, amountValidation.value, direction);
        if (dup) {
          setDuplicateWarning(dup);
          setPending(false);
          return;
        }
      }

      const body: CreateTransactionRequest = {
        accountId,
        amount: amountValidation.value,
        direction,
        kind,
        countsAsSpending,
        occurredAt,
        ...(categoryId ? { categoryId } : {}),
        ...(merchant.trim() ? { merchant: merchant.trim() } : {}),
      };

      await apiFetch<{ id: string }>('/api/transactions', {
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
      const errors = toFormErrors(err, [
        'accountId',
        'amount',
        'direction',
        'kind',
        'categoryId',
        'merchant',
        'occurredAt',
      ]);
      setFormError(errors.general);
      setFieldErrors(errors.fields);
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSubmit(false);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-5 px-4 pb-6">
      <FormAlert message={formError} />

      {duplicateWarning && (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-primary/20 bg-accent/60 p-4 text-sm text-accent-foreground"
        >
          <p>
            This looks like{' '}
            {duplicateWarning.merchant ?? duplicateWarning.category?.name ?? 'a transaction'} for{' '}
            {formatMoney(duplicateWarning.amount, duplicateWarning.currency)} on{' '}
            {formatInstantDay(duplicateWarning.occurredAt)}, already recorded. Add it anyway?
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => executeSubmit(true)}
              disabled={pending}
            >
              Add anyway
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDuplicateWarning(null)}
              disabled={pending}
            >
              Go back
            </Button>
          </div>
        </div>
      )}

      {/* Money out / Money in Segmented Control */}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Transaction direction">
        <label
          className={cn(
            'flex cursor-pointer items-center justify-center rounded-lg border bg-card px-3.5 py-2.5 text-sm font-semibold transition-colors',
            'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
            mode === 'out'
              ? 'border-primary bg-accent text-accent-foreground'
              : 'hover:bg-muted',
            pending && 'pointer-events-none opacity-50',
          )}
        >
          <input
            type="radio"
            name="transaction-mode"
            value="out"
            checked={mode === 'out'}
            onChange={() => {
              setMode('out');
              setIsRefund(false);
            }}
            disabled={pending}
            className="sr-only"
          />
          Money out
        </label>
        <label
          className={cn(
            'flex cursor-pointer items-center justify-center rounded-lg border bg-card px-3.5 py-2.5 text-sm font-semibold transition-colors',
            'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
            mode === 'in'
              ? 'border-primary bg-accent text-accent-foreground'
              : 'hover:bg-muted',
            pending && 'pointer-events-none opacity-50',
          )}
        >
          <input
            type="radio"
            name="transaction-mode"
            value="in"
            checked={mode === 'in'}
            onChange={() => setMode('in')}
            disabled={pending}
            className="sr-only"
          />
          Money in
        </label>
      </div>

      <FormField
        id="tx-amount"
        label="Amount"
        hint={selectedAccount ? `In ${selectedAccount.currency}` : undefined}
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

      <div className="space-y-2">
        <label htmlFor="tx-account" className="text-sm font-medium">
          Account
        </label>
        <Select
          items={accountItems}
          value={accountId}
          onValueChange={(val) => {
            if (val) setSelectedAccountId(val);
          }}
          disabled={pending}
        >
          <SelectTrigger id="tx-account" className="h-11 w-full justify-between sm:h-10">
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {visibleAccounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                {acc.name} ({acc.currency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedAccount && selectedAccount.last4s.length > 0 && (
          <p className="text-[0.8rem] text-muted-foreground">
            Your bank usually texts about this account, so this may be recorded automatically.
          </p>
        )}
        {fieldErrors.accountId && (
          <p className="flex items-start gap-1.5 text-[0.8rem] text-destructive">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {fieldErrors.accountId}
          </p>
        )}
      </div>

      {/* Refund checkbox only for Money in */}
      {mode === 'in' && (
        <div className="flex items-center gap-2 pt-1">
          <input
            id="tx-refund"
            type="checkbox"
            checked={isRefund}
            onChange={(e) => setIsRefund(e.target.checked)}
            disabled={pending}
            className="size-4 rounded border-input text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <label htmlFor="tx-refund" className="cursor-pointer text-sm font-medium">
            This is a refund
          </label>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="tx-category" className="text-sm font-medium">
          Category <span className="text-muted-foreground text-xs">(optional)</span>
        </label>
        <Select
          items={categoryItems}
          value={categoryId}
          onValueChange={(val) => setSelectedCategoryId(val ?? '')}
          disabled={pending}
        >
          <SelectTrigger id="tx-category" className="h-11 w-full justify-between sm:h-10">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Uncategorized</SelectItem>
            {availableCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ''}
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldErrors.categoryId && (
          <p className="flex items-start gap-1.5 text-[0.8rem] text-destructive">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {fieldErrors.categoryId}
          </p>
        )}
      </div>

      <FormField
        id="tx-merchant"
        label="Merchant or note"
        hint="Optional description, store or person (max 120)"
        error={fieldErrors.merchant}
      >
        {(control) => (
          <Input
            {...control}
            name="merchant"
            type="text"
            placeholder="e.g. TEST STORE"
            maxLength={120}
            className="h-11 sm:h-10"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            disabled={pending}
          />
        )}
      </FormField>

      <FormField id="tx-datetime" label="Date and time" error={fieldErrors.occurredAt}>
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
        <SubmitButton pending={pending} pendingLabel="Adding transaction…">
          Add transaction
        </SubmitButton>
      </div>
    </form>
  );
}

export function AddTransactionSheet({
  open,
  onOpenChange,
  onSuccess,
}: AddTransactionSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add transaction</SheetTitle>
          <SheetDescription>
            Record cash, missed SMS, or any expense or income by hand.
          </SheetDescription>
        </SheetHeader>

        {open && (
          <AddTransactionForm
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
