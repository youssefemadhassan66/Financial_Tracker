import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  NewRawMessage,
  RawMessageRepository,
} from '../../application/ports/repositories.js';
import type {
  MerchantCategoryRepository,
  ParsePayload,
  RawMessageRecord,
  RawMessageStatus,
  RawMessageView,
  SmsInbox,
} from '../../application/ports/sms.js';
import type { Transaction } from '../../domain/transaction.js';
import { newCategoryId, newUserId, type CategoryId, type UserId } from '../../domain/ids.js';
import { isUniqueViolation } from './prisma-errors.js';
import { toTransactionRow } from './prisma-finance-repositories.js';

/** Every status except 'parsed': the messages a reprocess may touch. */
const NEEDS_PARSE: RawMessageStatus[] = ['pending', 'unparsed', 'ignored'];

const RECORD_FIELDS = { id: true, userId: true, sender: true, body: true, receivedAt: true, status: true } as const;

export class PrismaRawMessageRepository implements RawMessageRepository, SmsInbox {
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

  async findForUser(id: string, userId: UserId): Promise<RawMessageRecord | null> {
    // findFirst with userId, not findUnique by id: another user's message
    // id must behave exactly like an id that does not exist.
    const row = await this.prisma.rawMessage.findFirst({ where: { id, userId }, select: RECORD_FIELDS });
    return row === null ? null : { ...row, userId: newUserId(row.userId) };
  }

  async listIdsNeedingParse(userId: UserId, limit: number, afterId?: string): Promise<string[]> {
    let after: Prisma.RawMessageWhereInput = {};
    if (afterId !== undefined) {
      const anchor = await this.prisma.rawMessage.findFirst({
        where: { id: afterId, userId },
        select: { receivedAt: true },
      });
      if (anchor === null) {
        return [];
      }
      // Keyset pagination on (receivedAt, id): stable even when two
      // messages share a timestamp, and unaffected by rows changing
      // status between pages (unlike OFFSET).
      after = {
        OR: [
          { receivedAt: { gt: anchor.receivedAt } },
          { receivedAt: anchor.receivedAt, id: { gt: afterId } },
        ],
      };
    }

    const rows = await this.prisma.rawMessage.findMany({
      where: { userId, status: { in: NEEDS_PARSE }, ...after },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async list(userId: UserId, filter: { status?: RawMessageStatus; limit: number }): Promise<RawMessageView[]> {
    const rows = await this.prisma.rawMessage.findMany({
      where: { userId, ...(filter.status === undefined ? {} : { status: filter.status }) },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: filter.limit,
      select: { ...RECORD_FIELDS, parseError: true, transaction: { select: { id: true } } },
    });
    return rows.map(({ transaction, ...row }) => ({
      ...row,
      userId: newUserId(row.userId),
      transactionId: transaction?.id ?? null,
    }));
  }

  async markNotTransaction(
    id: string,
    userId: UserId,
    status: 'ignored' | 'unparsed',
    reason: string,
    payload: ParsePayload | null,
  ): Promise<void> {
    // The status guard keeps a slow run from downgrading a message that
    // a faster run already turned into a transaction.
    await this.prisma.rawMessage.updateMany({
      where: { id, userId, status: { in: NEEDS_PARSE } },
      data: { status, parseError: reason, parsedPayload: payload ?? Prisma.DbNull },
    });
  }

  completeWithTransaction(
    id: string,
    userId: UserId,
    transaction: Transaction,
    payload: ParsePayload,
  ): Promise<'saved' | 'already-processed'> {
    return this.prisma.$transaction(async (tx) => {
      // CLAIM first. The conditional UPDATE takes a row lock; a second
      // run racing on the same message blocks here, then sees status
      // 'parsed', updates nothing, and backs off. Only the winner goes
      // on to insert. The unique index on transactions.raw_message_id
      // is the second, independent guarantee.
      const claimed = await tx.rawMessage.updateMany({
        where: { id, userId, status: { in: NEEDS_PARSE } },
        data: { status: 'parsed', parseError: null, parsedPayload: payload },
      });
      if (claimed.count === 0) {
        return 'already-processed' as const;
      }
      await tx.transaction.create({ data: { ...toTransactionRow(transaction), rawMessageId: id } });
      return 'saved' as const;
    });
  }
}

export class PrismaMerchantCategoryRepository implements MerchantCategoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findCategoryId(userId: UserId, merchantKey: string): Promise<CategoryId | null> {
    const row = await this.prisma.merchantCategoryMap.findUnique({
      where: { userId_merchantKey: { userId, merchantKey } },
      select: { categoryId: true },
    });
    return row === null ? null : newCategoryId(row.categoryId);
  }
}
