import { beforeEach, describe, expect, it } from 'vitest';
import { SessionIssuer } from '../../src/application/auth/session-issuer.js';
import { RegisterUser } from '../../src/application/auth/register-user.js';
import { LoginUser } from '../../src/application/auth/login-user.js';
import { RefreshSession } from '../../src/application/auth/refresh-session.js';
import { Logout, LogoutAll } from '../../src/application/auth/logout.js';
import { GetCurrentUser } from '../../src/application/auth/get-current-user.js';
import {
  AuthenticationError,
  ConflictError,
  RefreshTokenReuseError,
} from '../../src/application/errors.js';
import {
  FakeAccessTokenService,
  FakeClock,
  FakeOpaqueTokenService,
  FakePasswordHasher,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
} from './fakes.js';

const THIRTY_DAYS = 30 * 86_400;
const CTX = { userAgent: 'vitest', ipAddress: '127.0.0.1' };
const PASSWORD = 'correct horse battery staple';

function setup() {
  const clock = new FakeClock();
  const users = new InMemoryUserRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const passwords = new FakePasswordHasher();
  const opaque = new FakeOpaqueTokenService();
  const sessions = new SessionIssuer(new FakeAccessTokenService(), opaque, refreshTokens, clock, THIRTY_DAYS);

  return {
    clock,
    users,
    refreshTokens,
    passwords,
    register: new RegisterUser(users, passwords, sessions),
    login: new LoginUser(users, passwords, sessions),
    refresh: new RefreshSession(refreshTokens, users, opaque, sessions, clock),
    logout: new Logout(refreshTokens, opaque, clock),
    logoutAll: new LogoutAll(refreshTokens, clock),
    me: new GetCurrentUser(users),
  };
}

type Setup = ReturnType<typeof setup>;

