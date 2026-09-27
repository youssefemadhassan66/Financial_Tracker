import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/api/container.js';
import { createServer } from '../../src/api/server.js';
import { getPrismaClient } from '../../src/infrastructure/persistence/prisma-client.js';
import { systemClock } from '../../src/infrastructure/system-clock.js';
import { BANK_CATALOG } from '../../src/domain/sms/banks/index.js';
import { databaseAvailable, PASSWORD, testConfig } from './helpers.js';

/** Subscription suggestions end to end. FAKE data only. */
const hasDb = await databaseAvailable();
const suite = hasDb ? describe : describe.skip;

const config = testConfig();
const prisma = getPrismaClient();
const app = createServer(buildContainer(config, prisma, systemClock, BANK_CATALOG), config);
const emails: string[] = [];

afterAll(async () => {
  if (hasDb) await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

async function newUser() {
  const email = `subs-sug-${randomUUID()}@example.com`;
  emails.push(email);
  const token = (await request(app).post('/api/auth/register').send({ email, password: PASSWORD })).body.accessToken as string;
  const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (path: string) => as(request(app).get(path)),
    post: (path: string, body: object = {}) => as(request(app).post(path)).send(body),
  };
}

interface SuggestionBody {
  merchantKey: string;
  name: string;
  amount: string;
  currency: string;
  cycle: string;
  anchorDate: string;
  lastChargeDate: string;
  chargeCount: number;
  accountId: string | null;
  transactionIds: string[];
}

interface SubscriptionBody {
  id: string;
  name: string;
  lastCharge: { transactionId: string; amount: string; currency: string } | null;
  priceChanged: boolean;
  missedCharge: string | null;
}

suite('subscription suggestions', () => {
  let me: Awaited<ReturnType<typeof newUser>>;
  let other: Awaited<ReturnType<typeof newUser>>;
  let card: string;

  const suggestions = async (user = me) =>
    (await user.get('/api/subscriptions/suggestions')).body.suggestions as SuggestionBody[];
  const subscriptions = async (user = me) =>
    (await user.get('/api/subscriptions')).body.subscriptions as SubscriptionBody[];
  const expense = (merchant: string, amount: string, occurredAt: string) =>
    me.post('/api/transactions', { accountId: card, amount, direction: 'debit', kind: 'expense', merchant, occurredAt });

  // Dates computed relative to new Date() so the test never goes stale.
  const now = new Date();
  const d3 = new Date(now.getTime() - 10 * 86_400_000); // 10 days ago (running)
  const d2 = new Date(d3.getTime() - 30 * 86_400_000); // 40 days ago (30-day gap)
  const d1 = new Date(d2.getTime() - 30 * 86_400_000); // 70 days ago (30-day gap)

  beforeAll(async () => {
    me = await newUser();
    other = await newUser();
    card = (
      await me.post('/api/accounts', {
        name: 'Test Visa',
        type: 'credit_card',
        currency: 'EGP',
        last4s: ['1111'],
      })
    ).body.account.id;
  });

  it('suggests repeat charges, isolates per user, dismisses, and links past charges on accept', async () => {
    // 1. Post 3 monthly expenses for TEST GYM
    await expense('TEST GYM', '500.00', d1.toISOString());
    await expense('TEST GYM', '500.00', d2.toISOString());
    await expense('TEST GYM', '500.00', d3.toISOString());

    // 2. GET suggestions shows one with chargeCount 3
    const gymSuggestions = await suggestions(me);
    expect(gymSuggestions).toHaveLength(1);
    expect(gymSuggestions[0]).toMatchObject({
      merchantKey: 'TEST GYM',
      chargeCount: 3,
      amount: '500.00',
      currency: 'EGP',
      cycle: 'monthly',
      accountId: card,
    });

    // 3. Another user sees none
    expect(await suggestions(other)).toEqual([]);

    // 4. Dismiss -> gone
    const dismissRes = await me.post('/api/subscriptions/suggestions/dismiss', { merchantKey: 'TEST GYM' });
    expect(dismissRes.status).toBe(204);
    expect(await suggestions(me)).toEqual([]);

    // 5. A second merchant accepted via POST /api/subscriptions
    await expense('TEST STREAM', '150.00', d1.toISOString());
    await expense('TEST STREAM', '150.00', d2.toISOString());
    await expense('TEST STREAM', '150.00', d3.toISOString());

    const streamSuggestions = await suggestions(me);
    expect(streamSuggestions).toHaveLength(1);
    const suggestion = streamSuggestions[0]!;
    expect(suggestion.merchantKey).toBe('TEST STREAM');

    // Accepting the suggestion
    const createRes = await me.post('/api/subscriptions', {
      name: suggestion.name,
      amount: suggestion.amount,
      currency: suggestion.currency,
      cycle: suggestion.cycle,
      anchorDate: suggestion.anchorDate,
      accountId: suggestion.accountId,
      merchant: suggestion.merchantKey,
    });
    expect(createRes.status).toBe(201);

    // Its charges are linked and lastCharge is not null
    const allSubs = await subscriptions(me);
    const createdSub = allSubs.find((s) => s.name === suggestion.name);
    expect(createdSub).toBeDefined();
    expect(createdSub?.lastCharge).not.toBeNull();
    expect(createdSub?.lastCharge?.amount).toBe('150.00');
    // Every past charge in the streak is linked, not just the newest.
    const linked = await prisma.transaction.findMany({
      where: { subscriptionId: createdSub!.id },
      select: { id: true },
      orderBy: { occurredAt: 'asc' },
    });
    expect(linked.map((t) => t.id)).toEqual(suggestion.transactionIds);

    // And it is no longer suggested
    expect(await suggestions(me)).toEqual([]);
  });

  it('rejects dismiss with an empty or blank merchantKey with 400', async () => {
    const blankRes = await me.post('/api/subscriptions/suggestions/dismiss', { merchantKey: '   ' });
    expect(blankRes.status).toBe(400);

    const emptyRes = await me.post('/api/subscriptions/suggestions/dismiss', { merchantKey: '' });
    expect(emptyRes.status).toBe(400);
  });
});
