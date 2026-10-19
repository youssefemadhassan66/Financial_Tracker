import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/api/container.js';
import { createServer } from '../../src/api/server.js';
import { getPrismaClient } from '../../src/infrastructure/persistence/prisma-client.js';
import { PrismaRawMessageRepository } from '../../src/infrastructure/persistence/prisma-raw-message-repository.js';
import { PrismaAvailableBalanceRepository } from '../../src/infrastructure/persistence/prisma-finance-repositories.js';
import { Account } from '../../src/domain/account.js';
import { Money } from '../../src/domain/money.js';
import { newAccountId, newUserId } from '../../src/domain/ids.js';
import { systemClock } from '../../src/infrastructure/system-clock.js';
import { BANK_CATALOG } from '../../src/domain/sms/banks/index.js';
import type { SmsCatalog } from '../../src/domain/sms/sms-template.js';
import type { ParsePayload } from '../../src/application/ports/sms.js';
import { databaseAvailable, PASSWORD, testConfig } from './helpers.js';

/**
 * SMS -> transaction, end to end: phone posts with its device key, the
 * API parses on the spot, the transaction shows up in the user's list
 * and analytics, and fixing an account makes reprocess pick up the rest.
 *
 * The bank here is FICTIONAL; real bank formats have their own tests.
 */
const hasDb = await databaseAvailable();
const suite = hasDb ? describe : describe.skip;

const CATALOG: SmsCatalog = {
  templates: [
    {
      id: 'test.purchase',
      bank: 'Test Bank',
      senders: ['TESTBANK'],
      event: 'purchase',
      pattern: /card (?<last4>\d{4}) charged (?<currency>[A-Z]{3}) (?<amount>[\d,.]+) at (?<merchant>.+)$/,
    },
    // The real CIB formats too (sender CIB), for the transfer pairing suite.
    ...BANK_CATALOG.templates,
  ],
  ignoreRules: BANK_CATALOG.ignoreRules,
};

const config = testConfig();
const prisma = getPrismaClient();
const container = buildContainer(config, prisma, systemClock, CATALOG);
const app = createServer(container, config);
const emails: string[] = [];

