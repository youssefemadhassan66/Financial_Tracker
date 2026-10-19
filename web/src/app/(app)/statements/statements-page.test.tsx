import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as clientModule from '@/lib/api/client';
import type { AccountDto, StatementFileDto } from '@/lib/api/types';
import StatementsPage from './page';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/statements',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    destroy: vi.fn(),
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }),
}));

const card: AccountDto = {
  id: 'acc-1',
  name: 'TEST Visa',
  type: 'credit_card',
  currency: 'EGP',
  last4s: ['1111'],
  isLiability: true,
  archived: false,
  available: null,
};

const file: StatementFileDto = {
  id: 'file-1',
  accountId: 'acc-1',
  fileName: 'Statement Sep.pdf',
  sizeBytes: 81_234,
  uploadedAt: '2026-10-19T18:00:00.000Z',
  periods: ['2026-09', '2026-08'],
};

describe('StatementsPage', () => {
  let files: StatementFileDto[];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    files = [file];
    spy = vi.spyOn(clientModule, 'apiFetch').mockImplementation(async <T,>(path: string, init?: clientModule.ApiFetchOptions): Promise<T> => {
      if (path === '/api/accounts') return { accounts: [card] } as unknown as T;
      if (path === '/api/statement-files' && !init?.method) return { files } as unknown as T;
      if (path === '/api/statement-files/file-1/content') return new Blob(['%PDF-1.4 fake']) as unknown as T;
      if (path === '/api/statement-files/file-1' && init?.method === 'DELETE') {
        files = [];
        return undefined as T;
      }
      return { statements: [] } as unknown as T;
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
        <StatementsPage />
      </QueryClientProvider>,
    );
  }

  it('lists kept PDFs under their card, with the months they cover', async () => {
    renderPage();
    const list = await screen.findByRole('list', { name: 'TEST Visa statements' });
    expect(within(list).getByText('August – September 2026')).toBeInTheDocument();
    expect(within(list).getByText(/Statement Sep\.pdf · 79 KB · uploaded/)).toBeInTheDocument();
  });

  it('opens a PDF inside the app', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Open August – September 2026' }));
    expect(await screen.findByRole('img', { name: 'Page 1 of 1' })).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith('/api/statement-files/file-1/content', { responseType: 'blob' });
  });

  it('deletes the copy only after confirming', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete August – September 2026 PDF' }));
    expect(spy).not.toHaveBeenCalledWith('/api/statement-files/file-1', { method: 'DELETE' });
    expect(screen.getByText(/the months imported from it and their transactions stay/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/statement-files/file-1', { method: 'DELETE' }));
    expect(await screen.findByText(/No statements yet\./)).toBeInTheDocument();
  });

  it('asks for a credit card when there is none', async () => {
    spy.mockImplementation(async <T,>(path: string): Promise<T> => {
      if (path === '/api/accounts') return { accounts: [] } as unknown as T;
      return { files: [] } as unknown as T;
    });
    renderPage();
    expect(await screen.findByText('Add a credit card first')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to accounts' })).toHaveAttribute('href', '/accounts');
  });
});
