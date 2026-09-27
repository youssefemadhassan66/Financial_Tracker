import { CalendarClock, CircleAlert, FileText } from 'lucide-react';
import { formatMoney } from '@/lib/format';

// Small, real-looking UI fragments for the feature rows. FAKE data only.
// Decorative: each sits next to copy that says the same thing in words.

export function CurrenciesVisual() {
  return (
    <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2">
      {[
        { currency: 'EGP' as const, total: '8450.00', note: '12 categories' },
        { currency: 'USD' as const, total: '134.99', note: '2 categories' },
      ].map((c) => (
        <div key={c.currency} className="rounded-2xl border bg-card p-5">
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">{c.currency}</span>
          <p className="mt-4 text-xs text-muted-foreground">Spent this month</p>
          <p className="mt-1 font-heading text-2xl font-semibold tracking-tight">{formatMoney(c.total, c.currency)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{c.note}</p>
        </div>
      ))}
      <p className="text-center text-xs text-muted-foreground sm:col-span-2">Two totals. Never one blended number.</p>
    </div>
  );
}

export function StatementVisual() {
  const rows = [
    { label: 'Matched to your SMS', value: '25' },
    { label: 'Added (fees, cashback)', value: '4' },
    { label: 'Foreign charges priced in EGP', value: '2' },
  ];
  return (
    <div aria-hidden="true" className="rounded-2xl border bg-card">
      <div className="flex items-center gap-3 border-b p-5">
        <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
          <FileText className="size-5" />
        </span>
        <div>
          <p className="text-sm font-medium">Test Visa statement, July</p>
          <p className="text-xs text-muted-foreground">Imported just now</p>
        </div>
      </div>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between px-5 py-3 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-semibold tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SubscriptionsVisual() {
  return (
    <div aria-hidden="true" className="space-y-3">
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
        <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
          <CalendarClock className="size-4" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium">Test Stream</p>
          <p className="text-xs text-muted-foreground">Monthly · next on 5 Oct</p>
        </div>
        <p className="text-sm font-medium tabular-nums">{formatMoney('149.99', 'EGP')}</p>
      </div>
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
        <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
          <CalendarClock className="size-4" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium">Test Gym</p>
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-foreground">
            <CircleAlert className="size-3" />
            Price went from EGP 450.00
          </p>
        </div>
        <p className="text-sm font-medium tabular-nums">{formatMoney('500.00', 'EGP')}</p>
      </div>
      <div className="rounded-2xl border border-dashed p-4 text-sm">
        <p className="font-medium">Looks like a subscription: TEST CLOUD</p>
        <p className="mt-0.5 text-xs text-muted-foreground">3 charges of USD 2.99, monthly. Track it?</p>
      </div>
    </div>
  );
}
