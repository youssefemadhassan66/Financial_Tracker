import { randomUUID } from 'node:crypto';
import type { User } from '../../src/domain/user.js';
import { newUserId, type UserId } from '../../src/domain/ids.js';
import { ConflictError } from '../../src/application/errors.js';
import type { Clock } from '../../src/application/ports/clock.js';
import type {
  DeviceKeyRecord,
  DeviceKeyRepository,
  NewRawMessage,
  NewRefreshToken,
  RawMessageRepository,
  RefreshTokenRecord,
  RefreshTokenRepository,
  UserRepository,
} from '../../src/application/ports/repositories.js';
import type {
  AccessTokenClaims,
  AccessTokenService,
  IssuedAccessToken,
  OpaqueTokenService,
  PasswordHasher,
} from '../../src/application/ports/security.js';

/**
 * In-memory fakes of every port.
 *
 * These are why the use cases are cheap to test: no database, no argon2
 * (which is deliberately slow), no network. Each fake honours the same
 * CONTRACT as the real implementation — including the awkward parts,
 * like consume() being a conditional claim — or the tests would pass
 * against behaviour production never has.
 */

export class FakeClock implements Clock {
  constructor(private current = new Date('2026-09-21T10:00:00Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

export class FakePasswordHasher implements PasswordHasher {
  verifyCalls = 0;
  async hash(plain: string): Promise<string> {
    // Long enough to pass User's "looks unhashed" tripwire.
    return `fake-hash$$${plain}$$padding-padding`;
  }
  async verify(hash: string, plain: string): Promise<boolean> {
    this.verifyCalls += 1;
    return hash === (await this.hash(plain));
  }
}

export class FakeAccessTokenService implements AccessTokenService {
  private counter = 0;
  async issue(userId: UserId): Promise<IssuedAccessToken> {
    this.counter += 1;
    return { token: `access.${userId}.${this.counter}`, expiresAt: new Date(Date.now() + 900_000) };
  }
  async verify(token: string): Promise<AccessTokenClaims | null> {
    const [kind, userId] = token.split('.');
    return kind === 'access' && userId !== undefined ? { userId: newUserId(userId) } : null;
  }
}

export class FakeOpaqueTokenService implements OpaqueTokenService {
  private counter = 0;
  generate(): string {
    this.counter += 1;
    return `opaque-${this.counter}-${randomUUID()}`;
  }
  hash(token: string): string {
    return `hashed(${token})`;
  }
}

export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, User>();

  async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }
  async findById(id: UserId): Promise<User | null> {
    return this.users.get(id) ?? null;
  }
  async create(user: User): Promise<void> {
    if ((await this.findByEmail(user.email)) !== null) {
      throw new ConflictError('An account with this email already exists');
    }
    this.users.set(user.id, user);
  }
}

interface StoredRefreshToken extends RefreshTokenRecord {
  tokenHash: string;
}

export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  readonly tokens: StoredRefreshToken[] = [];

  async create(token: NewRefreshToken): Promise<void> {
    this.tokens.push({ ...token, id: randomUUID(), usedAt: null, revokedAt: null });
  }
  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const found = this.tokens.find((t) => t.tokenHash === tokenHash);
    return found === undefined ? null : { ...found };
  }
  async consume(id: string, at: Date): Promise<boolean> {
    const token = this.tokens.find((t) => t.id === id);
    if (token === undefined || token.usedAt !== null || token.revokedAt !== null) {
      return false;
    }
    token.usedAt = at;
    return true;
  }
  async revokeFamily(familyId: string, at: Date): Promise<void> {
    for (const token of this.tokens) {
      if (token.familyId === familyId && token.revokedAt === null) token.revokedAt = at;
    }
  }
  async revokeAllForUser(userId: UserId, at: Date): Promise<void> {
    for (const token of this.tokens) {
      if (token.userId === userId && token.revokedAt === null) token.revokedAt = at;
    }
  }
}

interface StoredDeviceKey extends DeviceKeyRecord {
  keyHash: string;
}

export class InMemoryDeviceKeyRepository implements DeviceKeyRepository {
  readonly keys: StoredDeviceKey[] = [];

  async create(input: { userId: UserId; name: string; keyHash: string }): Promise<DeviceKeyRecord> {
    const record: StoredDeviceKey = {
      ...input,
      id: randomUUID(),
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    };
    this.keys.push(record);
    return strip(record);
  }
  async findActiveByHash(keyHash: string): Promise<DeviceKeyRecord | null> {
    const found = this.keys.find((k) => k.keyHash === keyHash && k.revokedAt === null);
    return found === undefined ? null : strip(found);
  }
  async listForUser(userId: UserId): Promise<DeviceKeyRecord[]> {
    return this.keys.filter((k) => k.userId === userId).map(strip);
  }
  async revoke(id: string, userId: UserId, at: Date): Promise<boolean> {
    const found = this.keys.find((k) => k.id === id && k.userId === userId && k.revokedAt === null);
    if (found === undefined) return false;
    found.revokedAt = at;
    return true;
  }
  async touch(id: string, at: Date): Promise<void> {
    const found = this.keys.find((k) => k.id === id);
    if (found !== undefined) found.lastUsedAt = at;
  }
}

/** Returns the record WITHOUT its hash, as the real repository does. */
function strip(stored: StoredDeviceKey): DeviceKeyRecord {
  const { id, userId, name, createdAt, lastUsedAt, revokedAt } = stored;
  return { id, userId, name, createdAt, lastUsedAt, revokedAt };
}

export class InMemoryRawMessageRepository implements RawMessageRepository {
  readonly messages: (NewRawMessage & { id: string })[] = [];

  async insertIfNew(message: NewRawMessage): Promise<{ id: string; duplicate: boolean }> {
    const existing = this.messages.find((m) => m.sha256 === message.sha256);
    if (existing !== undefined) {
      return { id: existing.id, duplicate: true };
    }
    const id = randomUUID();
    this.messages.push({ ...message, id });
    return { id, duplicate: false };
  }
}
