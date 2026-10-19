import type { Prisma, PrismaClient } from '@prisma/client';
import type { AccountId, UserId } from '../../domain/ids.js';
import type { Transaction } from '../../domain/transaction.js';
import type { CardStatement } from '../../domain/statements/card-statement.js';
import { ConflictError } from '../../application/errors.js';
import type {
  CardStatementRepository,
  CardStatementView,
  PricedMessage,
  StatementLineToSave,
  UnconfirmedTransaction,
} from '../../application/ports/statements.js';
import type { RawMessageRecord } from '../../application/ports/sms.js';
import { isUniqueViolation } from './prisma-errors.js';
import { toTransactionRow } from './prisma-finance-repositories.js';
import { RECORD_FIELDS, toRecord } from './prisma-raw-message-repository.js';

/** Thrown inside the save to roll it back when a priced SMS is no longer waiting. */
class PricedMessageTaken extends Error {}

/** A calendar date as the Date a Postgres DATE column wants (UTC midnight). */
const asDbDate = (date: string) => new Date(`${date}T00:00:00Z`);

export class PrismaCardStatementRepository implements CardStatementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async isImported(accountId: AccountId, period: CardStatement['period']): Promise<boolean> {
    const row = await this.prisma.cardStatement.findUnique({
      where: { accountId_periodYear_periodMonth: { accountId, periodYear: period.year, periodMonth: period.month } },
      select: { id: true },
    });
    return row !== null;
  }

  async listUnconfirmed(userId: UserId, accountId: AccountId, from: Date, to: Date): Promise<UnconfirmedTransaction[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { userId, accountId, occurredAt: { gte: from, lt: to }, statementLine: null },
      select: { id: true, amount: true, direction: true, kind: true, occurredAt: true },
    });
    return rows.map((r) => ({ ...r, amount: r.amount.toFixed(2) }));
  }

  async listAwaitingStatement(userId: UserId, accountId: AccountId, from: Date, to: Date): Promise<RawMessageRecord[]> {
    const rows = await this.prisma.rawMessage.findMany({
      where: {
        userId,
        status: 'awaiting_statement',
        receivedAt: { gte: from, lt: to },
        parsedPayload: { path: ['accountId'], equals: accountId },
      },
      select: RECORD_FIELDS,
    });
    return rows.map(toRecord);
  }

  async save(input: {
    userId: UserId;
    accountId: AccountId;
    statement: CardStatement;
    lines: StatementLineToSave[];
    newTransactions: Transaction[];
    pricedMessages: PricedMessage[];
  }): Promise<'saved' | 'already-imported'> {
    const { userId, accountId, statement } = input;
    try {
      await this.prisma.$transaction(async (tx) => {
        // Lock the card's row first: imports of the same card run one at
        // a time, so two months saved at once cannot both believe they are
        // the newest and leave the OLDER month's limit on the card.
        await tx.account.update({ where: { id: accountId }, data: { updatedAt: new Date() } });
        // The unique (account, year, month) index decides a race between
        // two uploads of the same file: the second insert fails here and
        // its whole transaction, new transactions included, rolls back.
        const created = await tx.cardStatement.create({
          data: {
            userId,
            accountId,
            periodYear: statement.period.year,
            periodMonth: statement.period.month,
            dueDate: asDbDate(statement.dueDate),
            creditLimit: statement.creditLimit,
            availableCredit: statement.availableCredit,
            totalDue: statement.totalDue,
            minimumDue: statement.minimumDue,
            openingBalance: statement.openingBalance,
            closingBalance: statement.closingBalance,
          },
          select: { id: true },
        });
        await claimPricedMessages(tx, userId, input.pricedMessages);
        if (input.newTransactions.length > 0) {
          const smsOf = new Map(input.pricedMessages.map((m) => [m.transactionId, m.rawMessageId]));
          await tx.transaction.createMany({
            data: input.newTransactions.map((t) => ({ ...toTransactionRow(t), rawMessageId: smsOf.get(t.id) ?? null })),
          });
        }
        await tx.cardStatementLine.createMany({
          data: input.lines.map(({ lineNo, line, transactionId }) => ({
            statementId: created.id,
            lineNo,
            transactionDate: asDbDate(line.transactionDate),
            postingDate: asDbDate(line.postingDate),
            description: line.description,
            amount: line.amount,
            direction: line.direction,
            notes: line.notes,
            transactionId,
          })),
        });

        const newest = await tx.cardStatement.findFirst({
          where: { accountId },
          orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
          select: { id: true },
        });
        if (newest?.id === created.id) {
          // Importing an OLD month must not roll the card's limit back.
          const details = { creditLimit: statement.creditLimit, dueDay: Number(statement.dueDate.slice(8, 10)) };
          await tx.creditCardDetails.upsert({ where: { accountId }, create: { accountId, ...details }, update: details });
        }
      });
    } catch (error) {
      if (error instanceof PricedMessageTaken) {
        throw new ConflictError('An SMS this statement prices changed at the same moment; upload the file again');
      }
      if (!isUniqueViolation(error)) {
        throw error;
      }
      if (await this.isImported(accountId, statement.period)) {
        return 'already-imported';
      }
      // Otherwise a transaction we meant to confirm was confirmed by
      // another import a moment ago. Nothing was saved; a retry re-matches.
      throw new ConflictError('Another import changed this card at the same moment; upload the file again');
    }
    return 'saved';
  }

  async listForAccount(userId: UserId, accountId: AccountId): Promise<CardStatementView[]> {
    const rows = await this.prisma.cardStatement.findMany({
      where: { userId, accountId },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      include: { lines: { select: { transactionId: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      period: `${r.periodYear}-${String(r.periodMonth).padStart(2, '0')}`,
      dueDate: r.dueDate.toISOString().slice(0, 10),
      creditLimit: r.creditLimit.toFixed(2),
      availableCredit: r.availableCredit.toFixed(2),
      totalDue: r.totalDue.toFixed(2),
      minimumDue: r.minimumDue.toFixed(2),
      openingBalance: r.openingBalance.toFixed(2),
      closingBalance: r.closingBalance.toFixed(2),
      lineCount: r.lines.length,
      unmatchedPayments: r.lines.filter((l) => l.transactionId === null).length,
      importedAt: r.importedAt,
      fileId: r.fileId,
    }));
  }
}

/**
 * Marks each priced SMS parsed, but only while it is still waiting with
 * the payload we matched. A reprocess that re-routed it to another card,
 * or another import that priced it first, makes this import roll back.
 */
async function claimPricedMessages(tx: Prisma.TransactionClient, userId: UserId, messages: PricedMessage[]): Promise<void> {
  for (const message of messages) {
    const claimed = await tx.rawMessage.updateMany({
      where: {
        id: message.rawMessageId,
        userId,
        status: 'awaiting_statement',
        parsedPayload: { equals: message.payload },
      },
      data: { status: 'parsed', parseError: null },
    });
    if (claimed.count === 0) {
      throw new PricedMessageTaken();
    }
  }
}
