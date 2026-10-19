import { API_URL } from './config';
import { clearAccessToken, setAccessToken } from './token-store';
import type { RefreshResponse } from './types';

let inFlightRefresh: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        clearAccessToken();
        return null;
      }

      const data = (await response.json()) as RefreshResponse;
      if (data && typeof data.accessToken === 'string' && data.accessToken.length > 0) {
        setAccessToken(data.accessToken);
        return data.accessToken;
      }

      clearAccessToken();
      return null;
    } catch {
      clearAccessToken();
      return null;
    }
  })().finally(() => {
    inFlightRefresh = null;
  });

  return inFlightRefresh;
}

export function _resetRefreshStateForTesting(): void {
  inFlightRefresh = null;
}
