import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as clientModule from '@/lib/api/client';
import type { BudgetsView, InstallmentsView } from '@/lib/api/types';
import PlansPage from './page';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/plans',
  useSearchParams: () => new URLSearchParams(search),
}));

const budgets: BudgetsView = {
  month: '2026-10',
  period: { from: '2026-10-01', to: '2026-10-31' },
  daysLeft: 13,
  budgets: [
    { categoryId: 'c-t', categoryName: 'Transport', currency: 'EGP', limit: '200.00', spent: '260.00', remaining: '-60.00', percentUsed: 130, state: 'over' },
    { categoryId: 'c-g', categoryName: 'Groceries', currency: 'EGP', limit: '500.00', spent: '400.00', remaining: '100.00', percentUsed: 80, state: 'near' },
  ],
};

const installments: InstallmentsView = {
  plans: [
    {
      id: 'p1', name: 'TEST Phone', provider: 'TEST Pay', installmentAmount: '750.00', currency: 'EGP', totalInstallments: 6,
      paidInstallments: 3, firstDueDate: '2026-08-11', nextDueDate: '2099-11-11', endDate: '2100-01-11', totalCost: '4500.00',
      remainingAmount: '2250.00', status: 'active', accountId: null,
    },
  ],
  totals: [{ currency: 'EGP', monthly: '750.00', remaining: '2250.00' }],
};

describe('PlansPage', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    search = '';
    spy = vi.spyOn(clientModule, 'apiFetch').mockImplementation(async <T,>(path: string, init?: clientModule.ApiFetchOptions): Promise<T> => {
      if (path === '/api/budgets' && !init?.method) return budgets as unknown as T;
      if (path === '/api/installments' && !init?.method) return installments as unknown as T;
      if (path === '/api/categories') return { categories: [] } as unknown as T;
      if (path === '/api/accounts') return { accounts: [] } as unknown as T;
      if (path === '/api/installments' && init?.method === 'POST') return { plan: installments.plans[0] } as unknown as T;
      return undefined as T;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <PlansPage />
      </QueryClientProvider>,
    );
  }

  it('says calmly when a budget is over, and how much is left otherwise', async () => {
    renderPage();
    const transport = await screen.findByRole('article', { name: 'Transport budget' });
    expect(within(transport).getByText('Over the limit')).toBeInTheDocument();
    expect(within(transport).getByText(/Over by EGP\s60\.00/)).toBeInTheDocument();
    const groceries = screen.getByRole('article', { name: 'Groceries budget' });
    expect(within(groceries).getByText('Near the limit')).toBeInTheDocument();
    expect(within(groceries).getByText(/EGP\s100\.00 left/)).toBeInTheDocument();
    expect(screen.getByText('October: 13 days left')).toBeInTheDocument();
  });

  it('changes a limit with the budget currency', async () => {
    renderPage();
    const card = await screen.findByRole('article', { name: 'Groceries budget' });
    fireEvent.click(within(card).getByRole('button', { name: 'Change limit' }));
    fireEvent.change(within(card).getByLabelText('Monthly limit (EGP)'), { target: { value: '1,200' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('/api/budgets/c-g', { method: 'PUT', body: { currency: 'EGP', limit: '1200' } }),
    );
  });

  it('asks before stopping a budget', async () => {
    renderPage();
    const card = await screen.findByRole('article', { name: 'Transport budget' });
    fireEvent.click(within(card).getByRole('button', { name: 'Stop budget' }));
    expect(spy).not.toHaveBeenCalledWith('/api/budgets/c-t', { method: 'DELETE' });
    fireEvent.click(within(card).getByRole('button', { name: 'Stop it' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/budgets/c-t', { method: 'DELETE' }));
  });

  it('shows installment progress and the monthly total', async () => {
    search = 'tab=installments';
    renderPage();
    expect(await screen.findByText('TEST Pay · 3 of 6 paid')).toBeInTheDocument();
    const hero = screen.getByRole('region', { name: /Each month/ });
    expect(within(hero).getByText(/750\.00/)).toBeInTheDocument();
    expect(within(hero).getByText(/2,250\.00 left to pay/)).toBeInTheDocument();
  });

  it('adds a plan, leaving out empty optional fields and sending the count as a number', async () => {
    search = 'tab=installments';
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a plan' }));
    fireEvent.change(screen.getByLabelText('What you bought'), { target: { value: 'TEST Fridge' } });
    fireEvent.change(screen.getByLabelText('Each payment'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Number of payments'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('First payment'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add plan' }));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('/api/installments', {
        method: 'POST',
        body: { name: 'TEST Fridge', installmentAmount: '500', currency: 'EGP', totalInstallments: 12, firstDueDate: '2026-11-01' },
      }),
    );
  });

  it('removes a plan only after confirming', async () => {
    search = 'tab=installments';
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove it' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/installments/p1/cancel', { method: 'POST' }));
  });
});
