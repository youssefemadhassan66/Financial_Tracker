import { apiFetch } from './client';
import type {
  AccountDto,
  CardStatementView,
  CategoryAnalytics,
  CategoryRecord,
  DeviceDto,
  SubscriptionSummary,
  TransactionView,
} from './types';

/** Imported statements of one credit card account, newest first. */
export function statementsQuery(accountId: string) {
  return {
    queryKey: ['statements', accountId] as const,
    queryFn: () =>
      apiFetch<{ statements: CardStatementView[] }>(`/api/accounts/${encodeURIComponent(accountId)}/statements`).then(
        (r) => [...r.statements].sort((a, b) => b.period.localeCompare(a.period)),
      ),
  };
}

/** Phones that can send bank SMS. Holds only names and dates, never a key. */
export const devicesQuery = {
  queryKey: ['devices'] as const,
  queryFn: () => apiFetch<{ devices: DeviceDto[] }>('/api/devices').then((r) => r.devices),
};

/**
 * Read endpoints plus their TanStack Query keys. Keys start with the resource
 * name so a mutation can invalidate everything under it (e.g. ['transactions']).
 */

export const accountsQuery = {
  queryKey: ['accounts'] as const,
  queryFn: () => apiFetch<{ accounts: AccountDto[] }>('/api/accounts').then((r) => r.accounts),
};

export const categoriesQuery = {
  queryKey: ['categories'] as const,
  queryFn: () =>
    apiFetch<{ categories: CategoryRecord[] }>('/api/categories').then((r) => r.categories),
};

export function recentTransactionsQuery(limit: number) {
  return {
    queryKey: ['transactions', { limit }] as const,
    queryFn: () =>
      apiFetch<{ transactions: TransactionView[] }>(`/api/transactions?limit=${limit}`).then((r) => r.transactions),
  };
}

export interface TransactionsFilterParams {
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export function transactionsInfiniteQuery(filters: TransactionsFilterParams) {
  const limit = filters.limit ?? 50;
  return {
    queryKey: ['transactions', 'infinite', filters] as const,
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (filters.accountId) params.set('accountId', filters.accountId);
      if (filters.categoryId) params.set('categoryId', filters.categoryId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (pageParam) params.set('before', pageParam);

      const res = await apiFetch<{ transactions: TransactionView[] }>(
        `/api/transactions?${params.toString()}`,
      );
      return res.transactions;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: TransactionView[]) => {
      // Known backend limit: rows sharing the same occurredAt across a page
      // boundary can be skipped (docs/backend-requests/001, section 4).
      if (lastPage.length < limit) return undefined;
      return lastPage[lastPage.length - 1]?.occurredAt;
    },
  };
}

/** Spending per category and currency. No dates = the current Cairo month. */
export const categoryAnalyticsQuery = {
  queryKey: ['analytics', 'categories', 'current-month'] as const,
  queryFn: () => apiFetch<CategoryAnalytics>('/api/analytics/categories'),
};

export function categoryAnalyticsRangeQuery(from?: string, to?: string) {
  return {
    queryKey: ['analytics', 'categories', { from: from ?? null, to: to ?? null }] as const,
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
      return apiFetch<CategoryAnalytics>(`/api/analytics/categories${qs ? `?${qs}` : ''}`);
    },
  };
}

export function subscriptionSummaryQuery(days: number) {
  return {
    queryKey: ['subscriptions', 'summary', { days }] as const,
    queryFn: () => apiFetch<SubscriptionSummary>(`/api/subscriptions/summary?days=${days}`),
  };
}