afterAll(async () => {
  if (hasDb) await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

async function newUser() {
  const email = `sms-${randomUUID()}@example.com`;
  emails.push(email);
  const token = (await request(app).post('/api/auth/register').send({ email, password: PASSWORD })).body
    .accessToken as string;
  const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const deviceKey = (await as(request(app).post('/api/devices')).send({ name: 'Phone' })).body.key as string;
  return {
    get: (path: string) => as(request(app).get(path)),
    post: (path: string, body?: object) => as(request(app).post(path)).send(body ?? {}),
    patch: (path: string, body: object) => as(request(app).patch(path)).send(body),
    sms: (body: string, minutesAgo = 5, sender = 'TESTBANK') =>
      request(app)
        .post('/api/ingest/sms')
        .set('X-Device-Key', deviceKey)
        .send({ sender, body, receivedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString() }),
    /** Sends an exact payload — what a phone retry on bad signal does. */
    rawSms: (payload: object) => request(app).post('/api/ingest/sms').set('X-Device-Key', deviceKey).send(payload),
  };
}

suite('SMS -> transaction', () => {
  let me: Awaited<ReturnType<typeof newUser>>;
  let other: Awaited<ReturnType<typeof newUser>>;

  beforeAll(async () => {
    me = await newUser();
    other = await newUser();
    await me.post('/api/accounts', { name: 'Test Visa', type: 'credit_card', currency: 'EGP', last4s: ['1234'] });
  });

  it('parses a purchase the moment it arrives', async () => {
    const res = await me.sms('card 1234 charged EGP 1,250.50 at CARREFOUR MAADI', 30);
    expect(res.status).toBe(201);
    expect(res.body.processing).toBe('parsed');

    const txs = (await me.get('/api/transactions')).body.transactions as object[];
    expect(txs).toEqual([
      expect.objectContaining({ amount: '1250.50', merchant: 'CARREFOUR MAADI', kind: 'expense', direction: 'debit' }),
    ]);
  });

  it('never creates a second transaction when the phone retries', async () => {
    const payload = {
      sender: 'TESTBANK',
      body: 'card 1234 charged EGP 99.00 at KIOSK',
      receivedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    };
    const first = await me.rawSms(payload);
    const retry = await me.rawSms(payload);
    const reprocess = await me.post('/api/sms/reprocess');

    expect(first.body.processing).toBe('parsed');
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ id: first.body.id, duplicate: true });
    expect(reprocess.body.parsed).toBe(0);
    const kiosk = ((await me.get('/api/transactions')).body.transactions as { merchant: string }[]).filter(
      (t) => t.merchant === 'KIOSK',
    );
    expect(kiosk).toHaveLength(1);
  });

  it('keeps an SMS for an unknown card as unparsed, then parses it after the account is fixed', async () => {
    const res = await me.sms('card 9999 charged EGP 40.00 at BAKERY', 10);
    expect(res.status).toBe(201);
    expect(res.body.processing).toBe('unparsed');

    const unparsed = (await me.get('/api/sms?status=unparsed')).body.messages as { parseError: string }[];
    expect(unparsed[0]?.parseError).toContain('9999');

    await me.post('/api/accounts', { name: 'Debit', type: 'checking', currency: 'EGP', last4s: ['9999'] });
    const summary = (await me.post('/api/sms/reprocess')).body;
    expect(summary).toMatchObject({ parsed: 1, next: null });
    expect((await me.get('/api/sms?status=unparsed')).body.messages).toEqual([]);
  });

  it('ignores an OTP and a personal SMS', async () => {
    expect((await me.sms('Your OTP is 552211', 3)).body.processing).toBe('ignored');
    expect((await me.sms('card 1234 charged EGP 10.00 at FAKE', 2, '+201001234567')).body.processing).toBe('ignored');
  });

  it('counts parsed spending in analytics', async () => {
    const res = await me.get('/api/analytics/categories');
    const egp = (res.body.currencies as { currency: string; spending: { total: string } }[]).find((c) => c.currency === 'EGP');
    // 1250.50 + 99.00 + 40.00 — the OTP and personal SMS added nothing.
    expect(egp?.spending.total).toBe('1389.50');
  });

  it('creates exactly one transaction when two runs race on the same message', async () => {
    const { id: userId } = await prisma.user.findUniqueOrThrow({ where: { email: emails[0]! }, select: { id: true } });
    const device = await prisma.deviceKey.findFirstOrThrow({ where: { userId }, select: { id: true } });
    const stored = await container.storeRawSms.execute(userId as never, device.id, {
      sender: 'TESTBANK',
      body: 'card 1234 charged EGP 7.00 at RACE',
      receivedAt: new Date(Date.now() - 60_000),
    });

    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => container.processRawSms.execute(userId as never, stored.id)),
    );

    expect(outcomes.filter((o) => o.status === 'parsed')).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === 'already-processed')).toHaveLength(4);
    expect(await prisma.transaction.count({ where: { rawMessageId: stored.id } })).toBe(1);
  });

  it("shows each user only their own messages", async () => {
    expect((await other.get('/api/sms')).body.messages).toEqual([]);
    expect((await me.get('/api/sms')).body.messages.length).toBeGreaterThan(0);
  });

  it('refuses the phone key on the read endpoints', async () => {
    expect((await request(app).get('/api/sms')).status).toBe(401);
  });

  it('rejects unknown fields and a bad cursor', async () => {
    expect((await me.get('/api/sms?status=weird')).status).toBe(400);
    expect((await me.post('/api/sms/reprocess', { after: 'not-a-uuid' })).status).toBe(400);
    expect((await me.post('/api/sms/reprocess', { userId: 'x' })).status).toBe(400);
  });
});

