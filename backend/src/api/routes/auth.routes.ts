import { Router, type Request } from 'express';
import type { AppConfig } from '../config/env.js';
import type { Container } from '../container.js';
import type { RateLimiters } from '../middleware/rate-limits.js';
import { requireUser } from '../middleware/authenticate.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../http/refresh-cookie.js';
import { loginBody, registerBody } from '../validation/schemas.js';
import type { SessionContext, SessionTokens } from '../../application/auth/session-issuer.js';

function sessionContext(req: Request): SessionContext {
  return {
    // Truncated: a user agent is attacker-controlled and unbounded.
    userAgent: req.get('user-agent')?.slice(0, 256) ?? null,
    ipAddress: req.ip ?? null,
  };
}

/** The access token goes in the JSON body (the frontend keeps it in
 *  memory); the refresh token goes ONLY into the httpOnly cookie, so
 *  frontend JavaScript never holds it. */
function tokenResponse(tokens: SessionTokens) {
  return {
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
  };
}

export function authRouter(container: Container, config: AppConfig, limits: RateLimiters): Router {
  const router = Router();
  const secure = config.cookieSecure;

  // Controllers stay thin: validate, call ONE use case, shape the
  // response. The decisions live in the use case, where they can be
  // tested without HTTP.

  router.post('/register', limits.register, async (req, res) => {
    const input = registerBody.parse(req.body);
    const result = await container.registerUser.execute(input, sessionContext(req));
    setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt, secure);
    res.status(201).json({ user: result.user, ...tokenResponse(result.tokens) });
  });

  router.post('/login', limits.login, async (req, res) => {
    const input = loginBody.parse(req.body);
    const result = await container.loginUser.execute(input, sessionContext(req));
    setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt, secure);
    res.json({ user: result.user, ...tokenResponse(result.tokens) });
  });

  router.post('/refresh', limits.refresh, async (req, res) => {
    try {
      const tokens = await container.refreshSession.execute(readRefreshCookie(req), sessionContext(req));
      setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt, secure);
      res.json(tokenResponse(tokens));
    } catch (error) {
      // A dead refresh token should not linger in the browser.
      clearRefreshCookie(res, secure);
      throw error;
    }
  });

  router.post('/logout', async (req, res) => {
    await container.logout.execute(readRefreshCookie(req));
    clearRefreshCookie(res, secure);
    res.status(204).end();
  });

  router.post('/logout-all', requireUser(container.accessTokens), async (req, res) => {
    await container.logoutAll.execute(req.auth!.userId);
    clearRefreshCookie(res, secure);
    res.status(204).end();
  });

  router.get('/me', requireUser(container.accessTokens), async (req, res) => {
    res.json({ user: await container.getCurrentUser.execute(req.auth!.userId) });
  });

  return router;
}
