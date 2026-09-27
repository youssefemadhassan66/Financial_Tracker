import { apiFetch } from './client';
import type {
  AccountDto,
  CategoryAnalytics,
  SubscriptionSummary,
  TransactionView,
} from './types';

/**
 * Read endpoints plus their TanStack Query keys. Keys start with the resource
 * name so a mutation can invalidate everything under it (e.g. ['transactions']).
 */

export const accountsQuery = {
  queryKey: ['accounts'] as const,
  queryFn: () => apiFetch<{ accounts: AccountDto[] }>('/api/accounts').then((r) => r.accounts),
};

export function recentTransactionsQuery(limit: number) {
  return {
    queryKey: ['transactions', { limit }] as const,
    queryFn: () =>
      apiFetch<{ transactions: TransactionView[] }>(`/api/transactions?limit=${limit}`).then((r) => r.transactions),
  };
}

/** Spending per category and currency. No dates = the current Cairo month. */
export const categoryAnalyticsQuery = {
  queryKey: ['analytics', 'categories', 'current-month'] as const,
  queryFn: () => apiFetch<CategoryAnalytics>('/api/analytics/categories'),
};

export function subscriptionSummaryQuery(days: number) {
  return {
    queryKey: ['subscriptions', 'summary', { days }] as const,
    queryFn: () => apiFetch<SubscriptionSummary>(`/api/subscriptions/summary?days=${days}`),
  };
}