describe('RegisterUser', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  it('creates the user and returns a session', async () => {
    const result = await s.register.execute({ email: 'y@example.com', password: PASSWORD, defaultCurrency: 'EGP' }, CTX);

    expect(result.user.email).toBe('y@example.com');
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
  });

  it('never stores the plaintext password', async () => {
    await s.register.execute({ email: 'y@example.com', password: PASSWORD, defaultCurrency: 'EGP' }, CTX);
    const stored = [...s.users.users.values()][0];

    expect(stored?.getPasswordHash()).not.toBe(PASSWORD);
  });

  it('does not expose the password hash in the returned user', async () => {
    const result = await s.register.execute({ email: 'y@example.com', password: PASSWORD, defaultCurrency: 'EGP' }, CTX);
    expect(JSON.stringify(result.user)).not.toContain('hash');
  });

  it('rejects an email that is already registered, ignoring case and spaces', async () => {
    await s.register.execute({ email: 'y@example.com', password: PASSWORD, defaultCurrency: 'EGP' }, CTX);

    await expect(
      s.register.execute({ email: '  Y@Example.COM ', password: PASSWORD, defaultCurrency: 'EGP' }, CTX),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('stores only the HASH of the refresh token', async () => {
    const result = await s.register.execute({ email: 'y@example.com', password: PASSWORD, defaultCurrency: 'EGP' }, CTX);
    const stored = s.refreshTokens.tokens[0];

    expect(stored?.tokenHash).not.toBe(result.tokens.refreshToken);
    expect(JSON.stringify(s.refreshTokens.tokens)).not.toContain(result.tokens.refreshToken + '"');
  });
});

describe('LoginUser', () => {
  let s: Setup;
  beforeEach(async () => {
    s = setup();
    await s.register.execute({ email: 'y@example.com', password: PASSWORD, defaultCurrency: 'EGP' }, CTX);
  });

  it('logs in with the right password', async () => {
    const result = await s.login.execute({ email: 'y@example.com', password: PASSWORD }, CTX);
    expect(result.user.email).toBe('y@example.com');
  });

  it('rejects a wrong password', async () => {
    await expect(s.login.execute({ email: 'y@example.com', password: 'wrong password!!' }, CTX))
      .rejects.toThrow('Invalid email or password');
  });

  it('gives an unknown email the IDENTICAL error — no account enumeration', async () => {
    const wrongPassword = await s.login
      .execute({ email: 'y@example.com', password: 'wrong password!!' }, CTX)
      .catch((e: Error) => e);
    const unknownEmail = await s.login
      .execute({ email: 'nobody@example.com', password: PASSWORD }, CTX)
      .catch((e: Error) => e);

    expect(unknownEmail).toBeInstanceOf(AuthenticationError);
    expect((unknownEmail as Error).message).toBe((wrongPassword as Error).message);
  });

  it('still runs a password verification for an unknown email — timing defence', async () => {
    const before = s.passwords.verifyCalls;
    await s.login.execute({ email: 'nobody@example.com', password: PASSWORD }, CTX).catch(() => undefined);

    // Without this, an unknown email would respond measurably faster.
    expect(s.passwords.verifyCalls).toBe(before + 1);
  });

  it('starts a NEW token family on each login', async () => {
    await s.login.execute({ email: 'y@example.com', password: PASSWORD }, CTX);
    const families = new Set(s.refreshTokens.tokens.map((t) => t.familyId));
    expect(families.size).toBe(2); // register + login
  });
});

describe('RefreshSession — rotation and reuse detection', () => {
  let s: Setup;
  let first: string;

  beforeEach(async () => {
    s = setup();
    const result = await s.register.execute({ email: 'y@example.com', password: PASSWORD, defaultCurrency: 'EGP' }, CTX);
    first = result.tokens.refreshToken;
  });

  it('returns a NEW refresh token and kills the old one', async () => {
    const rotated = await s.refresh.execute(first, CTX);

    expect(rotated.refreshToken).not.toBe(first);
    const old = s.refreshTokens.tokens.find((t) => t.tokenHash === `hashed(${first})`);
    expect(old?.usedAt).not.toBeNull();
  });

  it('keeps the rotated token in the SAME family', async () => {
    await s.refresh.execute(first, CTX);
    const families = new Set(s.refreshTokens.tokens.map((t) => t.familyId));
    expect(families.size).toBe(1);
  });

  it('detects reuse of an old token and revokes the WHOLE family — the stolen-token scenario', async () => {
    // Attacker and user both hold `first`. One of them refreshes...
    const legitimate = await s.refresh.execute(first, CTX);

    // ...then the other replays the same token.
    await expect(s.refresh.execute(first, CTX)).rejects.toBeInstanceOf(RefreshTokenReuseError);

    // The family is dead, so even the newest token no longer works.
    // Whoever held it — attacker or user — has to sign in again.
    await expect(s.refresh.execute(legitimate.refreshToken, CTX)).rejects.toBeInstanceOf(AuthenticationError);
    expect(s.refreshTokens.tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it('allows a chain of refreshes, each using the latest token', async () => {
    let token = first;
    for (let i = 0; i < 5; i += 1) {
      token = (await s.refresh.execute(token, CTX)).refreshToken;
    }
    expect(token).not.toBe(first);
  });

  it('rejects an expired refresh token', async () => {
    s.clock.advanceSeconds(THIRTY_DAYS + 1);
    await expect(s.refresh.execute(first, CTX)).rejects.toThrow('expired');
  });

  it('accepts a refresh token one second before it expires', async () => {
    s.clock.advanceSeconds(THIRTY_DAYS - 1);
    await expect(s.refresh.execute(first, CTX)).resolves.toBeDefined();
  });

  it('rejects a token it has never seen', async () => {
    await expect(s.refresh.execute('made-up-token', CTX)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('rejects a missing token', async () => {
    await expect(s.refresh.execute(undefined, CTX)).rejects.toBeInstanceOf(AuthenticationError);
  });
});

describe('Logout', () => {
  let s: Setup;
  let token: string;
  let userId: string;

  beforeEach(async () => {
    s = setup();
    const result = await s.register.execute({ email: 'y@example.com', password: PASSWORD, defaultCurrency: 'EGP' }, CTX);
    token = result.tokens.refreshToken;
    userId = result.user.id;
  });

  it('makes the refresh token unusable', async () => {
    await s.logout.execute(token);
    await expect(s.refresh.execute(token, CTX)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('is idempotent — an unknown or missing token is not an error', async () => {
    await expect(s.logout.execute('never-issued')).resolves.toBeUndefined();
    await expect(s.logout.execute(undefined)).resolves.toBeUndefined();
  });

  it('logout-all ends every session on every device', async () => {
    const laptop = await s.login.execute({ email: 'y@example.com', password: PASSWORD }, CTX);
    const phone = await s.login.execute({ email: 'y@example.com', password: PASSWORD }, CTX);

    const user = [...s.users.users.values()][0];
    await s.logoutAll.execute(user!.id);

    for (const t of [token, laptop.tokens.refreshToken, phone.tokens.refreshToken]) {
      await expect(s.refresh.execute(t, CTX)).rejects.toBeInstanceOf(AuthenticationError);
    }
    expect(userId).toBe(user!.id);
  });
});

describe('GetCurrentUser', () => {
  it('returns the user without the password hash', async () => {
    const s = setup();
    const { user } = await s.register.execute({ email: 'y@example.com', password: PASSWORD, defaultCurrency: 'EGP' }, CTX);
    const me = await s.me.execute(user.id as never);

    expect(me).toEqual({ id: user.id, email: 'y@example.com', defaultCurrency: 'EGP' });
  });
});
