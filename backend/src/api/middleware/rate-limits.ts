import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import type { RateLimitConfig } from '../config/env.js';

/**
 * Rate limiters.
 *
 * The login limit is the one that matters most: without it, an attacker
 * can try millions of passwords. argon2 slows each guess, but only
 * rate limiting caps how many guesses are allowed at all.
 *
 * Stored in memory, which is correct for a single server process. With
 * two or more instances each would count separately — an attacker gets
 * N times the budget — and the store must move to Redis. Worth knowing
 * before scaling out, not a problem today.
 */

function limiter(windowMs: number, limit: number, keyGenerator?: (req: Parameters<RequestHandler>[0]) => string): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    // Sends the IETF standard RateLimit headers so clients can back off.
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(keyGenerator === undefined ? {} : { keyGenerator }),
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
      });
    },
  });
}

export interface RateLimiters {
  global: RequestHandler;
  login: RequestHandler;
  register: RequestHandler;
  refresh: RequestHandler;
  ingest: RequestHandler;
}

export function createRateLimiters(config: RateLimitConfig): RateLimiters {
  return {
    global: limiter(config.windowMs, config.global),
    login: limiter(config.windowMs, config.login),
    register: limiter(config.windowMs, config.register),
    refresh: limiter(config.windowMs, config.refresh),
    // Per DEVICE rather than per IP: a phone's IP changes as it moves
    // between wifi and mobile data, and many phones share one carrier IP.
    // Runs after requireDevice, so req.device is set; the IP fallback
    // exists only as a safety net.
    ingest: limiter(60_000, config.ingestPerMinute, (req) =>
      req.device?.deviceKeyId ?? ipKeyGenerator(req.ip ?? 'unknown'),
    ),
  };
}
