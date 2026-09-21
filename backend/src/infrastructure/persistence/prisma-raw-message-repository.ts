import type { PrismaClient } from '@prisma/client';
import type {
  NewRawMessage,
  RawMessageRepository,
} from '../../application/ports/repositories.js';
import { isUniqueViolation } from './prisma-errors.js';

export class PrismaRawMessageRepository implements RawMessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insertIfNew(message: NewRawMessage): Promise<{ id: string; duplicate: boolean }> {
    try {
      const row = await this.prisma.rawMessage.create({ data: message, select: { id: true } });
      return { id: row.id, duplicate: false };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      // Insert-then-catch rather than check-then-insert: checking first
      // leaves a gap in which a retry can slip through. The unique index
      // decides, atomically, and we simply report what it decided.
      const existing = await this.prisma.rawMessage.findUniqueOrThrow({
        where: { sha256: message.sha256 },
        select: { id: true },
      });
      return { id: existing.id, duplicate: true };
    }
  }
}
