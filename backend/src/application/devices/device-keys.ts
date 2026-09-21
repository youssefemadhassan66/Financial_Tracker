import type { UserId } from '../../domain/ids.js';
import { AuthenticationError, NotFoundError } from '../errors.js';
import type { Clock } from '../ports/clock.js';
import type { DeviceKeyRecord, DeviceKeyRepository } from '../ports/repositories.js';
import type { OpaqueTokenService } from '../ports/security.js';

/**
 * Device keys authenticate the phone's SMS forwarder (MacroDroid).
 *
 * It cannot log in or refresh a token — it can only send a fixed header
 * on an HTTP request. So it gets a long-lived key instead of a session,
 * and to compensate that key can do exactly ONE thing: submit SMS. It
 * cannot read a single transaction. A stolen phone leaks write-only
 * access to your inbox, not your financial history.
 */

/**
 * A recognisable prefix, the same idea as GitHub's `ghp_` tokens. If a
 * key is ever pasted into a chat, a log or a public repo, secret
 * scanners and humans can identify what it is at a glance.
 */
const DEVICE_KEY_PREFIX = 'fad_';

export interface DeviceKeyDto {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revoked: boolean;
}

function toDto(record: DeviceKeyRecord): DeviceKeyDto {
  // The hash is never exposed, not even to the key's owner.
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    revoked: record.revokedAt !== null,
  };
}

export class CreateDeviceKey {
  constructor(
    private readonly devices: DeviceKeyRepository,
    private readonly opaqueTokens: OpaqueTokenService,
  ) {}

  /** Returns the plaintext key ONCE. It cannot be retrieved again — only
   *  its hash is stored — so a lost key is revoked and replaced. */
  async execute(userId: UserId, name: string): Promise<{ device: DeviceKeyDto; key: string }> {
    const key = DEVICE_KEY_PREFIX + this.opaqueTokens.generate();
    const record = await this.devices.create({
      userId,
      name,
      keyHash: this.opaqueTokens.hash(key),
    });
    return { device: toDto(record), key };
  }
}

export class ListDeviceKeys {
  constructor(private readonly devices: DeviceKeyRepository) {}

  async execute(userId: UserId): Promise<DeviceKeyDto[]> {
    return (await this.devices.listForUser(userId)).map(toDto);
  }
}

export class RevokeDeviceKey {
  constructor(
    private readonly devices: DeviceKeyRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId, deviceKeyId: string): Promise<void> {
    const revoked = await this.devices.revoke(deviceKeyId, userId, this.clock.now());
    if (!revoked) {
      // 404 even when the key exists but belongs to someone else. A 403
      // would confirm that the id is real, which leaks information.
      throw new NotFoundError('Device key not found');
    }
  }
}

export interface AuthenticatedDevice {
  deviceKeyId: string;
  userId: UserId;
}

export class AuthenticateDevice {
  constructor(
    private readonly devices: DeviceKeyRepository,
    private readonly opaqueTokens: OpaqueTokenService,
    private readonly clock: Clock,
  ) {}

  async execute(presentedKey: string | undefined): Promise<AuthenticatedDevice> {
    if (presentedKey === undefined || !presentedKey.startsWith(DEVICE_KEY_PREFIX)) {
      throw new AuthenticationError('Missing or malformed device key');
    }

    const record = await this.devices.findActiveByHash(this.opaqueTokens.hash(presentedKey));
    if (record === null) {
      throw new AuthenticationError('Invalid or revoked device key');
    }

    await this.devices.touch(record.id, this.clock.now());
    return { deviceKeyId: record.id, userId: record.userId };
  }
}
