import type { UserId } from '../../domain/ids.js';

/**
 * PORTS: interfaces the Application layer declares and Infrastructure
 * implements. This is Dependency Inversion in practice — use cases depend
 * on "something that can hash a password", never on argon2 itself.
 *
 * Each interface is deliberately narrow (Interface Segregation): a use
 * case that only verifies tokens should not be handed a type that can
 * also mint them.
 */

/**
 * For PASSWORDS — low-entropy secrets a human chose and might reuse.
 * Must be slow and salted (argon2id) so a leaked database cannot be
 * brute-forced cheaply.
 */
export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
  /** Returns false for a wrong password AND for a malformed hash. Never throws for either. */
  verify(passwordHash: string, plainPassword: string): Promise<boolean>;
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

export interface AccessTokenClaims {
  userId: UserId;
}

/** Short-lived, self-contained JWT proving who the caller is. */
export interface AccessTokenService {
  issue(userId: UserId): Promise<IssuedAccessToken>;
  /** Returns null for ANY invalid token — bad signature, expired, wrong
   *  type, malformed. Callers need one answer: trusted or not. */
  verify(token: string): Promise<AccessTokenClaims | null>;
}

/**
 * For HIGH-ENTROPY machine secrets: refresh tokens and device keys.
 *
 * Why not argon2 here too? Two reasons:
 *  1. These are 256 bits of randomness. Brute-forcing that is impossible
 *     no matter how fast the hash, so argon2's slowness buys nothing.
 *  2. We must LOOK UP a row by the hash of the presented token. argon2
 *     salts every hash differently, so the same input never produces the
 *     same output and a lookup is impossible. HMAC-SHA256 is deterministic.
 */
export interface OpaqueTokenService {
  generate(): string;
  hash(token: string): string;
}
