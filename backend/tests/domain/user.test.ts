import { describe, expect, it } from 'vitest';
import { User } from '../../src/domain/user.js';
import { DomainError } from '../../src/domain/errors.js';
import { newUserId } from '../../src/domain/ids.js';

const HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aBcDeFgHiJkLmNoPqRsTuV';

function build(overrides: Partial<Parameters<typeof User.create>[0]> = {}) {
  return {
    id: newUserId('usr_1'),
    email: 'youssef@example.com',
    passwordHash: HASH,
    defaultCurrency: 'EGP' as const,
    ...overrides,
  };
}

describe('User', () => {
  it('creates a valid user', () => {
    const user = User.create(build());
    expect(user.email).toBe('youssef@example.com');
    expect(user.getDefaultCurrency()).toBe('EGP');
  });

  it('normalizes email so one person cannot become two accounts', () => {
    const user = User.create(build({ email: '  Youssef@Example.COM  ' }));
    expect(user.email).toBe('youssef@example.com');
  });

  it('rejects an invalid email', () => {
    expect(() => User.create(build({ email: 'not-an-email' }))).toThrow(DomainError);
    expect(() => User.create(build({ email: 'a@b' }))).toThrow(DomainError);
    expect(() => User.create(build({ email: '' }))).toThrow(DomainError);
  });

  it('rejects an email over the 254 character limit', () => {
    const long = `${'a'.repeat(250)}@example.com`;
    expect(() => User.create(build({ email: long }))).toThrow(DomainError);
  });

  it('refuses a password that was clearly never hashed', () => {
    // The tripwire: a plaintext password must never reach this field.
    expect(() => User.create(build({ passwordHash: 'hunter2' }))).toThrow(DomainError);
    expect(() => User.create(build({ passwordHash: '' }))).toThrow(DomainError);
  });

  it('refuses to change to an unhashed password', () => {
    const user = User.create(build());
    expect(() => user.changePasswordHash('password123')).toThrow(DomainError);
  });

  it('changes to a properly hashed password', () => {
    const user = User.create(build());
    const next = `${HASH}XYZ`;
    user.changePasswordHash(next);
    expect(user.getPasswordHash()).toBe(next);
  });
});

describe('User — tenancy', () => {
  it('allows a user to access their own resource', () => {
    const user = User.create(build());
    expect(() => user.assertOwns(newUserId('usr_1'))).not.toThrow();
  });

  it("refuses access to another user's resource", () => {
    // The check that stops one person reading another person's bank
    // transactions. It lives in one named method precisely so it cannot
    // be quietly omitted from one query out of forty.
    const user = User.create(build());
    expect(() => user.assertOwns(newUserId('usr_2'))).toThrow(DomainError);
  });
});
