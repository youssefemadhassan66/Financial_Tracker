import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as clientModule from '@/lib/api/client';
import { AddTransactionSheet } from './add-transaction-sheet';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/transactions',
  useSearchParams: () => new URLSearchParams(),
}));

const mockAccounts = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'TEST Bank',
    type: 'checking' as const,
    currency: 'EGP' as const,
    last4s: ['1111'],
    isLiability: false,
    archived: false,
    available: null,
  },
];

const mockCategories = [
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'TEST Groceries',
    kind: 'spending' as const,
    icon: null,
    color: null,
    isSystem: false,
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'TEST Salary',
    kind: 'income' as const,
    icon: null,
    color: null,
    isSystem: false,
  },
];

describe('AddTransactionSheet', () => {
  let queryClient: QueryClient;
  let apiFetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    apiFetchSpy = vi
      .spyOn(clientModule, 'apiFetch')
      .mockImplementation(async <T,>(path: string, init?: clientModule.ApiFetchOptions): Promise<T> => {
        if (path === '/api/accounts') {
          return { accounts: mockAccounts } as unknown as T;
        }
        if (path === '/api/categories') {
          return { categories: mockCategories } as unknown as T;
        }
        if (path.startsWith('/api/transactions?')) {
          return { transactions: [] } as unknown as T;
        }
        if (path === '/api/transactions' && init?.method === 'POST') {
          return { id: '44444444-4444-4444-4444-444444444444' } as unknown as T;
        }
        throw new Error(`Unhandled apiFetch path: ${path}`);
      });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('Money in shows refund checkbox and toggles categories, and submitting sends correct body', async () => {
    const handleSuccess = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AddTransactionSheet open={true} onOpenChange={vi.fn()} onSuccess={handleSuccess} />
      </QueryClientProvider>,
    );

    // Wait for accounts and categories queries to resolve
    await waitFor(() => {
      expect(screen.getByText(/TEST Bank/)).toBeInTheDocument();
    });

    // Initial state is "Money out": "This is a refund" checkbox must not be visible
    expect(screen.queryByLabelText('This is a refund')).not.toBeInTheDocument();

    // Switch to "Money in"
    const moneyInRadio = screen.getByLabelText('Money in');
    fireEvent.click(moneyInRadio);

    // Now "This is a refund" checkbox must be shown
    const refundCheckbox = screen.getByLabelText('This is a refund');
    expect(refundCheckbox).toBeInTheDocument();
    expect(refundCheckbox).not.toBeChecked();

    // Opening Category select shows income categories (TEST Salary) and hides spending categories (TEST Groceries)
    const categoryTrigger = screen.getByLabelText(/Category/);
    fireEvent.click(categoryTrigger);
    expect(screen.getByText('TEST Salary')).toBeInTheDocument();
    expect(screen.queryByText('TEST Groceries')).not.toBeInTheDocument();

    // Enter amount with thousands comma
    const amountInput = screen.getByLabelText('Amount');
    fireEvent.change(amountInput, { target: { value: '1,500.50' } });

    // Submit as income (not refund)
    const submitBtn = screen.getByRole('button', { name: 'Add transaction' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiFetchSpy).toHaveBeenCalledWith(
        '/api/transactions',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            accountId: '11111111-1111-1111-1111-111111111111',
            amount: '1500.50',
            direction: 'credit',
            kind: 'income',
            countsAsSpending: false,
          }),
        }),
      );
    });

    expect(handleSuccess).toHaveBeenCalled();
  });

  it('Money in with refund checked sends kind=expense, direction=credit, countsAsSpending=true', async () => {
    const handleSuccess = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AddTransactionSheet open={true} onOpenChange={vi.fn()} onSuccess={handleSuccess} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/TEST Bank/)).toBeInTheDocument();
    });

    // Select Money in
    fireEvent.click(screen.getByLabelText('Money in'));

    // Check refund
    const refundCheckbox = screen.getByLabelText('This is a refund');
    fireEvent.click(refundCheckbox);
    expect(refundCheckbox).toBeChecked();

    // Fill amount and submit
    const amountInput = screen.getByLabelText('Amount');
    fireEvent.change(amountInput, { target: { value: '200' } });

    const submitBtn = screen.getByRole('button', { name: 'Add transaction' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiFetchSpy).toHaveBeenCalledWith(
        '/api/transactions',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            accountId: '11111111-1111-1111-1111-111111111111',
            amount: '200',
            direction: 'credit',
            kind: 'expense',
            countsAsSpending: true,
          }),
        }),
      );
    });
  });
});
