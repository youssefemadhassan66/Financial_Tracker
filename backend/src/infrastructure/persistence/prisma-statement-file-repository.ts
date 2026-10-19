import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { newAccountId, type AccountId, type UserId } from '../../domain/ids.js';
import type { CardStatement } from '../../domain/statements/card-statement.js';
import type { StatementFileInfo, StatementFileRepository } from '../../application/ports/statements.js';

const periodName = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

export class PrismaStatementFileRepository implements StatementFileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async keep(input: {
    userId: UserId;
    accountId: AccountId;
    fileName: string;
    content: Uint8Array;
    periods: CardStatement['period'][];
  }): Promise<string> {
    const sha256 = createHash('sha256').update(input.content).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      // Same bytes, same row: upsert on (user, hash) also settles two
      // uploads of one file racing each other.
      const file = await tx.statementFile.upsert({
        where: { userId_sha256: { userId: input.userId, sha256 } },
        create: {
          userId: input.userId,
          accountId: input.accountId,
          fileName: input.fileName,
          sizeBytes: input.content.byteLength,
          sha256,
          content: Buffer.from(input.content),
        },
        update: {},
        select: { id: true },
      });
      if (input.periods.length > 0) {
        await tx.cardStatement.updateMany({
          where: {
            userId: input.userId,
            accountId: input.accountId,
            fileId: null,
            OR: input.periods.map((p) => ({ periodYear: p.year, periodMonth: p.month })),
          },
          data: { fileId: file.id },
        });
      }
      return file.id;
    });
  }

  async listForUser(userId: UserId, accountId?: AccountId): Promise<StatementFileInfo[]> {
    const rows = await this.prisma.statementFile.findMany({
      where: { userId, ...(accountId === undefined ? {} : { accountId }) },
      orderBy: { uploadedAt: 'desc' },
      // Never the bytes: a list of a year of PDFs would be megabytes.
      select: {
        id: true,
        accountId: true,
        fileName: true,
        sizeBytes: true,
        uploadedAt: true,
        statements: { select: { periodYear: true, periodMonth: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      accountId: newAccountId(r.accountId),
      fileName: r.fileName,
      sizeBytes: r.sizeBytes,
      uploadedAt: r.uploadedAt,
      periods: r.statements
        .map((s) => periodName(s.periodYear, s.periodMonth))
        .sort()
        .reverse(),
    }));
  }

  async contentFor(id: string, userId: UserId): Promise<{ fileName: string; content: Uint8Array } | null> {
    const row = await this.prisma.statementFile.findFirst({
      where: { id, userId },
      select: { fileName: true, content: true },
    });
    return row === null ? null : { fileName: row.fileName, content: new Uint8Array(row.content) };
  }

  async delete(id: string, userId: UserId): Promise<boolean> {
    const { count } = await this.prisma.statementFile.deleteMany({ where: { id, userId } });
    return count === 1;
  }
}
