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
import { categoriesQuery } from '@/lib/api/finance';
import { toFormErrors } from '@/lib/api/form-errors';
import type { Currency } from '@/lib/api/types';
import { parseAmount } from '@/lib/money';

/** Set a monthly limit for a spending category that has none yet. */
export function AddBudgetSheet({
  open,
  onOpenChange,
  budgetedCategoryIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetedCategoryIds: ReadonlySet<string>;
}) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery(categoriesQuery);
  const choices = categories.filter((c) => c.kind === 'spending' && !budgetedCategoryIds.has(c.id));

  const [categoryId, setCategoryId] = React.useState<string>('');
  const [currency, setCurrency] = React.useState<Currency>('EGP');
  const [limit, setLimit] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setCategoryId('');
      setCurrency('EGP');
      setLimit('');
      setFormError(null);
      setErrors({});
    }
    onOpenChange(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const next: Record<string, string> = {};
    if (!categoryId) next.categoryId = 'Choose a category';
    const parsed = parseAmount(limit);
    if (!parsed.ok) next.limit = parsed.error;
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.ok) return;

    setPending(true);
    try {
      await apiFetch(`/api/budgets/${encodeURIComponent(categoryId)}`, {
        method: 'PUT',
        body: { currency, limit: parsed.value },
      });
      await queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success(`Budget set for ${categories.find((c) => c.id === categoryId)?.name ?? 'the category'}`);
      handleOpenChange(false);
    } catch (err) {
      const fe = toFormErrors(err, ['currency', 'limit']);
      setFormError(fe.general);
      setErrors(fe.fields);
    } finally {
      setPending(false);
    }
  };

  const items = Object.fromEntries(choices.map((c) => [c.id, c.name]));

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add a budget</SheetTitle>
          <SheetDescription>A monthly limit that starts this month and carries on until you change it.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="space-y-5 px-4 pb-6">
          <FormAlert message={formError} />
          <div className="space-y-2">
            <label htmlFor="budget-category" className="text-sm font-medium">
              Category
            </label>
            <Select items={items} value={categoryId} onValueChange={(v) => v && setCategoryId(v)} disabled={pending}>
              <SelectTrigger id="budget-category" className="h-11 w-full justify-between sm:h-10">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {choices.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.categoryId && <p className="text-[0.8rem] text-destructive">{errors.categoryId}</p>}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <FormField id="budget-limit" label="Monthly limit" error={errors.limit}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-11 font-mono text-base sm:h-10"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
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

          <SubmitButton pending={pending} pendingLabel="Saving…">
            Set budget
          </SubmitButton>
        </form>
      </SheetContent>
    </Sheet>
  );
}
