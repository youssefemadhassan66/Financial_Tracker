import type { BillingCycle, SubscriptionDto } from './api/types';

export const CYCLES: readonly { value: BillingCycle; label: string; per: string }[] = [
  { value: 'weekly', label: 'Weekly', per: 'a week' },
  { value: 'monthly', label: 'Monthly', per: 'a month' },
  { value: 'quarterly', label: 'Every 3 months', per: 'every 3 months' },
  { value: 'yearly', label: 'Yearly', per: 'a year' },
];

/** "monthly" -> "a month", for "EGP 149.99 a month". */
export function perCycle(cycle: BillingCycle): string {
  return CYCLES.find((c) => c.value === cycle)?.per ?? cycle;
}

export interface GroupedSubscriptions {
  active: SubscriptionDto[];
  paused: SubscriptionDto[];
  cancelled: SubscriptionDto[];
}

/** Active ones by next charge (soonest first), the rest by name. */
export function groupSubscriptions(list: readonly SubscriptionDto[]): GroupedSubscriptions {
  const byName = (a: SubscriptionDto, b: SubscriptionDto) => a.name.localeCompare(b.name);
  const active = list
    .filter((s) => s.status === 'active')
    .sort((a, b) => (a.nextChargeDate ?? '9999').localeCompare(b.nextChargeDate ?? '9999') || byName(a, b));
  return {
    active,
    paused: list.filter((s) => s.status === 'paused').sort(byName),
    cancelled: list.filter((s) => s.status === 'cancelled').sort(byName),
  };
}

/** Whole days from `today` to `day` (both "YYYY-MM-DD"), as calendar dates. */
export function daysUntil(day: string, today: string): number {
  const toUtc = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  return Math.round((toUtc(day) - toUtc(today)) / 86_400_000);
}

/** "today", "tomorrow", "in 5 days", or null when 7+ days away or past. */
export function dueSoonLabel(day: string, today: string): string | null {
  const n = daysUntil(day, today);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 1 && n < 7) return `in ${n} days`;
  return null;
}
