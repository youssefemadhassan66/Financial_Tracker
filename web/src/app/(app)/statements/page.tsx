'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, Upload } from 'lucide-react';
import { StatementsSheet } from '@/components/accounts/statements-sheet';
import { RowsSkeleton, SectionError } from '@/components/dashboard/section';
import { EmptyState } from '@/components/empty-state';
import { FadeIn } from '@/components/motion/fade-in';
import { PageHeader } from '@/components/page-header';
import { PdfViewerSheet, type PdfViewerFile } from '@/components/statements/pdf-viewer-sheet';
import { StatementFileRow } from '@/components/statements/statement-file-row';
import { Button, buttonVariants } from '@/components/ui/button';
import { accountsQuery, statementFilesQuery } from '@/lib/api/finance';
import type { AccountDto, StatementFileDto } from '@/lib/api/types';
import { cn } from '@/lib/utils';

export default function StatementsPage() {
  const accounts = useQuery(accountsQuery);
  const files = useQuery(statementFilesQuery);
  const [uploadTo, setUploadTo] = React.useState<AccountDto | null>(null);
  const [viewing, setViewing] = React.useState<PdfViewerFile | null>(null);

  const cards = (accounts.data ?? []).filter((a) => a.type === 'credit_card' && !a.archived);
  const byAccount = new Map<string, StatementFileDto[]>();
  for (const file of files.data ?? []) {
    byAccount.set(file.accountId, [...(byAccount.get(file.accountId) ?? []), file]);
  }
  // Cards first, then any account that only has old files (an archived card).
  const groups = [
    ...cards.map((card) => ({ account: card, files: byAccount.get(card.id) ?? [] })),
    ...(accounts.data ?? [])
      .filter((a) => !cards.includes(a) && byAccount.has(a.id))
      .map((a) => ({ account: a, files: byAccount.get(a.id)! })),
  ];

  const pending = accounts.isPending || files.isPending;
  const failed = accounts.isError || files.isError;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your"
        titleAccent="statements"
        description="Every statement PDF you imported, kept so you can open it again."
      />

      {pending ? (
        <div className="rounded-2xl border bg-card pt-5">
          <RowsSkeleton rows={3} />
        </div>
      ) : failed ? (
        <div className="rounded-2xl border bg-card pt-5">
          <SectionError
            what="your statements"
            onRetry={() => {
              void accounts.refetch();
              void files.refetch();
            }}
          />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Add a credit card first"
          action={
            <Link href="/accounts" className={cn(buttonVariants(), 'h-10')}>
              Go to accounts
            </Link>
          }
        >
          Statements belong to a credit card. Add your card with its last 4 digits, then import its monthly PDF here.
        </EmptyState>
      ) : (
        <FadeIn className="space-y-6">
          {groups.map(({ account, files: list }) => (
            <section key={account.id} aria-labelledby={`card-${account.id}`} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id={`card-${account.id}`} className="text-lg font-bold">
                  {account.name}
                  {account.last4s.length > 0 && (
                    <span className="ms-2 text-sm font-normal text-muted-foreground">•••• {account.last4s[0]}</span>
                  )}
                </h2>
                {cards.includes(account) && (
                  <Button variant="outline" className="h-10 gap-1.5" onClick={() => setUploadTo(account)}>
                    <Upload aria-hidden="true" />
                    Import a statement
                  </Button>
                )}
              </div>
              {list.length === 0 ? (
                <p className="rounded-2xl border border-dashed px-5 py-6 text-sm text-muted-foreground">
                  No statements yet. Download the monthly PDF from your bank and import it: it adds fees, foreign
                  charges in EGP and installment plans the SMS missed.
                </p>
              ) : (
                <ul className="divide-y overflow-hidden rounded-2xl border bg-card" aria-label={`${account.name} statements`}>
                  {list.map((file) => (
                    <li key={file.id}>
                      <StatementFileRow file={file} onOpen={(f) => setViewing({ id: f.id, fileName: f.fileName })} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </FadeIn>
      )}

      <StatementsSheet account={uploadTo} open={uploadTo !== null} onOpenChange={(next) => !next && setUploadTo(null)} />
      <PdfViewerSheet file={viewing} open={viewing !== null} onOpenChange={(next) => !next && setViewing(null)} />
    </div>
  );
}
