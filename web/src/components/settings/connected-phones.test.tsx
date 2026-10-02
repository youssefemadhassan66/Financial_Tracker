import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as clientModule from '@/lib/api/client';
import type { DeviceDto } from '@/lib/api/types';
import { ConnectedPhones } from './connected-phones';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('ConnectedPhones', () => {
  let client: QueryClient;
  let devices: DeviceDto[];
  let apiFetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    devices = [
      { id: 'dev-1', name: 'Test phone', createdAt: '2026-09-01T10:00:00Z', lastUsedAt: null, revoked: false },
      { id: 'dev-2', name: 'Test tablet', createdAt: '2026-09-02T10:00:00Z', lastUsedAt: null, revoked: false },
    ];
    apiFetchSpy = vi
      .spyOn(clientModule, 'apiFetch')
      .mockImplementation(async <T,>(path: string, init?: clientModule.ApiFetchOptions): Promise<T> => {
        if (path === '/api/devices' && !init?.method) return { devices } as unknown as T;
        if (path.startsWith('/api/devices/') && init?.method === 'DELETE') {
          const id = path.split('/').pop();
          devices = devices.map((d) => (d.id === id ? { ...d, revoked: true } : d));
          return undefined as T;
        }
        throw new Error(`Unhandled apiFetch path: ${path}`);
      });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderIt() {
    return render(
      <QueryClientProvider client={client}>
        <ConnectedPhones />
      </QueryClientProvider>,
    );
  }

  it('teaches what to do when no phone is connected', async () => {
    devices = [];
    renderIt();
    expect(await screen.findByText(/turn into transactions on their own/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect a phone' })).toBeInTheDocument();
  });

  it('asks inline before revoking, revokes the right phone and refreshes the list', async () => {
    renderIt();
    await screen.findByText('Test phone');

    const phoneRow = screen.getByText('Test phone').closest('li')!;
    fireEvent.click(within(phoneRow).getByRole('button', { name: 'Revoke' }));

    const confirm = within(phoneRow).getByRole('group', { name: 'Revoke Test phone' });
    expect(confirm).toHaveTextContent('Revoke Test phone? It will stop sending messages immediately.');
    // Nothing is sent before the user confirms.
    expect(apiFetchSpy).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'DELETE' }));

    fireEvent.click(within(confirm).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(apiFetchSpy).toHaveBeenCalledWith('/api/devices/dev-1', { method: 'DELETE' }));
    expect(apiFetchSpy).not.toHaveBeenCalledWith('/api/devices/dev-2', expect.anything());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Phone revoked'));

    // Refetched: the revoked phone is marked and sorted after the active one.
    await screen.findByText('Revoked');
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Test tablet');
    expect(items[1]).toHaveTextContent('Test phone');
    expect(within(items[1]).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  it('cancel closes the confirmation without calling the API', async () => {
    renderIt();
    await screen.findByText('Test phone');
    const phoneRow = screen.getByText('Test phone').closest('li')!;
    fireEvent.click(within(phoneRow).getByRole('button', { name: 'Revoke' }));
    fireEvent.click(within(phoneRow).getByRole('button', { name: 'Cancel' }));
    expect(within(phoneRow).queryByRole('group')).not.toBeInTheDocument();
    expect(apiFetchSpy).toHaveBeenCalledTimes(1); // only the list
  });
});
