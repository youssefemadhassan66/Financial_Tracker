import { API_URL } from './config';
import { createNetworkError, parseApiError } from './errors';
import { refreshAccessToken } from './refresh';
import { getAccessToken } from './token-store';

export type AuthFailureHandler = () => void;

let authFailureHandler: AuthFailureHandler | null = null;

export function setAuthFailureHandler(fn: AuthFailureHandler | null): void {
  authFailureHandler = fn;
}

export function _resetClientStateForTesting(): void {
  authFailureHandler = null;
}

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    return await response.text();
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: ApiFetchOptions
): Promise<T> {
  return executeFetch<T>(path, init, false);
}

// Endpoints that establish or end a session. A 401 from them means "bad
// credentials / no session", never "access token expired", so they must not
// trigger the refresh-and-retry path. /api/auth/me and /api/auth/logout-all
// are ordinary protected endpoints and DO get the retry.
const SESSION_ENDPOINTS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
]);

async function executeFetch<T>(
  path: string,
  init: ApiFetchOptions | undefined,
  isRetry: boolean
): Promise<T> {
  if (!path.startsWith('/')) {
    // Only relative API paths: the bearer token must never reach another host.
    throw new Error(`apiFetch expects a path starting with "/", got "${path}"`);
  }
  const isAuthPath = path.startsWith('/api/auth/');
  const isSessionEndpoint = SESSION_ENDPOINTS.has(path);
  const url = `${API_URL}${path}`;

  const headers = new Headers(init?.headers);

  let bodyContent: BodyInit | undefined = undefined;
  if (init?.body !== undefined) {
    if (
      typeof init.body === 'string' ||
      init.body instanceof FormData ||
      init.body instanceof Blob
    ) {
      bodyContent = init.body as BodyInit;
    } else {
      bodyContent = JSON.stringify(init.body);
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    }
  }

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const currentToken = getAccessToken();
  if (currentToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${currentToken}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: init?.method ?? 'GET',
      headers,
      body: bodyContent,
      credentials: isAuthPath ? 'include' : init?.credentials,
    });
  } catch (err) {
    throw createNetworkError(err);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (response.status === 401) {
    // Session endpoints never trigger refresh/retry (e.g. 401 on login means wrong password)
    if (isSessionEndpoint) {
      const errorBody = await parseResponseBody(response);
      throw parseApiError(response.status, errorBody);
    }

    // Already a retry: cannot retry again to prevent loops
    if (isRetry) {
      const errorBody = await parseResponseBody(response);
      const error = parseApiError(response.status, errorBody);
      authFailureHandler?.();
      throw error;
    }

    // If another request already refreshed while this one was in flight, the
    // store holds a newer token: retry with it instead of rotating again.
    const latestToken = getAccessToken();
    const newToken =
      latestToken && latestToken !== currentToken
        ? latestToken
        : await refreshAccessToken();
    if (!newToken) {
      const errorBody = await parseResponseBody(response);
      const error = parseApiError(response.status, errorBody);
      authFailureHandler?.();
      throw error;
    }

    // Retry original request exactly once with the new token
    const retryHeaders = new Headers(init?.headers);
    retryHeaders.set('Authorization', `Bearer ${newToken}`);
    if (init?.body !== undefined && !retryHeaders.has('Content-Type')) {
      if (
        !(typeof init.body === 'string') &&
        !(init.body instanceof FormData) &&
        !(init.body instanceof Blob)
      ) {
        retryHeaders.set('Content-Type', 'application/json');
      }
    }
    if (!retryHeaders.has('Accept')) {
      retryHeaders.set('Accept', 'application/json');
    }

    return executeFetch<T>(
      path,
      {
        ...init,
        headers: retryHeaders,
      },
      true
    );
  }

  if (!response.ok) {
    const errorBody = await parseResponseBody(response);
    throw parseApiError(response.status, errorBody);
  }

  return (await response.json()) as T;
}
