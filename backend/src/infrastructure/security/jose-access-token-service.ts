import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { newUserId, type UserId } from '../../domain/ids.js';
import type { Clock } from '../../application/ports/clock.js';
import type {
  AccessTokenClaims,
  AccessTokenService,
  IssuedAccessToken,
} from '../../application/ports/security.js';

const ISSUER = 'financial-app';
const AUDIENCE = 'financial-app-api';
const TOKEN_TYPE = 'access';

/** Below this, HS256 is brute-forceable. The config loader enforces it too. */
const MIN_SECRET_LENGTH = 32;

export class JoseAccessTokenService implements AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds: number,
    private readonly clock: Clock,
  ) {
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`JWT access secret must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    this.key = new TextEncoder().encode(secret);
  }

  async issue(userId: UserId): Promise<IssuedAccessToken> {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);
    const expiresAt = issuedAt + this.ttlSeconds;

    const token = await new SignJWT({ typ: TOKEN_TYPE })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .setJti(randomUUID())
      .sign(this.key);

    return { token, expiresAt: new Date(expiresAt * 1000) };
  }

  async verify(token: string): Promise<AccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        // PIN THE ALGORITHM. Never let the token's own header choose how
        // it is verified. The classic JWT attack sets `alg: "none"` (no
        // signature at all) or swaps an RSA public key in as an HMAC
        // secret. An explicit allow-list makes both impossible.
        algorithms: ['HS256'],
        currentDate: this.clock.now(),
      });

      // Refuse any other kind of token signed with the same key.
      if (payload['typ'] !== TOKEN_TYPE || typeof payload.sub !== 'string') {
        return null;
      }
      return { userId: newUserId(payload.sub) };
    } catch {
      // Expired, tampered, malformed, wrong issuer — all simply "not trusted".
      return null;
    }
  }
}
