import type { UserId } from '../../domain/ids.js';

/**
 * Adds typed authentication context to Express's Request.
 *
 * Two separate fields, never both set by the same middleware: a request
 * is authenticated EITHER as a user (JWT) OR as a device (device key).
 * Route handlers read the one their middleware guarantees.
 */
declare global {
  namespace Express {
    interface Request {
      auth?: { userId: UserId };
      device?: { deviceKeyId: string; userId: UserId };
    }
  }
}

export {};
