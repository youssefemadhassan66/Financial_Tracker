import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as clientModule from '@/lib/api/client';
import type { CategoryAnalytics } from '@/lib/api/types';
import AnalyticsPage from './page';

let mockSearchParams = new URLSearchParams();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: (url: string) => {
      mockReplace(url);
      const query = url.split('?')[1] ?? '';
      mockSearchParams = new URLSearchParams(query);
    },
  }),
  usePathname: () => '/analytics',
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'test@example.com',
      defaultCurrency: 'EGP' as const,
    },
  }),
}));

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  };
});

const mockAnalyticsData: CategoryAnalytics = {
  period: { from: '2026-09-01', to: '2026-09-30' },
  previousPeriod: { from: '2026-08-02', to: '2026-08-31' },
  timeZone: 'Africa/Cairo',
  currencies: [
    {
      currency: 'EGP',
      spending: {
        total: '8450.00',
        previousTotal: '7900.00',
        changePercent: 7,
        categories: [
          {
            categoryId: '22222222-2222-2222-2222-222222222222',
            name: 'TEST Groceries',
            icon: null,
            total: '5000.00',
            share: 59.2,
            count: 10,
            previousTotal: '4000.00',
            changePercent: 25,
          },
          {
            categoryId: null,
            name: 'Uncategorized',
            icon: null,
            total: '3450.00',
            share: 40.8,
            count: 5,
            previousTotal: '3900.00',
            changePercent: -11.5,
          },
        ],
      },
      income: { total: '20000.00', count: 1 },
      investing: { invested: '0.00', withdrawn: '0.00', net: '0.00', count: 0 },
    },
    {
      currency: 'USD',
      spending: {
        total: '150.00',
        previousTotal: '100.00',
        changePercent: 50,
        categories: [
          {
            categoryId: '33333333-3333-3333-3333-333333333333',
            name: 'TEST Streaming',
            icon: null,
            total: '150.00',
            share: 100,
            count: 2,
            previousTotal: '100.00',
            changePercent: 50,
          },
        ],
      },
      income: { total: '0.00', count: 0 },
      investing: { invested: '0.00', withdrawn: '0.00', net: '0.00', count: 0 },
    },
  ],
};

describe('AnalyticsPage component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
    mockSearchParams = new URLSearchParams('from=2026-09-01&to=2026-09-30');
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.spyOn(clientModule, 'apiFetch').mockImplementation(async () => {
      // Return mock data for analytics
      return mockAnalyticsData as never;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders category links with the right query strings and keeps data visible when switching currency', async () => {
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AnalyticsPage />
      </QueryClientProvider>,
    );

    // Initial render displays EGP spending data
    await waitFor(() => {
      expect(screen.getAllByText('TEST Groceries').length).toBeGreaterThan(0);
    });

    // Check category link query string for categorized row
    const groceriesLink = screen.getByRole('link', { name: /TEST Groceries/i });
    expect(groceriesLink).toHaveAttribute(
      'href',
      '/transactions?categoryId=22222222-2222-2222-2222-222222222222&from=2026-09-01&to=2026-09-30',
    );

    // Check category link query string for Uncategorized row (without categoryId)
    const uncategorizedLink = screen.getByRole('link', { name: /Uncategorized/i });
    expect(uncategorizedLink).toHaveAttribute(
      'href',
      '/transactions?from=2026-09-01&to=2026-09-30',
    );

    // Click USD currency button
    const usdButton = screen.getByRole('radio', { name: 'USD' });
    fireEvent.click(usdButton);

    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('currency=USD'));

    // Re-render with new URL parameter
    rerender(
      <QueryClientProvider client={queryClient}>
        <AnalyticsPage />
      </QueryClientProvider>,
    );

    // Verify USD data appears and no skeleton flashes
    await waitFor(() => {
      expect(screen.getAllByText('TEST Streaming').length).toBeGreaterThan(0);
    });

    // Verify USD category link
    const streamingLink = screen.getByRole('link', { name: /TEST Streaming/i });
    expect(streamingLink).toHaveAttribute(
      'href',
      '/transactions?categoryId=33333333-3333-3333-3333-333333333333&from=2026-09-01&to=2026-09-30',
    );
  });
});