suite('one account, several card/account numbers', () => {
  let me: Awaited<ReturnType<typeof newUser>>;
  let other: Awaited<ReturnType<typeof newUser>>;
  let accountId: string;

  beforeAll(async () => {
    me = await newUser();
    other = await newUser();
    // Like a real CIB account: created knowing only the debit card digits.
    const res = await me.post('/api/accounts', { name: 'CIB Current', type: 'checking', currency: 'EGP', last4s: ['1111'] });
    accountId = res.body.account.id as string;
  });

  it('routes an SMS quoting the second number to the same account once it is added', async () => {
    // e.g. an InstaPay transfer, which quotes the ACCOUNT digits, not the card.
    expect((await me.sms('card 2222 charged EGP 800.00 at TEST FRIEND NAME', 10)).body.processing).toBe('unparsed');

    const patched = await me.patch(`/api/accounts/${accountId}`, { last4s: ['1111', '2222'] });
    expect(patched.status).toBe(200);
    expect(patched.body.account.last4s).toEqual(['1111', '2222']);

    expect((await me.post('/api/sms/reprocess')).body).toMatchObject({ parsed: 1 });
    expect((await me.sms('card 1111 charged EGP 5.00 at Uber', 5)).body.processing).toBe('parsed');

    const txs = (await me.get('/api/transactions')).body.transactions as { accountId: string }[];
    expect(txs).toHaveLength(2);
    expect(txs.every((t) => t.accountId === accountId)).toBe(true);
  });

  it('refuses digits another active account already uses', async () => {
    const res = await me.post('/api/accounts', { name: 'Second', type: 'checking', currency: 'EGP', last4s: ['2222'] });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('CIB Current');
  });

  it("treats another user's account as not found, and leaves it untouched", async () => {
    expect((await other.patch(`/api/accounts/${accountId}`, { last4s: ['9999'] })).status).toBe(404);
    const mine = (await me.get('/api/accounts')).body.accounts as { id: string; last4s: string[] }[];
    expect(mine.find((a) => a.id === accountId)?.last4s).toEqual(['1111', '2222']);
  });

  it('rejects bad input', async () => {
    const path = `/api/accounts/${accountId}`;
    expect((await me.patch(path, { last4s: ['12'] })).status).toBe(400);
    expect((await me.patch(path, {})).status).toBe(400);
    expect((await me.patch(path, { last4s: ['1111'], userId: 'x' })).status).toBe(400);
    expect((await me.patch('/api/accounts/not-a-uuid', { last4s: ['1111'] })).status).toBe(400);
  });
});

// Fake digits: 2222 = checking account, 1111 = credit card.
const debitSms = (amount: string) =>
  `Your account ending with ********2222 is debited with amount EGP ${amount}DR On 07 SEP 2026 with transfer to another account. For more information, please contact 19666.`;
const paymentSms = (amount: string) => `تم سداد مبلغ ${amount} جم فى بطاقتكم الائتمانية المنتهية بـ 1111 بتاريخ 26-09-07`;

