import { describe, expect, it } from 'vitest';
import { JoseAccessTokenService } from '../../src/infrastructure/security/jose-access-token-service.js';
import { HmacOpaqueTokenService } from '../../src/infrastructure/security/hmac-opaque-token-service.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2-password-hasher.js';
import { newUserId } from '../../src/domain/ids.js';
import { FakeClock } from '../application/fakes.js';

const SECRET = 'a'.repeat(48);
const OTHER_SECRET = 'b'.repeat(48);
const USER = newUserId('11111111-1111-1111-1111-111111111111');

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('JoseAccessTokenService', () => {
  it('round-trips a valid token', async () => {
    const service = new JoseAccessTokenService(SECRET, 900, new FakeClock());
    const { token } = await service.issue(USER);
    expect(await service.verify(token)).toEqual({ userId: USER });
  });

  it('refuses a secret shorter than 32 characters', () => {
    expect(() => new JoseAccessTokenService('short', 900, new FakeClock())).toThrow();
  });

  it('rejects a token signed with a different secret', async () => {
    const clock = new FakeClock();
    const { token } = await new JoseAccessTokenService(OTHER_SECRET, 900, clock).issue(USER);
    expect(await new JoseAccessTokenService(SECRET, 900, clock).verify(token)).toBeNull();
  });

  it('rejects a token whose payload was edited', async () => {
    const service = new JoseAccessTokenService(SECRET, 900, new FakeClock());
    const { token } = await service.issue(USER);
    const [header, , signature] = token.split('.');
    const forged = `${header}.${base64url({ sub: 'someone-else', typ: 'access' })}.${signature}`;
    expect(await service.verify(forged)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const clock = new FakeClock();
    const service = new JoseAccessTokenService(SECRET, 900, clock);
    const { token } = await service.issue(USER);

    clock.advanceSeconds(901);
    expect(await service.verify(token)).toBeNull();
  });

  it('rejects the `alg: none` attack — an unsigned token claiming to be valid', async () => {
    // The classic JWT exploit: set the header to alg "none" and drop the
    // signature. Libraries that let the token's header pick the algorithm
    // accept it. Pinning algorithms: ['HS256'] is what makes this fail.
    const service = new JoseAccessTokenService(SECRET, 900, new FakeClock());
    const now = Math.floor(Date.now() / 1000);
    const unsigned =
      base64url({ alg: 'none', typ: 'JWT' }) +
      '.' +
      base64url({ sub: USER, typ: 'access', iss: 'financial-app', aud: 'financial-app-api', iat: now, exp: now + 900 }) +
      '.';

    expect(await service.verify(unsigned)).toBeNull();
  });

  it('rejects garbage', async () => {
    const service = new JoseAccessTokenService(SECRET, 900, new FakeClock());
    expect(await service.verify('not.a.jwt')).toBeNull();
    expect(await service.verify('')).toBeNull();
  });
});

describe('HmacOpaqueTokenService', () => {
  it('generates distinct 256-bit tokens', () => {
    const service = new HmacOpaqueTokenService(SECRET);
    const tokens = new Set(Array.from({ length: 1000 }, () => service.generate()));

    expect(tokens.size).toBe(1000);
    // 32 bytes -> 43 base64url characters.
    expect([...tokens][0]).toHaveLength(43);
  });

  it('hashes deterministically — required to look a token up by its hash', () => {
    const service = new HmacOpaqueTokenService(SECRET);
    expect(service.hash('token')).toBe(service.hash('token'));
  });

  it('produces a different hash under a different pepper', () => {
    // Why the pepper matters: with only a database dump, an attacker
    // cannot compute the hash of any candidate token.
    expect(new HmacOpaqueTokenService(SECRET).hash('token'))
      .not.toBe(new HmacOpaqueTokenService(OTHER_SECRET).hash('token'));
  });

  it('refuses a pepper shorter than 32 characters', () => {
    expect(() => new HmacOpaqueTokenService('short')).toThrow();
  });
});

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('produces an argon2id hash with the OWASP parameters', async () => {
    const hash = await hasher.hash('correct horse battery staple');
    // Format: $argon2id$v=19$<params>$<salt>$<digest>. Parse the params
    // rather than assert their order, which is the library's business.
    const [, algorithm, , params] = hash.split('$');
    const values = Object.fromEntries((params ?? '').split(',').map((kv) => kv.split('=')));

    expect(algorithm).toBe('argon2id');
    expect(values).toEqual({ m: '19456', t: '2', p: '1' });
  });

  it('salts every hash — the same password never hashes the same twice', async () => {
    const a = await hasher.hash('correct horse battery staple');
    const b = await hasher.hash('correct horse battery staple');
    expect(a).not.toBe(b);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hasher.hash('correct horse battery staple');
    expect(await hasher.verify(hash, 'correct horse battery staple')).toBe(true);
    expect(await hasher.verify(hash, 'correct horse battery stapl')).toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    // argon2.verify throws on malformed input; unwrapped, a corrupted row
    // would turn a login into a 500.
    expect(await hasher.verify('not-a-hash', 'anything')).toBe(false);
  });
});
