'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FormAlert, SubmitButton } from '@/components/auth/auth-form-parts';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { apiFetch } from '@/lib/api/client';
import { accountsQuery } from '@/lib/api/finance';
import { toFormErrors } from '@/lib/api/form-errors';
import type { Currency, InstallmentPlanDto } from '@/lib/api/types';
import { toCairoDateString } from '@/lib/cairo-date';
import { parseAmount } from '@/lib/money';

const NO_ACCOUNT = 'none';
const FIELDS = ['name', 'provider', 'installmentAmount', 'currency', 'totalInstallments', 'firstDueDate', 'accountId'] as const;

/** Track a purchase paid monthly: valU, Halan, Souhoola or a bank plan. */
export function AddInstallmentSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useQuery(accountsQuery);
  const visibleAccounts = accounts.filter((a) => !a.archived);

  const [name, setName] = React.useState('');
  const [provider, setProvider] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [currency, setCurrency] = React.useState<Currency>('EGP');
  const [count, setCount] = React.useState('');
  const [firstDue, setFirstDue] = React.useState(() => toCairoDateString(new Date()));
  const [accountId, setAccountId] = React.useState(NO_ACCOUNT);
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName('');
      setProvider('');
      setAmount('');
      setCurrency('EGP');
      setCount('');
      setFirstDue(toCairoDateString(new Date()));
      setAccountId(NO_ACCOUNT);
      setFormError(null);
      setErrors({});
    }
    onOpenChange(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Give it a name';
    const parsed = parseAmount(amount);
    if (!parsed.ok) next.installmentAmount = parsed.error;
    const total = /^\d+$/.test(count.trim()) ? Number(count.trim()) : NaN;
    if (!Number.isInteger(total) || total < 1 || total > 120) next.totalInstallments = 'Enter a number of payments from 1 to 120';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) next.firstDueDate = 'Pick the first payment date';
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.ok) return;

    // Optional fields are left out, never sent as null (API.md 13).
    const body = {
      name: name.trim(),
      ...(provider.trim() ? { provider: provider.trim() } : {}),
      installmentAmount: parsed.value,
      currency,
      totalInstallments: total,
      firstDueDate: firstDue,
      ...(accountId !== NO_ACCOUNT ? { accountId } : {}),
    };
    setPending(true);
    try {
      const res = await apiFetch<{ plan: InstallmentPlanDto }>('/api/installments', { method: 'POST', body });
      await queryClient.invalidateQueries({ queryKey: ['installments'] });
      toast.success(`Tracking ${res.plan.name}`);
      handleOpenChange(false);
    } catch (err) {
      const fe = toFormErrors(err, FIELDS);
      setFormError(fe.general);
      setErrors(fe.fields);
    } finally {
      setPending(false);
    }
  };

  const accountItems = Object.fromEntries([
    [NO_ACCOUNT, 'Not linked'],
    ...visibleAccounts.map((a) => [a.id, `${a.name} (${a.currency})`]),
  ]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add installment plan</SheetTitle>
          <SheetDescription>Payments count as made once their date passes, so the progress keeps itself up to date.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="space-y-5 px-4 pb-6">
          <FormAlert message={formError} />
          <FormField id="plan-name" label="What you bought" error={errors.name}>
            {(control) => (
              <Input {...control} autoFocus maxLength={60} placeholder="TEST Phone" className="h-11 sm:h-10" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
            )}
          </FormField>
          <FormField id="plan-provider" label="Paid through (optional)" hint="valU, Halan, Souhoola, your bank..." error={errors.provider}>
            {(control) => (
              <Input {...control} maxLength={60} className="h-11 sm:h-10" value={provider} onChange={(e) => setProvider(e.target.value)} disabled={pending} />
            )}
          </FormField>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <FormField id="plan-amount" label="Each payment" error={errors.installmentAmount}>
              {(control) => (
                <Input {...control} inputMode="decimal" placeholder="0.00" className="h-11 font-mono text-base sm:h-10" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
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
          <div className="grid grid-cols-2 gap-3">
            <FormField id="plan-count" label="Number of payments" error={errors.totalInstallments}>
              {(control) => (
                <Input {...control} inputMode="numeric" placeholder="6" className="h-11 sm:h-10" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 3))} disabled={pending} />
              )}
            </FormField>
            <FormField id="plan-first" label="First payment" error={errors.firstDueDate}>
              {(control) => (
                <Input {...control} type="date" className="h-11 sm:h-10" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} disabled={pending} />
              )}
            </FormField>
          </div>
          <div className="space-y-2">
            <label htmlFor="plan-account" className="text-sm font-medium">
              Paid from (optional)
            </label>
            <Select items={accountItems} value={accountId} onValueChange={(v) => v && setAccountId(v)} disabled={pending}>
              <SelectTrigger id="plan-account" className="h-11 w-full justify-between sm:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACCOUNT}>Not linked</SelectItem>
                {visibleAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SubmitButton pending={pending} pendingLabel="Adding…">
            Add plan
          </SubmitButton>
        </form>
      </SheetContent>
    </Sheet>
  );
}
