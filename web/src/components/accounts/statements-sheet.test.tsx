import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as clientModule from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { AccountDto, CardStatementView } from '@/lib/api/types';
import { StatementsSheet } from './statements-sheet';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const card: AccountDto = {
  id: 'acc-1',
  name: 'TEST Card',
  type: 'credit_card',
  currency: 'EGP',
  last4s: ['1111'],
  isLiability: true,
  archived: false,
  available: null,
};

const imported: CardStatementView = {
  id: 'st-1',
  period: '2026-09',
  dueDate: '2026-10-10',
  creditLimit: '25000.00',
  availableCredit: '21000.00',
  totalDue: '900.00',
  minimumDue: '900.00',
  openingBalance: '5000.00',
  closingBalance: '4000.00',
  lineCount: 20,
  unmatchedPayments: 0,
  importedAt: '2026-10-04T12:00:00.000Z',
};

function pdfFile(name = 'statement.pdf') {
  return new File(['%PDF-1.4 fake'], name, { type: 'application/pdf' });
}

describe('StatementsSheet', () => {
  let client: QueryClient;
  let list: CardStatementView[];
  let apiFetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    list = [];
    apiFetchSpy = vi
      .spyOn(clientModule, 'apiFetch')
      .mockImplementation(async <T,>(path: string, init?: clientModule.ApiFetchOptions): Promise<T> => {
        if (path === '/api/accounts/acc-1/statements' && !init?.method) return { statements: list } as unknown as T;
        if (path === '/api/accounts/acc-1/statements' && init?.method === 'POST') {
          list = [imported];
          return {
            statements: [{ period: '2026-09', status: 'imported', confirmed: 0, created: 20, unmatchedPayments: 6, pricedSms: 0 }],
          } as unknown as T;
        }
        throw new Error(`Unhandled apiFetch path: ${path}`);
      });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.mocked(toast.success).mockClear();
  });

  function renderIt(account: AccountDto = card) {
    return render(
      <QueryClientProvider client={client}>
        <StatementsSheet account={account} open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
  }

  it('uploads the PDF bytes with the PDF content type, then shows the result and the new statement', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderIt();
    await screen.findByText('No statements yet.');

    const file = pdfFile();
    fireEvent.change(screen.getByLabelText(/Choose statement PDF/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Import statement' }));

    await waitFor(() =>
      expect(apiFetchSpy).toHaveBeenCalledWith('/api/accounts/acc-1/statements', {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': 'application/pdf' },
      }),
    );
    expect(await screen.findByText(/20 new transactions added\. 6 card payments have no matching message yet\./)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Statement imported');
    for (const key of ['statements', 'transactions', 'accounts', 'analytics', 'subscriptions']) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
    expect(await screen.findByText('20 lines')).toBeInTheDocument();
    expect(screen.getByText('September 2026', { selector: 'span' })).toBeInTheDocument();
  });

  it('refuses a non-PDF before uploading', async () => {
    renderIt();
    await screen.findByText('No statements yet.');
    fireEvent.change(screen.getByLabelText(/Choose statement PDF/), {
      target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose the statement as a PDF file.');
    expect(screen.getByRole('button', { name: 'Import statement' })).toBeDisabled();
    expect(apiFetchSpy).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'POST' }));
  });

  it('shows the server reason when the import is refused', async () => {
    apiFetchSpy.mockImplementation(async <T,>(path: string, init?: clientModule.ApiFetchOptions): Promise<T> => {
      if (init?.method === 'POST') {
        throw new ApiError(422, 'DOMAIN_ERROR', 'This statement is for the card ending 2222, which is not one of this account’s card digits');
      }
      return { statements: [] } as unknown as T;
    });
    renderIt();
    await screen.findByText('No statements yet.');
    fireEvent.change(screen.getByLabelText(/Choose statement PDF/), { target: { files: [pdfFile()] } });
    fireEvent.click(screen.getByRole('button', { name: 'Import statement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('card ending 2222');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('tells the user to add card digits when the account has none', async () => {
    renderIt({ ...card, last4s: [] });
    expect(screen.getByRole('note')).toHaveTextContent('Add this card’s last 4 digits first');
  });
});
