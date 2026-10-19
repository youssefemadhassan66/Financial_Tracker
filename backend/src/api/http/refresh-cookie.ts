import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE = 'refresh_token';

/**
 * Every attribute here is a security control:
 *
 * httpOnly   JavaScript cannot read it. An XSS bug can still make
 *            requests, but cannot STEAL the token to use elsewhere.
 * secure     Sent over HTTPS only. Off solely in local development.
 * sameSite   'strict' — never sent on a request that starts on another
 *            site. This is what defends the refresh endpoint from CSRF.
 * path       Sent ONLY to /api/auth. Every other route never sees it,
 *            so it cannot leak through some unrelated endpoint's logs.
 */
function baseOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'strict', path: '/api/auth' };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date, secure: boolean): void {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(secure), expires: expiresAt });
}

/** Clearing must repeat the same path/sameSite/secure, or the browser
 *  treats it as a different cookie and keeps the original. */
export function clearRefreshCookie(res: Response, secure: boolean): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions(secure));
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}
