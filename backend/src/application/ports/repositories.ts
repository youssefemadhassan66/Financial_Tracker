import type { User } from '../../domain/user.js';
import type { UserId } from '../../domain/ids.js';

/**
 * Persistence ports. Each is shaped around what the use cases actually
 * need — not a generic CRUD `Repository<T>`, which would hand every
 * caller update/delete powers it has no business having.
 */

export interface UserRepository {
  findByEmail(normalizedEmail: string): Promise<User | null>;
  findById(id: UserId): Promise<User | null>;
  /** Throws ConflictError if the email is already taken — including when
   *  two registrations race past the application-level check. */
  create(user: User): Promise<void>;
}

export interface RefreshTokenRecord {
  id: string;
  userId: UserId;
  familyId: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

export interface NewRefreshToken {
  userId: UserId;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface RefreshTokenRepository {
  create(token: NewRefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /**
   * Atomically marks the token used, only if it is still unused and not
   * revoked. Returns false if another request got there first.
   *
   * This MUST be a single conditional UPDATE, not read-then-write: two
   * concurrent refreshes with one token could otherwise both read
   * "unused" and both succeed, minting two valid descendants from one
   * token — exactly what rotation exists to prevent.
   */
  consume(id: string, at: Date): Promise<boolean>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  revokeAllForUser(userId: UserId, at: Date): Promise<void>;
}

export interface DeviceKeyRecord {
  id: string;
  userId: UserId;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface DeviceKeyRepository {
  create(input: { userId: UserId; name: string; keyHash: string }): Promise<DeviceKeyRecord>;
  findActiveByHash(keyHash: string): Promise<DeviceKeyRecord | null>;
  listForUser(userId: UserId): Promise<DeviceKeyRecord[]>;
  /** Scoped by owner. Returns false when no such key exists FOR THIS USER —
   *  another user's key is indistinguishable from a missing one. */
  revoke(id: string, userId: UserId, at: Date): Promise<boolean>;
  touch(id: string, at: Date): Promise<void>;
}

export interface NewRawMessage {
  userId: UserId;
  deviceKeyId: string;
  sender: string;
  body: string;
  receivedAt: Date;
  sha256: string;
}

export interface RawMessageRepository {
  /** Inserts unless a message with the same sha256 exists. Duplicate is a
   *  normal outcome (the phone retried), not an error. */
  insertIfNew(message: NewRawMessage): Promise<{ id: string; duplicate: boolean }>;
}
