import { CalendarClock, CreditCard, Landmark, PiggyBank, Wallet } from 'lucide-react';
import type { AccountDto, AccountType, SubscriptionSummary } from '@/lib/api/types';
import { formatCalendarDay, formatInstantDay, formatMoney } from '@/lib/format';

/** Subscription charges due soon, soonest first. */
export function UpcomingList({ summary }: { summary: SubscriptionSummary }) {
  if (summary.upcoming.length === 0) {
    return (
      <p className="px-5 pb-5 text-sm text-muted-foreground sm:px-6">
        No subscription charges due in the next 30 days.
      </p>
    );
  }
  return (
    <ul className="divide-y border-t">
      {summary.upcoming.map((u) => (
        <li key={`${u.subscriptionId}-${u.date}`} className="flex items-center gap-3 px-5 py-3 sm:px-6">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <CalendarClock className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{u.name}</p>
            <p className="text-xs text-muted-foreground">{formatCalendarDay(u.date)}</p>
          </div>
          <p className="shrink-0 text-sm font-medium tabular-nums">{formatMoney(u.amount, u.currency)}</p>
        </li>
      ))}
    </ul>
  );
}

const typeLabel: Record<AccountType, string> = {
  checking: 'Current account',
  savings: 'Savings',
  cash: 'Cash',
  wallet: 'Wallet',
  credit_card: 'Credit card',
  brokerage: 'Brokerage',
};

const typeIcon: Record<AccountType, typeof Wallet> = {
  checking: Landmark,
  savings: PiggyBank,
  cash: Wallet,
  wallet: Wallet,
  credit_card: CreditCard,
  brokerage: Landmark,
};

/** Accounts with the balance the bank last reported by SMS (if any). */
export function AccountsList({ accounts }: { accounts: AccountDto[] }) {
  const visible = accounts.filter((a) => !a.archived);
  if (visible.length === 0) {
    return <p className="px-5 pb-5 text-sm text-muted-foreground sm:px-6">No accounts yet.</p>;
  }
  return (
    <ul className="divide-y border-t">
      {visible.map((a) => {
        const Icon = typeIcon[a.type];
        const digits = a.last4s.length > 0 ? ` · ${a.last4s.map((d) => `•• ${d}`).join(', ')}` : '';
        return (
          <li key={a.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{a.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {typeLabel[a.type]}
                {digits}
              </p>
            </div>
            <div className="shrink-0 text-end">
              {a.available ? (
                <>
                  <p className="text-sm font-medium tabular-nums">{formatMoney(a.available.amount, a.currency)}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.isLiability ? 'available credit' : 'available'}, {formatInstantDay(a.available.reportedAt)}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {a.currency}
                  <br />
                  no balance yet
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
