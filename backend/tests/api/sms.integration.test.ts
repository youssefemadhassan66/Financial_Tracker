import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/api/container.js';
import { createServer } from '../../src/api/server.js';
import { getPrismaClient } from '../../src/infrastructure/persistence/prisma-client.js';
import { systemClock } from '../../src/infrastructure/system-clock.js';
import { BANK_CATALOG } from '../../src/domain/sms/banks/index.js';
import type { SmsCatalog } from '../../src/domain/sms/sms-template.js';
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