suite('credit card payment = one internal transfer', () => {
  let me: Awaited<ReturnType<typeof newUser>>;
  let other: Awaited<ReturnType<typeof newUser>>;
  let userId: string;
  let deviceId: string;

  beforeAll(async () => {
    me = await newUser();
    other = await newUser();
    await me.post('/api/accounts', { name: 'CIB Current', type: 'checking', currency: 'EGP', last4s: ['2222'] });
    await me.post('/api/accounts', { name: 'CIB Visa', type: 'credit_card', currency: 'EGP', last4s: ['1111'] });
    ({ id: userId } = await prisma.user.findUniqueOrThrow({ where: { email: emails.at(-2)! }, select: { id: true } }));
    ({ id: deviceId } = await prisma.deviceKey.findFirstOrThrow({ where: { userId }, select: { id: true } }));
  });

  const txFor = (messageIds: string[]) =>
    prisma.transaction.findMany({
      where: { rawMessageId: { in: messageIds } },
      select: { kind: true, direction: true, countsAsSpending: true, transferGroupId: true, amount: true },
    });

  it('pairs the account debit and the card payment into one transfer, never spending', async () => {
    const a = await me.sms(debitSms('1,200.00'), 10, 'CIB');
    expect(a.body.processing).toBe('awaiting_pair');
    const b = await me.sms(paymentSms('1200.00'), 6, 'CIB');
    expect(b.body.processing).toBe('parsed');

    const txs = await txFor([a.body.id, b.body.id]);
    expect(txs).toHaveLength(2);
    expect(new Set(txs.map((t) => t.transferGroupId)).size).toBe(1);
    expect(txs.every((t) => t.kind === 'transfer' && !t.countsAsSpending && t.amount.toFixed(2) === '1200.00')).toBe(true);
    expect(txs.map((t) => t.direction).sort()).toEqual(['credit', 'debit']);
    expect((await me.get('/api/sms?status=awaiting_pair')).body.messages).toEqual([]);

    const egp = ((await me.get('/api/analytics/categories')).body.currencies as { currency: string; spending: { total: string } }[])
      .find((c) => c.currency === 'EGP');
    expect(egp?.spending.total ?? '0.00').toBe('0.00');
  });

  it('creates exactly one pair when both halves are processed at the same moment', async () => {
    for (let round = 0; round < 5; round++) {
      const amount = `${300 + round}.00`;
      const store = (body: string) =>
        container.storeRawSms.execute(userId as never, deviceId, { sender: 'CIB', body, receivedAt: new Date(Date.now() - 60_000) });
      const a = await store(debitSms(amount));
      const b = await store(paymentSms(amount));

      await Promise.all([
        container.processRawSms.execute(userId as never, a.id),
        container.processRawSms.execute(userId as never, b.id),
      ]);

      const txs = await txFor([a.id, b.id]);
      expect(txs, `round ${round}`).toHaveLength(2);
      const statuses = await prisma.rawMessage.findMany({ where: { id: { in: [a.id, b.id] } }, select: { status: true } });
      expect(statuses.map((s) => s.status), `round ${round}`).toEqual(['parsed', 'parsed']);
    }
  });

  it('never pairs on a stale search when a second debit races the payment', async () => {
    // One debit waiting; a second identical debit and the payment arrive
    // together. Either the payment pairs with the first debit and the
    // second waits normally (it came later), or all three wait as
    // ambiguous. Never a pair next to a debit told "several matches"
    // whose partner is already gone. (Timing-dependent: a smoke test.)
    for (let round = 0; round < 5; round++) {
      const amount = `${400 + round}.00`;
      const store = (body: string) =>
        container.storeRawSms.execute(userId as never, deviceId, { sender: 'CIB', body, receivedAt: new Date(Date.now() - 60_000) });
      const a1 = await store(debitSms(amount));
      await container.processRawSms.execute(userId as never, a1.id);
      const a2 = await store(debitSms(amount).replace('07 SEP', '08 SEP'));
      const b = await store(paymentSms(amount));

      await Promise.all([
        container.processRawSms.execute(userId as never, a2.id),
        container.processRawSms.execute(userId as never, b.id),
      ]);

      const rows = await prisma.rawMessage.findMany({
        where: { id: { in: [a1.id, a2.id, b.id] } },
        select: { id: true, status: true, parseError: true },
      });
      const paired = rows.filter((r) => r.status === 'parsed');
      if (paired.length > 0) {
        expect(paired.map((r) => r.id).sort(), `round ${round}`).toEqual([a1.id, b.id].sort());
        expect(rows.find((r) => r.id === a2.id)?.parseError, `round ${round}`).toBe('Waiting for the matching credit card payment SMS');
      } else {
        expect(rows.map((r) => r.status), `round ${round}`).toEqual(['awaiting_pair', 'awaiting_pair', 'awaiting_pair']);
      }
      // Leave no halves waiting for the tests below to trip over.
      const ids = [a1.id, a2.id, b.id];
      await prisma.transaction.deleteMany({ where: { rawMessageId: { in: ids } } });
      await prisma.rawMessage.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('lets the user pair manually when two debits could match', async () => {
    const a1 = await me.sms(debitSms('777.00'), 30, 'CIB');
    const a2 = await me.sms(debitSms('777.00').replace('07 SEP', '08 SEP'), 20, 'CIB');
    const b = await me.sms(paymentSms('777.00'), 10, 'CIB');
    expect(b.body.processing).toBe('awaiting_pair');

    const body = { debitMessageId: a2.body.id, paymentMessageId: b.body.id };
    expect((await other.post('/api/sms/pair', body)).status).toBe(404);
    expect((await me.post('/api/sms/pair', { ...body, extra: 1 })).status).toBe(400);
    expect((await me.post('/api/sms/pair', { debitMessageId: 'x', paymentMessageId: b.body.id })).status).toBe(400);

    const res = await me.post('/api/sms/pair', body);
    expect(res.status).toBe(201);
    expect(res.body.transactionIds).toHaveLength(2);
    expect(await txFor([a2.body.id, b.body.id])).toHaveLength(2);

    // Already paired: a second attempt is a conflict, not a second transfer.
    expect((await me.post('/api/sms/pair', body)).status).toBe(409);
    const waiting = (await me.get('/api/sms?status=awaiting_pair')).body.messages as { id: string }[];
    expect(waiting.map((m) => m.id)).toEqual([a1.body.id]);
  });

  it('refuses a stale pairing when a half changed after it was read', async () => {
    // Different amounts, so both stay waiting.
    const a = await me.sms(debitSms('905.00'), 5, 'CIB');
    const b = await me.sms(paymentSms('906.00'), 4, 'CIB');
    const rows = await prisma.rawMessage.findMany({
      where: { id: { in: [a.body.id, b.body.id] } },
      select: { id: true, parsedPayload: true },
    });
    // As if a reprocess re-routed the debit to another account after the
    // pairing read it: the payload the pairing holds no longer matches.
    const legs = rows.map((r) => {
      const payload = r.parsedPayload as ParsePayload;
      return {
        messageId: r.id,
        transaction: null as never, // never reached: the claim fails first
        payload: r.id === a.body.id ? { ...payload, accountId: randomUUID() } : payload,
      };
    });

    const result = await new PrismaRawMessageRepository(prisma).completeTransferPair(userId as never, [legs[0]!, legs[1]!], {
      from: new Date(0),
      to: new Date(0),
      hasRival: () => false,
    });
    expect(result).toBe('already-processed');
    const statuses = await prisma.rawMessage.findMany({ where: { id: { in: [a.body.id, b.body.id] } }, select: { status: true } });
    expect(statuses.map((r) => r.status)).toEqual(['awaiting_pair', 'awaiting_pair']);
  });

  it('makes parking a transfer half wait while a pairing of the same user is in progress', async () => {
    const a = await me.sms(debitSms('925.00'), 5, 'CIB');
    const repo = new PrismaRawMessageRepository(prisma);
    const payload = (await prisma.rawMessage.findUniqueOrThrow({ where: { id: a.body.id } })).parsedPayload as ParsePayload;

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    // Stands in for a pairing mid-transaction: the same row lock it takes.
    const pairing = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      locked();
      await held;
    });
    await lockTaken;

    let parkedAt = 0;
    const park = repo
      .markNotTransaction(a.body.id, userId as never, 'awaiting_pair', 'test', payload)
      .then(() => (parkedAt = Date.now()));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(parkedAt).toBe(0); // still waiting on the lock

    const releasedAt = Date.now();
    release();
    await Promise.all([pairing, park]);
    expect(parkedAt).toBeGreaterThanOrEqual(releasedAt);
  });

  it('re-reads the other waiting halves inside the pairing and backs out on a rival', async () => {
    // Different amounts, so all three stay waiting.
    const a = await me.sms(debitSms('915.00'), 5, 'CIB');
    const b = await me.sms(paymentSms('916.00'), 4, 'CIB');
    const c = await me.sms(debitSms('917.00'), 3, 'CIB');
    const rows = await prisma.rawMessage.findMany({
      where: { id: { in: [a.body.id, b.body.id] } },
      select: { id: true, parsedPayload: true },
    });
    const legs = rows.map((r) => ({ messageId: r.id, transaction: null as never, payload: r.parsedPayload as ParsePayload }));
    let seen: string[] = [];

    const result = await new PrismaRawMessageRepository(prisma).completeTransferPair(userId as never, [legs[0]!, legs[1]!], {
      from: new Date(Date.now() - 60 * 60_000),
      to: new Date(),
      hasRival: (waiting) => {
        seen = waiting.map((w) => w.id);
        return seen.includes(c.body.id);
      },
    });
    expect(result).toBe('ambiguous');
    // It saw the third half, and not the two it had just claimed.
    expect(seen).toContain(c.body.id);
    expect(seen).not.toContain(a.body.id);
    expect(seen).not.toContain(b.body.id);
    // Rolled back: the claims are undone.
    const statuses = await prisma.rawMessage.findMany({ where: { id: { in: [a.body.id, b.body.id] } }, select: { status: true } });
    expect(statuses.map((r) => r.status)).toEqual(['awaiting_pair', 'awaiting_pair']);
  });
});

suite('money coming in, and the balance the bank reports', () => {
  let me: Awaited<ReturnType<typeof newUser>>;
  let other: Awaited<ReturnType<typeof newUser>>;

  // Fake digits and names only.
  const purchase = (balance: string) =>
    `تم خصم مبلغ EGP 50.00 من بطاقة الخصم المباشر المنتهية بـ **4444 عند TEST CAFE في 18/09/26 03:16 ، الرصيد المتاح EGP ${balance}`;
  const incoming = 'يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 2,500.00 جم إلى حسابك المنتهي بـ ********2222 من SARA HASSAN TEST برقم مرجعي c9d0e1f2 بتاريخ 2026-09-12 18:47 للمزيد، برجاء الاتصال بـ 19666';

  type AccountBody = { name: string; available: { amount: string; reportedAt: string } | null };
  const current = async (who = me) =>
    ((await who.get('/api/accounts')).body.accounts as AccountBody[]).find((a) => a.name === 'CIB Current');

  beforeAll(async () => {
    me = await newUser();
    other = await newUser();
    await me.post('/api/accounts', { name: 'CIB Current', type: 'checking', currency: 'EGP', last4s: ['2222', '4444'] });
  });

  it('records an incoming InstaPay transfer as income from the sender', async () => {
    const res = await me.sms(incoming, 40, 'CIB');
    expect(res.body.processing).toBe('parsed');
    const txs = (await me.get('/api/transactions')).body.transactions as object[];
    expect(txs).toContainEqual(
      expect.objectContaining({ amount: '2500.00', merchant: 'SARA HASSAN TEST', kind: 'income', direction: 'credit', countsAsSpending: false }),
    );
  });

  it('shows no balance until an SMS reports one', async () => {
    expect((await current())?.available).toBeNull();
  });

  it('keeps the newest reported balance, whatever order the SMS arrive in', async () => {
    await me.sms(purchase('2,188.16'), 10, 'CIB');
    expect((await current())?.available).toEqual({ amount: '2188.16', reportedAt: expect.any(String) });
    const tenMinutesAgo = (await current())!.available!.reportedAt;

    // A late SMS from BEFORE the one above must not overwrite it.
    await me.sms(purchase('9,999.00'), 30, 'CIB');
    expect((await current())?.available).toEqual({ amount: '2188.16', reportedAt: tenMinutesAgo });

    await me.sms(purchase('0.00'), 2, 'CIB');
    expect((await current())?.available?.amount).toBe('0.00');
  });

  it('keeps the newer one when two reports race on a fresh account', async () => {
    const account = await prisma.account.create({
      data: { userId: (await prisma.user.findUniqueOrThrow({ where: { email: emails.at(-2)! } })).id, name: 'Race', type: 'checking', currency: 'EGP' },
    });
    const repo = new PrismaAvailableBalanceRepository(prisma);
    const restored = Account.restore(
      { id: newAccountId(account.id), userId: newUserId(account.userId), name: 'Race', type: 'checking', currency: 'EGP', last4s: [] },
      null,
    );
    const older = new Date(Date.now() - 60_000);
    const newer = new Date();
    await Promise.all([
      repo.record(restored, Money.create('100.00', 'EGP'), newer),
      repo.record(restored, Money.create('999.00', 'EGP'), older),
    ]);
    const row = await prisma.accountAvailableBalance.findUniqueOrThrow({ where: { accountId: account.id } });
    expect(row.amount.toFixed(2)).toBe('100.00');
    expect(row.reportedAt.getTime()).toBe(newer.getTime());
  });

  it("never shows one user's balance to another", async () => {
    expect((await other.get('/api/accounts')).body.accounts).toEqual([]);
  });
});
