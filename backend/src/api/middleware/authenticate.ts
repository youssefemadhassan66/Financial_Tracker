import type { RequestHandler } from 'express';
import { AuthenticationError } from '../../application/errors.js';
import type { AccessTokenService } from '../../application/ports/security.js';
import type { AuthenticateDevice } from '../../application/devices/device-keys.js';

/**
 * Requires a valid access token: `Authorization: Bearer <jwt>`.
 *
 * The token travels in a header, NOT a cookie, deliberately. Browsers
 * attach cookies to cross-site requests automatically, which is what
 * makes CSRF possible. A header is only ever set by our own JavaScript,
 * so routes protected this way need no CSRF token.
 */
export function requireUser(accessTokens: AccessTokenService): RequestHandler {
  return async (req, _res, next) => {
    const header = req.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;

    if (token === undefined || token.length === 0) {
      next(new AuthenticationError('Missing access token'));
      return;
    }

    const claims = await accessTokens.verify(token);
    if (claims === null) {
      next(new AuthenticationError('Invalid or expired access token'));
      return;
    }

    req.auth = { userId: claims.userId };
    next();
  };
}

/**
 * Requires a valid device key: `X-Device-Key: fad_…`.
 *
 * Mounted ONLY on the ingest route. requireUser ignores this header
 * entirely, which is what keeps a device key from reading transactions:
 * there is no code path by which it could authenticate anywhere else.
 */
export function requireDevice(authenticateDevice: AuthenticateDevice): RequestHandler {
  return async (req, _res, next) => {
    try {
      req.device = await authenticateDevice.execute(req.get('x-device-key'));
      next();
    } catch (error) {
      next(error);
    }
  };
}
