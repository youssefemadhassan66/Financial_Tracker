import type { UserId } from '../../domain/ids.js';
import type { Clock } from '../ports/clock.js';
import type { RefreshTokenRepository } from '../ports/repositories.js';
import type { AccessTokenService, OpaqueTokenService } from '../ports/security.js';

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  /** Plaintext — returned to the client exactly once. Only its hash is stored. */
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/** Recorded on the refresh token to help spot a stolen token used from
 *  somewhere unexpected. Informational only — both are trivially spoofed. */
export interface SessionContext {
  userAgent: string | null;
  ipAddress: string | null;
}

/**
 * Issues an access + refresh token pair.
 *
 * Shared by register, login and refresh, so there is exactly one place
 * that decides how a session is minted. If it lived inside each use case,
 * the three copies would eventually disagree about expiry or hashing.
 */
export class SessionIssuer {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly opaqueTokens: OpaqueTokenService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly clock: Clock,
    private readonly refreshTokenTtlSeconds: number,
  ) {}

  /**
   * @param familyId A fresh UUID on login/register; the EXISTING family on
   *   refresh, so every descendant of one login can be revoked together.
   */
  async issue(userId: UserId, familyId: string, context: SessionContext): Promise<SessionTokens> {
    const access = await this.accessTokens.issue(userId);

    const refreshToken = this.opaqueTokens.generate();
    const refreshTokenExpiresAt = new Date(
      this.clock.now().getTime() + this.refreshTokenTtlSeconds * 1000,
    );

    await this.refreshTokens.create({
      userId,
      familyId,
      tokenHash: this.opaqueTokens.hash(refreshToken),
      expiresAt: refreshTokenExpiresAt,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    });

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }
}
