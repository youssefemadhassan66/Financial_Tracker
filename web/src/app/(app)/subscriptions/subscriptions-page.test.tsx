import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as clientModule from '@/lib/api/client';
import type { SubscriptionDto, SubscriptionSuggestion, SubscriptionSummary } from '@/lib/api/types';
import SubscriptionsPage from './page';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const sub = (over: Partial<SubscriptionDto>): SubscriptionDto => ({
  id: 'sub-1',
  name: 'Test Stream',
  amount: '149.99',
  currency: 'EGP',
  cycle: 'monthly',
  anchorDate: '2026-08-10',
  status: 'active',
  nextChargeDate: '2099-11-10',
  monthlyEquivalent: '149.99',
  yearlyCost: '1799.88',
  categoryId: null,
  accountId: null,
  notes: null,
  lastCharge: null,
  priceChanged: false,
  missedCharge: null,
  ...over,
});

const summary: SubscriptionSummary = {
  asOf: '2026-10-19',
  activeCount: 1,
  totals: [{ currency: 'EGP', monthly: '149.99', yearly: '1799.88' }],
  upcoming: [],
};

const suggestion: SubscriptionSuggestion = {
  merchantKey: 'TEST GYM',
  name: 'Test Gym',
  amount: '500.00',
  currency: 'EGP',
  cycle: 'monthly',
  anchorDate: '2026-06-20',
  lastChargeDate: '2026-08-20',
  chargeCount: 3,
  accountId: null,
  transactionIds: ['t1', 't2', 't3'],
};

describe('SubscriptionsPage', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  let list: SubscriptionDto[];

  beforeEach(() => {
    list = [sub({}), sub({ id: 'sub-2', name: 'Test Paused', status: 'paused', nextChargeDate: null, priceChanged: false })];
    spy = vi.spyOn(clientModule, 'apiFetch').mockImplementation(async <T,>(path: string, init?: clientModule.ApiFetchOptions): Promise<T> => {
      if (path === '/api/subscriptions' && !init?.method) return { subscriptions: list } as unknown as T;
      if (path.startsWith('/api/subscriptions/summary')) return summary as unknown as T;
      if (path === '/api/subscriptions/suggestions') return { suggestions: [suggestion] } as unknown as T;
      if (path === '/api/accounts') return { accounts: [] } as unknown as T;
      if (init?.method === 'POST') return { subscription: sub({}) } as unknown as T;
      throw new Error(`Unhandled ${path}`);
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
        <SubscriptionsPage />
      </QueryClientProvider>,
    );
  }

  it('shows the monthly total and switches to yearly', async () => {
    renderPage();
    const hero = await screen.findByRole('region', { name: /Per month/ });
    expect(within(hero).getByText(/149\.99/)).toBeInTheDocument();
    fireEvent.click(within(hero).getByRole('radio', { name: 'Year' }));
    expect(within(hero).getByText(/1,799\.88/)).toBeInTheDocument();
  });

  it('pauses an active one and resumes a paused one with the right endpoints', async () => {
    renderPage();
    await screen.findByText('Test Paused');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/subscriptions/sub-1/pause', { method: 'POST' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/subscriptions/sub-2/resume', { method: 'POST' }));
  });

  it('asks before cancelling, because cancel is final', async () => {
    renderPage();
    await screen.findByText('Test Paused');
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel subscription' })[0]);
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('/cancel'), expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel it' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/subscriptions/sub-1/cancel', { method: 'POST' }));
  });

  it('tracks a suggestion with the edited name and merchant, never sending accountId: null', async () => {
    renderPage();
    const name = await screen.findByLabelText('Name');
    fireEvent.change(name, { target: { value: 'My gym' } });
    fireEvent.click(screen.getByRole('button', { name: 'Track it' }));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('/api/subscriptions', {
        method: 'POST',
        body: { name: 'My gym', amount: '500.00', currency: 'EGP', cycle: 'monthly', anchorDate: '2026-06-20', merchant: 'TEST GYM' },
      }),
    );
  });

  it('dismisses a suggestion by its merchant key', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Not a subscription' }));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('/api/subscriptions/suggestions/dismiss', { method: 'POST', body: { merchantKey: 'TEST GYM' } }),
    );
  });

  it('warns when the price changed', async () => {
    list = [sub({ priceChanged: true, lastCharge: { transactionId: 't', occurredAt: '2026-10-10T10:00:00Z', amount: '179.99', currency: 'EGP', original: null } })];
    renderPage();
    expect(await screen.findByText(/The price may have changed/)).toBeInTheDocument();
  });
});
