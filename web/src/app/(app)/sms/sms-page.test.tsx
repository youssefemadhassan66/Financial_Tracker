import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as clientModule from '@/lib/api/client';
import type { RawMessageView } from '@/lib/api/types';
import SmsInboxPage from './page';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const msg = (id: string, status: RawMessageView['status'], body: string): RawMessageView => ({
  id,
  userId: 'u',
  sender: 'TESTBANK',
  body,
  receivedAt: '2026-09-11T12:16:00.000Z',
  status,
  parsedPayload: null,
  parseError: null,
  transactionId: status === 'parsed' ? 'tx' : null,
});

describe('SmsInboxPage', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(clientModule, 'apiFetch').mockImplementation(async <T,>(path: string, init?: clientModule.ApiFetchOptions): Promise<T> => {
      if (path.startsWith('/api/sms?')) {
        return {
          messages: [
            msg('m1', 'parsed', 'TEST purchase EGP 10.00'),
            msg('m2', 'awaiting_pair', 'TEST money sent from account 2222'),
            msg('m3', 'awaiting_pair', 'TEST payment received on card 1111'),
          ],
        } as unknown as T;
      }
      if (path === '/api/sms/pair') return { transferGroupId: 'g', transactionIds: ['a', 'b'] } as unknown as T;
      if (path === '/api/sms/reprocess') {
        const after = (init?.body as { after?: string })?.after;
        return {
          processed: after ? 5 : 200, parsed: after ? 2 : 150, unparsed: 0, ignored: 0, awaitingPair: 0, awaitingStatement: 0,
          next: after ? null : 'm200',
        } as unknown as T;
      }
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
        <SmsInboxPage />
      </QueryClientProvider>,
    );
  }

  it('opens on "Needs you" with only the messages that need the user', async () => {
    renderPage();
    expect(await screen.findByRole('radio', { name: 'Needs you 2' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('TEST purchase EGP 10.00')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'All 3' }));
    expect(screen.getByText('TEST purchase EGP 10.00')).toBeInTheDocument();
  });

  it('pairs two halves, sending the chosen one as the debit', async () => {
    renderPage();
    await screen.findByText('TEST money sent from account 2222');
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    // The user says the second message is the money leaving.
    const radios = screen.getAllByRole('radio', { name: /TESTBANK/ });
    fireEvent.click(radios[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Pair them' }));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('/api/sms/pair', { method: 'POST', body: { debitMessageId: 'm3', paymentMessageId: 'm2' } }),
    );
  });

  it('does not pair until the user says which one is the debit', async () => {
    renderPage();
    await screen.findByText('TEST money sent from account 2222');
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Pair them' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose which message is the money leaving.');
    expect(spy).not.toHaveBeenCalledWith('/api/sms/pair', expect.anything());
  });

  it('re-reads every page of messages', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Re-read messages' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/sms/reprocess', { method: 'POST', body: { after: 'm200' } }));
    expect(spy).toHaveBeenCalledWith('/api/sms/reprocess', { method: 'POST', body: {} });
  });
});
