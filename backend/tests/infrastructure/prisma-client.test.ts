import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { disconnectPrisma, getPrismaClient } from '../../src/infrastructure/persistence/prisma-client.js';

/**
 * Integration tests — these need the Docker database running
 * (`npm run db:up`). They are skipped rather than failed when it is not,
 * so `npm test` still works on a machine with no database, while anyone
 * who has one gets real coverage.
 */
const prisma = getPrismaClient();

const hasDatabase = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const withDb = hasDatabase ? describe : describe.skip;

afterAll(async () => {
  await disconnectPrisma();
});

withDb('Prisma client (integration)', () => {
  const userId = '44444444-4444-4444-4444-444444444444';

  afterAll(async () => {
    // Cascades clean up accounts and transactions.
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('round-trips a user', async () => {
    const user = await prisma.user.create({
      data: {
        id: userId,
        email: 'integration@example.com',
        passwordHash: '$argon2id$v=19$m=65536$fakehashfakehashfake',
        defaultCurrency: 'EGP',
      },
    });

    expect(user.email).toBe('integration@example.com');
    expect(user.defaultCurrency).toBe('EGP');
  });

  it('stores money as an exact Decimal, not a float', async () => {
    const account = await prisma.account.create({
      data: {
        userId,
        name: 'CIB Card',
        type: 'credit_card',
        currency: 'EGP',
        last4s: ['1234'],
      },
    });

    // The float trap: 0.1 + 0.2 === 0.30000000000000004 in JS.
    const a = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        amount: new Decimal('0.1'),
        currency: 'EGP',
        direction: 'debit',
        kind: 'expense',
        countsAsSpending: true,
        merchantKey: 'TEST',
        merchantRaw: 'test',
        occurredAt: new Date(),
        source: 'manual',
      },
    });
    const b = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        amount: new Decimal('0.2'),
        currency: 'EGP',
        direction: 'debit',
        kind: 'expense',
        countsAsSpending: true,
        merchantKey: 'TEST',
        merchantRaw: 'test',
        occurredAt: new Date(),
        source: 'manual',
      },
    });

    const sum = new Decimal(a.amount.toString()).plus(b.amount.toString());
    expect(sum.toFixed(2)).toBe('0.30');
  });

  it('preserves Arabic merchant text through the database', async () => {
    const account = await prisma.account.findFirstOrThrow({ where: { userId } });

    const txn = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        amount: new Decimal('45.50'),
        currency: 'EGP',
        direction: 'debit',
        kind: 'expense',
        countsAsSpending: true,
        merchantKey: 'CARREFOUR',
        merchantRaw: 'كارفور المعادي',
        occurredAt: new Date(),
        source: 'sms',
      },
    });

    const read = await prisma.transaction.findUniqueOrThrow({ where: { id: txn.id } });
    expect(read.merchantRaw).toBe('كارفور المعادي');
  });

  it('rejects a duplicate SMS by sha256 — the forwarder retry guard', async () => {
    const row = {
      userId,
      sender: 'CIB',
      body: 'Your card was charged EGP 500',
      sha256: 'integration-test-hash',
      receivedAt: new Date(),
    };

    await prisma.rawMessage.create({ data: row });

    // A forwarder retrying on flaky signal must not create a second
    // transaction. The guarantee is a UNIQUE constraint in the database,
    // not an application-level check subject to races.
    await expect(prisma.rawMessage.create({ data: row })).rejects.toThrow();
  });

  it('filters by user, which is how every query must be scoped', async () => {
    const mine = await prisma.transaction.findMany({ where: { userId } });
    const someoneElse = await prisma.transaction.findMany({
      where: { userId: '55555555-5555-5555-5555-555555555555' },
    });

    expect(mine.length).toBeGreaterThan(0);
    expect(someoneElse).toHaveLength(0);
  });
});
