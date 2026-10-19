'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Wallet, X } from 'lucide-react';
import { DURATION_HIGHLIGHT, EASE_OUT_QUART } from '@/components/motion/motion-tokens';
import { staggerItemVariants } from '@/components/motion/stagger';
import { typeIcon, typeLabel } from '@/components/accounts/account-meta';
import { AddAccountSheet } from '@/components/accounts/add-account-sheet';
import { EditAccountSheet } from '@/components/accounts/edit-account-sheet';
import { StatementsSheet } from '@/components/accounts/statements-sheet';
import { EmptyState } from '@/components/empty-state';
import { LiveRegion } from '@/components/live-region';
import { PageHeader } from '@/components/page-header';
import { RowsSkeleton, SectionError } from '@/components/dashboard/section';
import { Button } from '@/components/ui/button';
import { accountsQuery } from '@/lib/api/finance';
import type { AccountDto } from '@/lib/api/types';
import { formatInstantDay, formatMoney } from '@/lib/format';

export default function AccountsPage() {
  const { data: accounts, isLoading, isError, refetch } = useQuery(accountsQuery);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editingAccount, setEditingAccount] = React.useState<AccountDto | null>(null);
  const [statementsAccount, setStatementsAccount] = React.useState<AccountDto | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = React.useState<string | null>(null);
  const [smsNotice, setSmsNotice] = React.useState(false);

  const announce = React.useCallback((msg: string) => {
    setLiveAnnouncement(msg);
    const t = setTimeout(() => setLiveAnnouncement(null), 3000);
    return () => clearTimeout(t);
  }, []);

  const visibleAccounts = React.useMemo(() => {
    return (accounts ?? []).filter((a) => !a.archived);
  }, [accounts]);

  const [prevAccounts, setPrevAccounts] = React.useState<AccountDto[]>([]);
  const [pendingAccountMutation, setPendingAccountMutation] = React.useState(false);
  const [newlyAddedAccountIds, setNewlyAddedAccountIds] = React.useState<ReadonlySet<string>>(new Set());

  if (visibleAccounts !== prevAccounts) {
    setPrevAccounts(visibleAccounts);
    if (pendingAccountMutation) {
      setPendingAccountMutation(false);
      const prevIds = new Set(prevAccounts.map((a) => a.id));
      const added = new Set<string>();
      for (const a of visibleAccounts) {
        if (!prevIds.has(a.id)) {
          added.add(a.id);
        }
      }
      setNewlyAddedAccountIds(added);
    }
  }

  const egpAccounts = React.useMemo(() => {
    return visibleAccounts.filter((a) => a.currency === 'EGP');
  }, [visibleAccounts]);

  const usdAccounts = React.useMemo(() => {
    return visibleAccounts.filter((a) => a.currency === 'USD');
  }, [visibleAccounts]);

  const renderAccountGroup = (title: string, currencyAccounts: AccountDto[], startIndex: number) => {
    if (currencyAccounts.length === 0) return null;

    return (
      <section
        key={title}
        aria-label={title}
        className="rounded-2xl border bg-card"
      >
        <div className="flex items-center justify-between border-b px-5 py-3.5 sm:px-6">
          <h2 className="text-base font-semibold">{title}</h2>
          <span className="text-xs text-muted-foreground">
            {currencyAccounts.length} {currencyAccounts.length === 1 ? 'account' : 'accounts'}
          </span>
        </div>
        <ul className="divide-y">
          {currencyAccounts.map((account, i) => {
            const Icon = typeIcon[account.type];
            const globalIndex = startIndex + i;
            const staggerIndex = globalIndex < 10 ? globalIndex : undefined;
            const isNew = newlyAddedAccountIds.has(account.id);

            return (
              <motion.li
                key={account.id}
                custom={staggerIndex}
                variants={staggerIndex !== undefined ? staggerItemVariants : undefined}
                initial={staggerIndex !== undefined ? 'hidden' : undefined}
                animate={staggerIndex !== undefined ? 'visible' : undefined}
                className="relative flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                {isNew && (
                  <motion.div
                    aria-hidden="true"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: DURATION_HIGHLIGHT, ease: EASE_OUT_QUART }}
                    className="pointer-events-none absolute inset-0 bg-accent"
                  />
                )}
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-sm text-foreground">{account.name}</p>
                      {account.isLiability && (
                        // Neutral on purpose: owing on a card is normal, not an error (PRODUCT.md).
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[0.75rem] font-medium text-muted-foreground">
                          Balance is what you owe
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{typeLabel[account.type]}</span>
                      {account.last4s.length > 0 && (
                        <>
                          <span>·</span>
                          <div className="inline-flex flex-wrap gap-1">
                            {account.last4s.map((d) => (
                              <span
                                key={d}
                                className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[0.75rem] text-foreground"
                              >
                                •• {d}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 pt-1 sm:justify-end sm:pt-0">
                  <div className="text-start sm:text-end">
                    {account.available ? (
                      <>
                        <p className="font-medium text-sm tabular-nums">
                          {formatMoney(account.available.amount, account.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {account.isLiability ? 'available credit, ' : 'available, '}
                          reported {formatInstantDay(account.available.reportedAt)}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">No balance yet</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {account.type === 'credit_card' && (
                      <Button variant="outline" size="sm" onClick={() => setStatementsAccount(account)}>
                        Statements
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setEditingAccount(account)}>
                      Edit
                    </Button>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <div className="space-y-8">
      <LiveRegion message={liveAnnouncement} />

      <PageHeader
        title="Accounts"
        description="Your cards and bank accounts, each with its available balance."
        actions={
          <Button onClick={() => setAddOpen(true)} className="h-11 sm:h-10">
            Add account
          </Button>
        }
      />

      {smsNotice && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-primary/25 bg-accent/70 p-4 text-sm text-accent-foreground"
        >
          <p>
            New digits only apply to new messages. To re-read older ones, run{' '}
            <Link
              href="/sms"
              className="font-medium underline underline-offset-4 hover:text-foreground"
            >
              Reprocess in the SMS inbox
            </Link>
            .
          </p>
          <button
            type="button"
            onClick={() => setSmsNotice(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss message"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="rounded-2xl border bg-card pt-6">
          <RowsSkeleton rows={4} />
        </div>
      ) : isError ? (
        <div className="rounded-2xl border bg-card py-6">
          <SectionError what="accounts" onRetry={() => refetch()} />
        </div>
      ) : visibleAccounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Add your first card or bank account"
          action={
            <Button onClick={() => setAddOpen(true)} className="h-11 sm:h-10">
              Add account
            </Button>
          }
        >
          Add a card or bank account with the last 4 digits its SMS use, and every matching message
          lands in the right place.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {renderAccountGroup('Egyptian pound accounts', egpAccounts, 0)}
          {renderAccountGroup('US dollar accounts', usdAccounts, egpAccounts.length)}
        </div>
      )}

      <AddAccountSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          setPendingAccountMutation(true);
          announce('Account created');
          toast.success('Account added');
        }}
      />

      <StatementsSheet
        account={statementsAccount}
        open={statementsAccount !== null}
        onOpenChange={(open) => {
          if (!open) setStatementsAccount(null);
        }}
      />

      <EditAccountSheet
        account={editingAccount}
        open={editingAccount !== null}
        onOpenChange={(open) => {
          if (!open) setEditingAccount(null);
        }}
        onSuccess={(digitsAdded) => {
          if (editingAccount) {
            setNewlyAddedAccountIds(new Set([editingAccount.id]));
          }
          announce('Account updated');
          toast.success('Account updated');
          if (digitsAdded) {
            setSmsNotice(true);
          }
        }}
      />
    </div>
  );
}
