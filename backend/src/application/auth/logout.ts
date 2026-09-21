import type { UserId } from '../../domain/ids.js';
import type { Clock } from '../ports/clock.js';
import type { RefreshTokenRepository } from '../ports/repositories.js';
import type { OpaqueTokenService } from '../ports/security.js';

/**
 * Ends the current session by revoking its whole token family.
 *
 * Idempotent: an unknown or missing token is not an error. Logging out
 * must always leave the user logged out, never show a failure screen.
 *
 * Note what this CANNOT do: the access token already issued stays valid
 * until it expires (at most 15 minutes). That is the core trade-off of
 * JWT access tokens — they are verified without a database lookup, which
 * is what makes them fast, and also what makes them impossible to recall.
 * The short lifetime is what bounds the damage.
 */
export class Logout {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly opaqueTokens: OpaqueTokenService,
    private readonly clock: Clock,
  ) {}

  async execute(presentedToken: string | undefined): Promise<void> {
    if (presentedToken === undefined || presentedToken.length === 0) {
      return;
    }
    const record = await this.refreshTokens.findByHash(this.opaqueTokens.hash(presentedToken));
    if (record !== null) {
      await this.refreshTokens.revokeFamily(record.familyId, this.clock.now());
    }
  }
}

/** "Sign out everywhere" — every session on every device. */
export class LogoutAll {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId, this.clock.now());
  }
}
