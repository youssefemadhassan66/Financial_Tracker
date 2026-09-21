import type { DeviceKey, PrismaClient } from '@prisma/client';
import { newUserId, type UserId } from '../../domain/ids.js';
import type {
  DeviceKeyRecord,
  DeviceKeyRepository,
} from '../../application/ports/repositories.js';

export class PrismaDeviceKeyRepository implements DeviceKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: { userId: UserId; name: string; keyHash: string }): Promise<DeviceKeyRecord> {
    return toRecord(await this.prisma.deviceKey.create({ data: input }));
  }

  async findActiveByHash(keyHash: string): Promise<DeviceKeyRecord | null> {
    const row = await this.prisma.deviceKey.findFirst({ where: { keyHash, revokedAt: null } });
    return row === null ? null : toRecord(row);
  }

  async listForUser(userId: UserId): Promise<DeviceKeyRecord[]> {
    const rows = await this.prisma.deviceKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  }

  async revoke(id: string, userId: UserId, at: Date): Promise<boolean> {
    // userId in the WHERE clause is the tenancy check. Without it, anyone
    // who learned a key id could revoke someone else's device.
    const result = await this.prisma.deviceKey.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: at },
    });
    return result.count === 1;
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.prisma.deviceKey.update({ where: { id }, data: { lastUsedAt: at } });
  }
}

function toRecord(row: DeviceKey): DeviceKeyRecord {
  return {
    id: row.id,
    userId: newUserId(row.userId),
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}
