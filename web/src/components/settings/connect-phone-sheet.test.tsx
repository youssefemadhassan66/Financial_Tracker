import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as clientModule from '@/lib/api/client';
import { ConnectPhoneSheet } from './connect-phone-sheet';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const FAKE_KEY = 'fad_test_example';

function Harness({ client, onOpenChange }: { client: QueryClient; onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = React.useState(true);
  return (
    <QueryClientProvider client={client}>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <ConnectPhoneSheet
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          setOpen(next);
        }}
      />
    </QueryClientProvider>
  );
}

describe('ConnectPhoneSheet', () => {
  let client: QueryClient;
  let apiFetchSpy: ReturnType<typeof vi.spyOn>;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiFetchSpy = vi.spyOn(clientModule, 'apiFetch').mockImplementation(async <T,>(path: string): Promise<T> => {
      if (path === '/api/devices') {
        return {
          device: { id: 'dev-1', name: 'Test phone', createdAt: '2026-10-01T10:00:00Z', lastUsedAt: null, revoked: false },
          key: FAKE_KEY,
        } as unknown as T;
      }
      throw new Error(`Unhandled apiFetch path: ${path}`);
    });
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.mocked(toast.success).mockClear();
  });

  async function createKey() {
    const nameInput = screen.getByLabelText('Phone name');
    fireEvent.change(nameInput, { target: { value: '  Test phone  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    await screen.findByDisplayValue(FAKE_KEY);
  }

  it('sends the trimmed name and shows the key once', async () => {
    render(<Harness client={client} onOpenChange={vi.fn()} />);
    await createKey();
    expect(apiFetchSpy).toHaveBeenCalledWith('/api/devices', { method: 'POST', body: { name: 'Test phone' } });
    const keyInput = screen.getByLabelText('Device key');
    expect(keyInput).toHaveAttribute('readonly');
    expect(keyInput).toHaveAttribute('autocomplete', 'off');
    expect(keyInput).toHaveAttribute('spellcheck', 'false');
  });

  it('keeps Done disabled until the key is copied', async () => {
    render(<Harness client={client} onOpenChange={vi.fn()} />);
    await createKey();
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(FAKE_KEY));
    await waitFor(() => expect(done).toBeEnabled());
  });

  it('does not count a failed copy; the checkbox enables Done instead', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<Harness client={client} onOpenChange={vi.fn()} />);
    await createKey();

    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]);
    await screen.findByText(/Copying didn.t work here/);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();

    fireEvent.click(screen.getByLabelText('I saved it somewhere safe'));
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });

  it('cannot be dismissed with Escape while the key is unsaved', async () => {
    const onOpenChange = vi.fn();
    render(<Harness client={client} onOpenChange={onOpenChange} />);
    await createKey();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByDisplayValue(FAKE_KEY)).toBeInTheDocument();
  });

  it('wipes the key on Done: gone from the DOM, not shown on reopen, never cached or toasted', async () => {
    const onOpenChange = vi.fn();
    render(<Harness client={client} onOpenChange={onOpenChange} />);
    await createKey();

    fireEvent.click(screen.getByLabelText('I saved it somewhere safe'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith('Phone connected');
    await waitFor(() => expect(screen.queryByDisplayValue(FAKE_KEY)).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(await screen.findByLabelText('Phone name')).toHaveValue('My phone');
    expect(document.body.innerHTML).not.toContain(FAKE_KEY);

    const cached = JSON.stringify([
      client.getQueryCache().getAll().map((q) => q.state),
      client.getMutationCache().getAll().map((m) => m.state),
    ]);
    expect(cached).not.toContain(FAKE_KEY);
    expect(JSON.stringify(vi.mocked(toast.success).mock.calls)).not.toContain(FAKE_KEY);
  });

  it('shows server validation errors on the name field', async () => {
    const { ApiError } = await import('@/lib/api/errors');
    apiFetchSpy.mockRejectedValue(
      new ApiError(400, 'VALIDATION_FAILED', 'Invalid', [{ path: 'name', message: 'Name is not allowed' }]),
    );
    render(<Harness client={client} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findByText('Name is not allowed')).toBeInTheDocument();
  });
});
