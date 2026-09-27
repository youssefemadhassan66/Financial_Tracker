import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth-provider';
import { clearAccessToken } from '@/lib/api/token-store';
import { _resetRefreshStateForTesting } from '@/lib/api/refresh';
import { _resetClientStateForTesting } from '@/lib/api/client';

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
};

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/',
}));

function TestConsumer() {
  const { status, user } = useAuth();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="email">{user?.email ?? 'none'}</div>
    </div>
  );
}

describe('AuthProvider Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearAccessToken();
    _resetRefreshStateForTesting();
    _resetClientStateForTesting();
    mockPush.mockReset();
    mockReplace.mockReset();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearAccessToken();
    _resetRefreshStateForTesting();
    _resetClientStateForTesting();
  });

  // 12. AuthProvider: refresh 200 + me 200 -> status authenticated with user; refresh 401 -> unauthenticated; rendered under <StrictMode>, the refresh endpoint is hit exactly ONCE.
  it('AuthProvider: refresh 200 + me 200 -> status authenticated with user; refresh 401 -> unauthenticated; rendered under <StrictMode>, the refresh endpoint is hit exactly ONCE', async () => {
    // Case 1: refresh 200 + me 200
    let refreshCalls = 0;
    const fetchMockSuccess = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return new Response(
          JSON.stringify({
            accessToken: 'token-abc',
            accessTokenExpiresAt: '2026-09-27T14:15:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            user: {
              id: 'user-123',
              email: 'test@example.com',
              defaultCurrency: 'EGP',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected url: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMockSuccess);

    const { unmount } = render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        </QueryClientProvider>
      </React.StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });
    expect(screen.getByTestId('email').textContent).toBe('test@example.com');
    expect(refreshCalls).toBe(1);

    unmount();

    // Case 2: refresh 401
    clearAccessToken();
    _resetRefreshStateForTesting();
    _resetClientStateForTesting();
    const newQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    let refreshCalls401 = 0;
    const fetchMock401 = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/refresh')) {
        refreshCalls401++;
        await new Promise((r) => setTimeout(r, 10));
        return new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Session expired',
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected url: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock401);

    render(
      <React.StrictMode>
        <QueryClientProvider client={newQueryClient}>
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        </QueryClientProvider>
      </React.StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
    expect(screen.getByTestId('email').textContent).toBe('none');
    expect(refreshCalls401).toBe(1);
  });
});
