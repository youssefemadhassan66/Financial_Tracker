import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/api/container.js';
import { createServer } from '../../src/api/server.js';
import { getPrismaClient } from '../../src/infrastructure/persistence/prisma-client.js';
import { BANK_CATALOG } from '../../src/domain/sms/banks/index.js';
import { databaseAvailable, PASSWORD, testConfig } from './helpers.js';

/** Charges linked to the subscriptions they pay, end to end. FAKE data only. */
const hasDb = await databaseAvailable();
const suite = hasDb ? describe : describe.skip;

const config = testConfig();
const prisma = getPrismaClient();
// A fixed "today": the charges below are dated September 2026, and "missed
// charge" depends on how many billing dates have passed. With the real clock
// this test started failing once October's billing date went by.
const clock = { now: () => new Date('2026-09-20T12:00:00Z') };
const app = createServer(buildContainer(config, prisma, clock, BANK_CATALOG), config);
const emails: string[] = [];

afterAll(async () => {
  if (hasDb) await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

async function newUser() {
  const email = `subs-match-${randomUUID()}@example.com`;
  emails.push(email);
  const token = (await request(app).post('/api/auth/register').send({ email, password: PASSWORD })).body.accessToken as string;
  const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (path: string) => as(request(app).get(path)),
    post: (path: string, body: object = {}) => as(request(app).post(path)).send(body),
  };
}

interface SubscriptionBody {
  id: string;
  name: string;
  lastCharge: { transactionId: string; amount: string; currency: string } | null;
  priceChanged: boolean;
  missedCharge: string | null;
}

suite('subscription charges', () => {
  let me: Awaited<ReturnType<typeof newUser>>;
  let other: Awaited<ReturnType<typeof newUser>>;
  let card: string;

  const subscriptions = async (user = me) => (await user.get('/api/subscriptions')).body.subscriptions as SubscriptionBody[];
  const expense = (merchant: string, amount: string, occurredAt: string) =>
    me.post('/api/transactions', { accountId: card, amount, direction: 'debit', kind: 'expense', merchant, occurredAt });

  beforeAll(async () => {
    me = await newUser();
    other = await newUser();
    card = (await me.post('/api/accounts', { name: 'Test Visa', type: 'credit_card', currency: 'EGP', last4s: ['1111'] })).body
      .account.id;
  });

  it('links a charge on a billing date, shows it, and links it only once', async () => {
    await me.post('/api/subscriptions', {
      name: 'Test Stream', merchant: 'TEST STREAM', amount: '149.99', currency: 'EGP', cycle: 'monthly', anchorDate: '2026-08-10',
    });
    const tx = await expense('TEST STREAM COM', '149.99', '2026-09-10T10:00:00Z');
    await expense('TEST CAFE', '149.99', '2026-09-10T11:00:00Z');

    // Another user's run links nothing of yours.
    expect((await other.post('/api/subscriptions/match')).body).toEqual({ linked: 0 });

    expect((await me.post('/api/subscriptions/match')).body).toEqual({ linked: 1 });
    expect((await me.post('/api/subscriptions/match')).body).toEqual({ linked: 0 });

    const [stream] = await subscriptions();
    expect(stream).toMatchObject({
      name: 'Test Stream',
      lastCharge: { transactionId: tx.body.id, amount: '149.99', currency: 'EGP' },
      priceChanged: false,
      missedCharge: null,
    });
  });

  it('reports a price change when the charge is not the subscription price', async () => {
    await me.post('/api/subscriptions', {
      name: 'Test Music', merchant: 'TEST MUSIC', amount: '59.99', currency: 'EGP', cycle: 'monthly', anchorDate: '2026-08-12',
    });
    await expense('TEST MUSIC', '69.99', '2026-09-12T10:00:00Z');
    expect((await me.post('/api/subscriptions/match')).body).toEqual({ linked: 1 });

    const music = (await subscriptions()).find((s) => s.name === 'Test Music');
    expect(music).toMatchObject({ lastCharge: { amount: '69.99' }, priceChanged: true });
  });

  it('never shows another user your subscriptions or charges', async () => {
    expect(await subscriptions(other)).toEqual([]);
  });
});
