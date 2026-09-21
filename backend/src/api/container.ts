import type { AppConfig } from './config/env.js';
import type { Clock } from '../application/ports/clock.js';
import { SessionIssuer } from '../application/auth/session-issuer.js';
import { RegisterUser } from '../application/auth/register-user.js';
import { LoginUser } from '../application/auth/login-user.js';
import { RefreshSession } from '../application/auth/refresh-session.js';
import { Logout, LogoutAll } from '../application/auth/logout.js';
import { GetCurrentUser } from '../application/auth/get-current-user.js';
import {
  AuthenticateDevice,
  CreateDeviceKey,
  ListDeviceKeys,
  RevokeDeviceKey,
} from '../application/devices/device-keys.js';
import { StoreRawSms } from '../application/ingest/store-raw-sms.js';
import type { AccessTokenService } from '../application/ports/security.js';
import { getPrismaClient } from '../infrastructure/persistence/prisma-client.js';
import { PrismaUserRepository } from '../infrastructure/persistence/prisma-user-repository.js';
import { PrismaRefreshTokenRepository } from '../infrastructure/persistence/prisma-refresh-token-repository.js';
import { PrismaDeviceKeyRepository } from '../infrastructure/persistence/prisma-device-key-repository.js';
import { PrismaRawMessageRepository } from '../infrastructure/persistence/prisma-raw-message-repository.js';
import { Argon2PasswordHasher } from '../infrastructure/security/argon2-password-hasher.js';
import { JoseAccessTokenService } from '../infrastructure/security/jose-access-token-service.js';
import { HmacOpaqueTokenService } from '../infrastructure/security/hmac-opaque-token-service.js';
import { systemClock } from '../infrastructure/system-clock.js';

/**
 * The COMPOSITION ROOT.
 *
 * The only place that knows which concrete class fulfils each interface.
 * Use cases ask for "a PasswordHasher"; this file decides it is argon2.
 * Swapping argon2 for something else is a one-line change here, and no
 * use case notices.
 *
 * Plain constructor calls rather than a DI framework: at this size a
 * framework would add magic without adding value, and this way every
 * dependency is visible by reading one file.
 */
export interface Container {
  accessTokens: AccessTokenService;
  registerUser: RegisterUser;
  loginUser: LoginUser;
  refreshSession: RefreshSession;
  logout: Logout;
  logoutAll: LogoutAll;
  getCurrentUser: GetCurrentUser;
  createDeviceKey: CreateDeviceKey;
  listDeviceKeys: ListDeviceKeys;
  revokeDeviceKey: RevokeDeviceKey;
  authenticateDevice: AuthenticateDevice;
  storeRawSms: StoreRawSms;
}

export function buildContainer(
  config: AppConfig,
  // Typed via the factory's return type, so the API layer never imports
  // @prisma/client itself — it only knows the infrastructure function.
  prisma: ReturnType<typeof getPrismaClient> = getPrismaClient(),
  clock: Clock = systemClock,
): Container {
  const users = new PrismaUserRepository(prisma);
  const refreshTokens = new PrismaRefreshTokenRepository(prisma);
  const deviceKeys = new PrismaDeviceKeyRepository(prisma);
  const rawMessages = new PrismaRawMessageRepository(prisma);

  const passwords = new Argon2PasswordHasher();
  const accessTokens = new JoseAccessTokenService(config.jwtAccessSecret, config.accessTokenTtlSeconds, clock);
  const opaqueTokens = new HmacOpaqueTokenService(config.tokenHashPepper);

  const sessions = new SessionIssuer(accessTokens, opaqueTokens, refreshTokens, clock, config.refreshTokenTtlSeconds);

  return {
    accessTokens,
    registerUser: new RegisterUser(users, passwords, sessions),
    loginUser: new LoginUser(users, passwords, sessions),
    refreshSession: new RefreshSession(refreshTokens, users, opaqueTokens, sessions, clock),
    logout: new Logout(refreshTokens, opaqueTokens, clock),
    logoutAll: new LogoutAll(refreshTokens, clock),
    getCurrentUser: new GetCurrentUser(users),
    createDeviceKey: new CreateDeviceKey(deviceKeys, opaqueTokens),
    listDeviceKeys: new ListDeviceKeys(deviceKeys),
    revokeDeviceKey: new RevokeDeviceKey(deviceKeys, clock),
    authenticateDevice: new AuthenticateDevice(deviceKeys, opaqueTokens, clock),
    storeRawSms: new StoreRawSms(rawMessages, clock),
  };
}
