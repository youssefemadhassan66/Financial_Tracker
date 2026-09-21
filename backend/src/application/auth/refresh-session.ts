import { AuthenticationError, RefreshTokenReuseError } from '../errors.js';
import type { Clock } from '../ports/clock.js';
import type { RefreshTokenRepository, UserRepository } from '../ports/repositories.js';
import type { OpaqueTokenService } from '../ports/security.js';
import type { SessionContext, SessionIssuer, SessionTokens } from './session-issuer.js';

/**
 * Exchanges a refresh token for a new access + refresh pair — ROTATION.
 *
 * Every refresh token is single-use. Using one returns a brand-new
 * refresh token and kills the old one. That makes theft DETECTABLE:
 *
 *   1. Attacker steals refresh token R1.
 *   2. Whoever uses R1 first gets R2; R1 is now marked used.
 *   3. When the OTHER party presents R1, it has already been used.
 *      Legitimate clients never do that, so it can only mean two people
 *      hold the same token.
 *   4. We cannot tell which of them is the real user, so we revoke the
 *      entire family — R2 included. Both are logged out; the real user
 *      simply signs in again, and the attacker's copy is now worthless.
 *
 * Without rotation, a stolen refresh token works silently for 30 days.
 */
export class RefreshSession {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly users: UserRepository,
    private readonly opaqueTokens: OpaqueTokenService,
    private readonly sessions: SessionIssuer,
    private readonly clock: Clock,
  ) {}

  async execute(presentedToken: string | undefined, context: SessionContext): Promise<SessionTokens> {
    if (presentedToken === undefined || presentedToken.length === 0) {
      throw new AuthenticationError('Missing refresh token');
    }

    const record = await this.refreshTokens.findByHash(this.opaqueTokens.hash(presentedToken));
    if (record === null) {
      throw new AuthenticationError('Invalid refresh token');
    }

    const now = this.clock.now();

    if (record.revokedAt !== null) {
      throw new AuthenticationError('Refresh token has been revoked');
    }

    if (record.usedAt !== null) {
      // Step 3 above. Replay of a used token.
      await this.refreshTokens.revokeFamily(record.familyId, now);
      throw new RefreshTokenReuseError('Refresh token reuse detected; session revoked');
    }

    if (record.expiresAt.getTime() <= now.getTime()) {
      throw new AuthenticationError('Refresh token has expired');
    }

    // Atomic claim. If two requests race with the same token, exactly one
    // wins here; the loser is treated exactly like a replay.
    const claimed = await this.refreshTokens.consume(record.id, now);
    if (!claimed) {
      await this.refreshTokens.revokeFamily(record.familyId, now);
      throw new RefreshTokenReuseError('Refresh token reuse detected; session revoked');
    }

    // The account may have been deleted since the token was issued.
    if ((await this.users.findById(record.userId)) === null) {
      throw new AuthenticationError('Account no longer exists');
    }

    // Same family: the new token is a descendant of the old one.
    return this.sessions.issue(record.userId, record.familyId, context);
  }
}
