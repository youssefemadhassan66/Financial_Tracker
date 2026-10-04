'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, LoaderCircle, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { FormAlert } from '@/components/auth/auth-form-parts';
import { RowsSkeleton, SectionError } from '@/components/dashboard/section';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { apiFetch } from '@/lib/api/client';
import { statementsQuery } from '@/lib/api/finance';
import { toFormErrors } from '@/lib/api/form-errors';
import type { AccountDto, StatementImportResult } from '@/lib/api/types';
import { formatCalendarDay, formatMoney } from '@/lib/format';
import { checkStatementFile, describeImport, formatStatementPeriod } from '@/lib/statement-file';

export interface StatementsSheetProps {
  account: AccountDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Upload a credit card's statement PDF and see the statements imported so far. */
export function StatementsSheet({ account, open, onOpenChange }: StatementsSheetProps) {
  const queryClient = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<StatementImportResult[] | null>(null);

  const statements = useQuery({
    ...statementsQuery(account?.id ?? ''),
    enabled: open && account !== null,
  });

  const reset = () => {
    setFile(null);
    setPending(false);
    setError(null);
    setResults(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const chooseFile = (chosen: File | undefined) => {
    setResults(null);
    setError(null);
    if (!chosen) {
      setFile(null);
      return;
    }
    const check = checkStatementFile(chosen);
    if (!check.ok) {
      setFile(null);
      setError(check.error);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setFile(chosen);
  };

  const upload = async () => {
    if (!account || !file) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch<{ statements: StatementImportResult[] }>(
        `/api/accounts/${encodeURIComponent(account.id)}/statements`,
        { method: 'POST', body: file, headers: { 'Content-Type': 'application/pdf' } },
      );
      setResults(res.statements);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      // An import can add transactions, price foreign charges and link
      // subscriptions, so everything built from them refreshes.
      await Promise.all(
        ['statements', 'transactions', 'accounts', 'analytics', 'subscriptions'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      const imported = res.statements.filter((s) => s.status === 'imported').length;
      toast.success(imported > 0 ? 'Statement imported' : 'Statement was already imported');
    } catch (err) {
      setError(toFormErrors(err, [], { 413: 'This file is over 5 MB. A statement PDF is much smaller.' }).general);
    } finally {
      setPending(false);
    }
  };

  const hasDigits = (account?.last4s.length ?? 0) > 0;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Statements</SheetTitle>
          <SheetDescription>
            {account ? `${account.name}: ` : ''}upload the monthly PDF from your bank. It fills in what SMS missed, like
            fees and the EGP amount of foreign charges.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          {!hasDigits && (
            <p role="note" className="rounded-lg border px-3.5 py-3 text-[0.8rem]">
              Add this card’s last 4 digits first (Edit on the account). The statement is only accepted for the card it
              belongs to.
            </p>
          )}

          <div className="space-y-3">
            <FormAlert message={error} />
            <label
              htmlFor="statement-file"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center text-sm transition-colors hover:bg-muted/50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            >
              <FileText aria-hidden="true" className="size-6 text-muted-foreground" />
              <span className="font-medium">{file ? file.name : 'Choose statement PDF'}</span>
              <span className="text-[0.8rem] text-muted-foreground">CIB credit card statement, up to 5 MB</span>
              <input
                ref={inputRef}
                id="statement-file"
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={pending}
                onChange={(e) => chooseFile(e.target.files?.[0])}
              />
            </label>
            <Button
              type="button"
              onClick={() => void upload()}
              disabled={!file || pending || !account}
              className="h-11 w-full sm:h-10"
            >
              {pending ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : <Upload aria-hidden="true" />}
              {pending ? 'Importing…' : 'Import statement'}
            </Button>
          </div>

          {results && (
            <div role="status" className="space-y-2 rounded-xl border border-primary/30 bg-accent/40 p-4 text-sm">
              {results.map((r) => (
                <p key={r.period}>
                  <span className="font-medium">{formatStatementPeriod(r.period)}:</span> {describeImport(r)}
                </p>
              ))}
            </div>
          )}

          <section aria-labelledby="imported-statements" className="space-y-3">
            <h3 id="imported-statements" className="font-semibold">
              Imported
            </h3>
            {statements.isPending ? (
              <RowsSkeleton rows={2} />
            ) : statements.isError ? (
              <SectionError what="the statements" onRetry={() => void statements.refetch()} />
            ) : statements.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No statements yet.</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {statements.data.map((s) => (
                  <li key={s.id} className="space-y-1.5 px-4 py-3 text-sm">
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{formatStatementPeriod(s.period)}</span>
                      <span className="text-xs text-muted-foreground">{s.lineCount} lines</span>
                    </p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.8rem]">
                      <dt className="text-muted-foreground">Closing balance</dt>
                      <dd className="text-end tabular-nums">{formatMoney(s.closingBalance, 'EGP')}</dd>
                      <dt className="text-muted-foreground">Amount due</dt>
                      <dd className="text-end tabular-nums">
                        {formatMoney(s.totalDue, 'EGP')} by {formatCalendarDay(s.dueDate)}
                      </dd>
                      {s.minimumDue !== s.totalDue && (
                        <>
                          <dt className="text-muted-foreground">Minimum</dt>
                          <dd className="text-end tabular-nums">{formatMoney(s.minimumDue, 'EGP')}</dd>
                        </>
                      )}
                    </dl>
                    {s.unmatchedPayments > 0 && (
                      <p className="text-[0.8rem] text-muted-foreground">
                        {s.unmatchedPayments} card {s.unmatchedPayments === 1 ? 'payment' : 'payments'} with no matching
                        message.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
