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
  fileId: 'file-1',
};

function pdfFile(name = 'statement.pdf') {
  return new File(['%PDF-1.4 fake'], name, { type: 'application/pdf' });
}

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    destroy: vi.fn(),
    promise: Promise.resolve({
      numPages: 2,
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }),
}));

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
            installmentPlans: { added: 1, alreadyKnown: 0 },
            fileId: 'file-1',
          } as unknown as T;
        }
        if (path === '/api/statement-files/file-1/content') return new Blob(['%PDF-1.4 fake']) as unknown as T;
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
        headers: { 'Content-Type': 'application/pdf', 'X-File-Name': 'statement.pdf' },
      }),
    );
    expect(await screen.findByText(/20 new transactions added\. 6 card payments have no matching message yet\./)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Statement imported');
    expect(screen.getByText(/1 installment plan added to Plans./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute('href', '/plans?tab=installments');
    for (const key of ['statements', 'statement-files', 'transactions', 'accounts', 'analytics', 'subscriptions', 'installments']) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
    expect(await screen.findByRole('button', { name: 'Open the September 2026 PDF' })).toBeInTheDocument();
  });

  it('opens a kept statement inside the app, fetched with the token', async () => {
    list = [imported];
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Open the September 2026 PDF' }));
    expect(await screen.findByRole('img', { name: 'Page 1 of 2' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Page 2 of 2' })).toBeInTheDocument();
    expect(screen.getByText(/2 pages. Only you can open this file./)).toBeInTheDocument();
    expect(apiFetchSpy).toHaveBeenCalledWith('/api/statement-files/file-1/content', { responseType: 'blob' });
  });

  it('shows the line count for a month whose PDF was not kept', async () => {
    list = [{ ...imported, fileId: null }];
    renderIt();
    expect(await screen.findByText('20 lines')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open the/ })).not.toBeInTheDocument();
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
