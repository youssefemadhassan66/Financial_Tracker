import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { login } from './auth';
import {
  apiFetch,
  setAuthFailureHandler,
  _resetClientStateForTesting,
} from './client';
import { ApiError } from './errors';
import {
  refreshAccessToken,
  _resetRefreshStateForTesting,
} from './refresh';
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from './token-store';

describe('API Client and Refresh Logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearAccessToken();
    _resetRefreshStateForTesting();
    _resetClientStateForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearAccessToken();
    _resetRefreshStateForTesting();
    _resetClientStateForTesting();
  });

  // 1. refreshAccessToken: 3 concurrent calls -> fetch called ONCE, all three get the same token.
  it('refreshAccessToken: 3 concurrent calls -> fetch called ONCE, all three get the same token', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      // Simulate slight network latency
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(
        JSON.stringify({
          accessToken: 'shared-token-123',
          accessTokenExpiresAt: '2026-09-27T14:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const [t1, t2, t3] = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(t1).toBe('shared-token-123');
    expect(t2).toBe('shared-token-123');
    expect(t3).toBe('shared-token-123');
    expect(getAccessToken()).toBe('shared-token-123');
  });

  // 2. refreshAccessToken: after the first settles, a new call makes a NEW request.
  it('refreshAccessToken: after the first settles, a new call makes a NEW request', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          accessToken: `token-number-${callCount}`,
          accessTokenExpiresAt: '2026-09-27T14:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const token1 = await refreshAccessToken();
    expect(token1).toBe('token-number-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const token2 = await refreshAccessToken();
    expect(token2).toBe('token-number-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // 3. refreshAccessToken: 401 -> returns null, token cleared, and the next call makes a new request.
  it('refreshAccessToken: 401 -> returns null, token cleared, and the next call makes a new request', async () => {
    setAccessToken('existing-valid-token');
    expect(getAccessToken()).toBe('existing-valid-token');

    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Session revoked',
            },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response(
        JSON.stringify({
          accessToken: 'fresh-token',
          accessTokenExpiresAt: '2026-09-27T14:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result1 = await refreshAccessToken();
    expect(result1).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const result2 = await refreshAccessToken();
    expect(result2).toBe('fresh-token');
    expect(getAccessToken()).toBe('fresh-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // 4. refreshAccessToken: sends credentials 'include' to /api/auth/refresh with method POST.
  it("refreshAccessToken: sends credentials 'include' to /api/auth/refresh with method POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'test-token',
          accessTokenExpiresAt: '2026-09-27T14:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await refreshAccessToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/auth\/refresh$/);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
  });

  // 5. apiFetch: protected call 401 -> one refresh -> retried once with the NEW bearer token -> returns data.
  it('apiFetch: protected call 401 -> one refresh -> retried once with the NEW bearer token -> returns data', async () => {
    setAccessToken('expired-bearer-token');

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/auth/refresh')) {
        return new Response(
          JSON.stringify({
            accessToken: 'brand-new-token',
            accessTokenExpiresAt: '2026-09-27T14:00:00.000Z',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url.includes('/api/accounts')) {
        const authHeader = (init?.headers as Headers)?.get?.('Authorization') ??
          (init?.headers as Record<string, string>)?.[
            'Authorization'
          ];

        if (authHeader === 'Bearer expired-bearer-token') {
          return new Response(
            JSON.stringify({
              error: {
                code: 'UNAUTHENTICATED',
                message: 'Token expired',
              },
            }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        if (authHeader === 'Bearer brand-new-token') {
          return new Response(
            JSON.stringify({
              accounts: [{ id: 'acc-1', name: 'Test Account' }],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ accounts: { id: string; name: string }[] }>(
      '/api/accounts'
    );

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].name).toBe('Test Account');
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1: initial -> 401, 2: refresh -> 200, 3: retry -> 200
  });

  // 6. apiFetch: 3 parallel protected calls all 401 -> refresh endpoint called exactly ONCE; each retried once.
  it('apiFetch: 3 parallel protected calls all 401 -> refresh endpoint called exactly ONCE; each retried once', async () => {
    setAccessToken('expired-shared-token');

    let refreshEndpointCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/auth/refresh')) {
        refreshEndpointCount++;
        await new Promise((r) => setTimeout(r, 10));
        return new Response(
          JSON.stringify({
            accessToken: 'refreshed-shared-token',
            accessTokenExpiresAt: '2026-09-27T14:00:00.000Z',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const headers = new Headers(init?.headers);
      const auth = headers.get('Authorization');

      if (auth === 'Bearer expired-shared-token') {
        return new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Token expired',
            },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (auth === 'Bearer refreshed-shared-token') {
        if (url.includes('/api/accounts')) {
          return new Response(JSON.stringify({ endpoint: 'accounts' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/api/categories')) {
          return new Response(JSON.stringify({ endpoint: 'categories' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/api/transactions')) {
          return new Response(JSON.stringify({ endpoint: 'transactions' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      throw new Error(`Unexpected request to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const [r1, r2, r3] = await Promise.all([
      apiFetch<{ endpoint: string }>('/api/accounts'),
      apiFetch<{ endpoint: string }>('/api/categories'),
      apiFetch<{ endpoint: string }>('/api/transactions'),
    ]);

    expect(r1.endpoint).toBe('accounts');
    expect(r2.endpoint).toBe('categories');
    expect(r3.endpoint).toBe('transactions');
    expect(refreshEndpointCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(7); // 3 initial + 1 refresh + 3 retries
  });

  // 7. apiFetch: retry also 401 -> no second refresh, auth-failure handler called once, rejects with ApiError 401.
  it('apiFetch: retry also 401 -> no second refresh, auth-failure handler called once, rejects with ApiError 401', async () => {
    setAccessToken('expired-token');
    const authFailureHandler = vi.fn();
    setAuthFailureHandler(authFailureHandler);

    let refreshCalls = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/refresh')) {
        refreshCalls++;
        return new Response(
          JSON.stringify({
            accessToken: 'still-invalid-token',
            accessTokenExpiresAt: '2026-09-27T14:00:00.000Z',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url.includes('/api/accounts')) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Invalid token',
            },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/accounts')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
    });
    expect(refreshCalls).toBe(1);
    expect(authFailureHandler).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 1 refresh + 1 retry
  });

  // 8. apiFetch: refresh fails -> original request NOT retried, auth-failure handler called.
  it('apiFetch: refresh fails -> original request NOT retried, auth-failure handler called', async () => {
    setAccessToken('expired-token');
    const authFailureHandler = vi.fn();
    setAuthFailureHandler(authFailureHandler);

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/refresh')) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Session revoked',
            },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url.includes('/api/accounts')) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Token expired',
            },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/accounts')).rejects.toThrow(ApiError);
    expect(authFailureHandler).toHaveBeenCalledTimes(1);
    // Request count: 1 to /api/accounts + 1 to /api/auth/refresh. No retry of /api/accounts!
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // 9. apiFetch: 401 from /api/auth/login does NOT call refresh and rejects with ApiError 401.
  it('apiFetch: 401 from /api/auth/login does NOT call refresh and rejects with ApiError 401', async () => {
    const authFailureHandler = vi.fn();
    setAuthFailureHandler(authFailureHandler);

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/login')) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Invalid credentials',
            },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const errorPromise = apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email: 'bad@example.com', password: 'wrong' },
    });

    await expect(errorPromise).rejects.toThrow(ApiError);
    await expect(errorPromise).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });

    expect(authFailureHandler).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('apiFetch: /api/auth/me is a protected endpoint -> 401 triggers refresh and retry', async () => {
    setAccessToken('expired-token');
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) {
        return Response.json({ accessToken: 'fresh-token', accessTokenExpiresAt: '2026-09-27T14:00:00.000Z' });
      }
      const auth = new Headers(init?.headers).get('Authorization');
      if (auth === 'Bearer fresh-token') {
        return Response.json({ user: { id: 'u1', email: 'test@example.com', defaultCurrency: 'EGP' } });
      }
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'expired' } }, { status: 401 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const me = await apiFetch<{ user: { email: string } }>('/api/auth/me');

    expect(me.user.email).toBe('test@example.com');
    expect(fetchMock).toHaveBeenCalledTimes(3); // me 401 -> refresh -> me retry
  });

  it('apiFetch: 401 for a token that was already replaced -> retries with the newer token, no extra refresh', async () => {
    setAccessToken('old-token');
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) {
        throw new Error('refresh must not be called');
      }
      const auth = new Headers(init?.headers).get('Authorization');
      if (auth === 'Bearer old-token') {
        // Simulates another request refreshing while this one was in flight.
        setAccessToken('newer-token');
        return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'expired' } }, { status: 401 });
      }
      return Response.json({ ok: auth === 'Bearer newer-token' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ ok: boolean }>('/api/accounts');

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('apiFetch: refuses absolute URLs so the bearer token never leaves the API host', async () => {
    setAccessToken('secret-token');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('https://other.example.com/steal')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 10. apiFetch: error body -> ApiError with code and issues; 204 -> undefined; fetch throwing -> NETWORK_ERROR.
  it('apiFetch: error body -> ApiError with code and issues; 204 -> undefined; fetch throwing -> NETWORK_ERROR', async () => {
    // 10a: Error body
    const fetchMockA = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed',
            issues: [
              {
                path: 'amount',
                message: 'Amount must be a decimal string like "450.75"',
              },
            ],
          },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchMockA);

    try {
      await apiFetch('/api/transactions', {
        method: 'POST',
        body: { amount: 'invalid' },
      });
      expect.unreachable('Should have thrown ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.code).toBe('VALIDATION_FAILED');
      expect(apiErr.message).toBe('Request validation failed');
      expect(apiErr.issues).toEqual([
        {
          path: 'amount',
          message: 'Amount must be a decimal string like "450.75"',
        },
      ]);
    }

    // 10b: 204 No Content
    const fetchMockB = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
      })
    );
    vi.stubGlobal('fetch', fetchMockB);

    const result204 = await apiFetch('/api/auth/logout', { method: 'POST' });
    expect(result204).toBeUndefined();

    // 10c: Fetch throwing -> NETWORK_ERROR
    const fetchMockC = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMockC);

    try {
      await apiFetch('/api/accounts');
      expect.unreachable('Should have thrown network error');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(0);
      expect(apiErr.code).toBe('NETWORK_ERROR');
    }
  });

  // 11. Token never persisted: spy on Storage.prototype.setItem and document.cookie setter across login() + apiFetch + refresh; assert neither was called with the token.
  it('Token never persisted: spy on Storage.prototype.setItem and document.cookie setter across login() + apiFetch + refresh; assert neither was called with the token', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const cookieSetterSpy = vi.spyOn(document, 'cookie', 'set');

    const secretLoginToken = 'super-secret-login-jwt-token-999';
    const secretRefreshToken = 'super-secret-refreshed-jwt-token-888';

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/login')) {
        return new Response(
          JSON.stringify({
            user: {
              id: 'user-1',
              email: 'test@example.com',
              defaultCurrency: 'EGP',
            },
            accessToken: secretLoginToken,
            accessTokenExpiresAt: '2026-09-27T14:00:00.000Z',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url.includes('/api/accounts')) {
        return new Response(JSON.stringify({ accounts: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/api/auth/refresh')) {
        return new Response(
          JSON.stringify({
            accessToken: secretRefreshToken,
            accessTokenExpiresAt: '2026-09-27T14:15:00.000Z',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // 1) Login
    await login({ email: 'test@example.com', password: 'password-12345' });
    expect(getAccessToken()).toBe(secretLoginToken);

    // 2) apiFetch
    await apiFetch('/api/accounts');

    // 3) refresh
    await refreshAccessToken();
    expect(getAccessToken()).toBe(secretRefreshToken);

    // Verify localStorage / sessionStorage never called with tokens
    for (const call of setItemSpy.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain(secretLoginToken);
      expect(serialized).not.toContain(secretRefreshToken);
    }

    // Verify document.cookie setter never called with tokens
    for (const call of cookieSetterSpy.mock.calls) {
      const val = String(call);
      expect(val).not.toContain(secretLoginToken);
      expect(val).not.toContain(secretRefreshToken);
    }
  });
});
