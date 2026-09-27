// In-memory token storage.
// HARD SECURITY RULE: Access token lives strictly in module-level memory.
// NEVER localStorage, sessionStorage, IndexedDB, or a JS-readable cookie.
// Never console.log it.

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}
