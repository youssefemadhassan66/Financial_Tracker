import { createHmac, randomBytes } from 'node:crypto';
import type { OpaqueTokenService } from '../../application/ports/security.js';

/** 32 bytes = 256 bits of randomness. Unguessable by any means. */
const TOKEN_BYTES = 32;

/**
 * Opaque random tokens (refresh tokens, device keys), stored as
 * HMAC-SHA256(pepper, token).
 *
 * The PEPPER is a secret kept only in the environment, never in the
 * database. A plain SHA-256 would already be safe for 256-bit tokens;
 * the pepper is defence in depth: someone holding only a database dump
 * cannot even confirm whether a candidate token is valid, because they
 * lack the key needed to compute the hash.
 */
export class HmacOpaqueTokenService implements OpaqueTokenService {
  constructor(private readonly pepper: string) {
    if (pepper.length < 32) {
      throw new Error('Token hash pepper must be at least 32 characters');
    }
  }

  generate(): string {
    // base64url: safe in cookies, headers and URLs without any escaping.
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }

  hash(token: string): string {
    return createHmac('sha256', this.pepper).update(token, 'utf8').digest('hex');
  }
}
