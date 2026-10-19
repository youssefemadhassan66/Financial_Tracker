'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormAlert, SubmitButton } from '@/components/auth/auth-form-parts';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { apiFetch } from '@/lib/api/client';
import { accountsQuery } from '@/lib/api/finance';
import { toFormErrors } from '@/lib/api/form-errors';
import type { BillingCycle, CreateSubscriptionRequest, Currency, SubscriptionDto } from '@/lib/api/types';
import { toCairoDateString } from '@/lib/cairo-date';
import { parseAmount } from '@/lib/money';
import { CYCLES } from '@/lib/subscriptions';

const NO_ACCOUNT = 'none';
const FIELDS = ['name', 'amount', 'currency', 'cycle', 'anchorDate', 'accountId', 'notes'] as const;

/** Track a subscription by hand: name, price, how often, and the first billing date. */
export function AddSubscriptionSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (sub: SubscriptionDto) => void;
}) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useQuery(accountsQuery);
  const visibleAccounts = accounts.filter((a) => !a.archived);

  const [name, setName] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [currency, setCurrency] = React.useState<Currency>('EGP');
  const [cycle, setCycle] = React.useState<BillingCycle>('monthly');
  const [anchorDate, setAnchorDate] = React.useState(() => toCairoDateString(new Date()));
  const [accountId, setAccountId] = React.useState<string>(NO_ACCOUNT);
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const reset = () => {
    setName('');
    setAmount('');
    setCurrency('EGP');
    setCycle('monthly');
    setAnchorDate(toCairoDateString(new Date()));
    setAccountId(NO_ACCOUNT);
    setFormError(null);
    setErrors({});
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const accountItems = Object.fromEntries([
    [NO_ACCOUNT, 'Any account'],
    ...visibleAccounts.map((a) => [a.id, `${a.name} (${a.currency})`]),
  ]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const next: Record<string, string> = {};
    const trimmed = name.trim();
    if (!trimmed) next.name = 'Give it a name';
    else if (trimmed.length > 60) next.name = 'Name must be at most 60 characters';
    const parsed = parseAmount(amount);
    if (!parsed.ok) next.amount = parsed.error;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) next.anchorDate = 'Pick the first billing date';
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.ok) return;

    // Optional ids are left out, never sent as null (API.md 8).
    const body: CreateSubscriptionRequest = {
      name: trimmed,
      amount: parsed.value,
      currency,
      cycle,
      anchorDate,
      ...(accountId !== NO_ACCOUNT ? { accountId } : {}),
    };
    setPending(true);
    try {
      const res = await apiFetch<{ subscription: SubscriptionDto }>('/api/subscriptions', { method: 'POST', body });
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      onCreated?.(res.subscription);
      handleOpenChange(false);
    } catch (err) {
      const fe = toFormErrors(err, FIELDS);
      setFormError(fe.general);
      setErrors(fe.fields);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add subscription</SheetTitle>
          <SheetDescription>Past charges that match are linked automatically.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="space-y-5 px-4 pb-6">
          <FormAlert message={formError} />

          <FormField id="sub-name" label="Name" error={errors.name}>
            {(control) => (
              <Input
                {...control}
                autoFocus
                maxLength={60}
                placeholder="Test Stream"
                className="h-11 sm:h-10"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
              />
            )}
          </FormField>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <FormField id="sub-amount" label="Price" error={errors.amount}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-11 font-mono text-base sm:h-10"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={pending}
                />
              )}
            </FormField>
            <Segmented
              label="Currency"
              options={[
                { value: 'EGP', label: 'EGP' },
                { value: 'USD', label: 'USD' },
              ]}
              value={currency}
              onChange={setCurrency}
              className="mb-0.5"
            />
          </div>

          <div className="space-y-2">
            <p id="sub-cycle-label" className="text-sm font-medium">
              How often
            </p>
            <Segmented label="How often" options={CYCLES} value={cycle} onChange={setCycle} size="sm" />
            {errors.cycle && <p className="text-[0.8rem] text-destructive">{errors.cycle}</p>}
          </div>

          <FormField
            id="sub-anchor"
            label="First billing date"
            hint="Later dates are counted from this one."
            error={errors.anchorDate}
          >
            {(control) => (
              <Input
                {...control}
                type="date"
                className="h-11 sm:h-10"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
                disabled={pending}
              />
            )}
          </FormField>

          <div className="space-y-2">
            <label htmlFor="sub-account" className="text-sm font-medium">
              Paid from (optional)
            </label>
            <Select items={accountItems} value={accountId} onValueChange={(v) => v && setAccountId(v)} disabled={pending}>
              <SelectTrigger id="sub-account" className="h-11 w-full justify-between sm:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACCOUNT}>Any account</SelectItem>
                {visibleAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.accountId && <p className="text-[0.8rem] text-destructive">{errors.accountId}</p>}
          </div>

          <SubmitButton pending={pending} pendingLabel="Adding…">
            Add subscription
          </SubmitButton>
        </form>
      </SheetContent>
    </Sheet>
  );
}
