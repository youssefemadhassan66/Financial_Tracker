import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient } from '../../src/infrastructure/persistence/prisma-client.js';
import { buildTestApp, databaseAvailable, PASSWORD } from './helpers.js';

/**
 * Analytics and subscriptions, end to end, through real HTTP and a real
 * database — modelled on an actual month: a CIB card, a manual card
 * payment, a TMG share purchase, salary, and subscriptions in EGP and USD.
 */
const hasDb = await databaseAvailable();
const suite = hasDb ? describe : describe.skip;

const app = buildTestApp();
const prisma = getPrismaClient();
const emails: string[] = [];

async function newUser() {
  const email = `fin-${randomUUID()}@example.com`;
  emails.push(email);
  const res = await request(app).post('/api/auth/register').send({ email, password: PASSWORD });
  const token = res.body.accessToken as string;
  const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (path: string) => as(request(app).get(path)),
    post: (path: string, body?: object) => as(request(app).post(path)).send(body ?? {}),
  };
}

afterAll(async () => {
  if (hasDb) await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

suite('finance flow — one realistic month', () => {
  let me: Awaited<ReturnType<typeof newUser>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    me = await newUser();

    const categories = (await me.get('/api/categories')).body.categories as { id: string; name: string }[];
    for (const c of categories) ids[c.name] = c.id;

    const account = async (name: string, type: string, currency = 'EGP') =>
      (await me.post('/api/accounts', { name, type, currency })).body.account.id as string;
    ids.bank = await account('CIB Current', 'checking');
    ids.card = await account('CIB Visa', 'credit_card');
    ids.broker = await account('Thndr', 'brokerage');
    ids.usdCard = await account('USD Card', 'credit_card', 'USD');

    const tx = (body: object) => me.post('/api/transactions', body).then((r) => {
      if (r.status !== 201) throw new Error(`setup failed: ${r.status} ${JSON.stringify(r.body)}`);
    });

    // --- August 2026 ---
    await tx({ accountId: ids.card, amount: '750.00', direction: 'debit', kind: 'expense', categoryId: ids['Food & Dining'], merchant: 'Zooba', occurredAt: '2026-08-10T19:00:00+03:00' });
    await tx({ accountId: ids.card, amount: '100.00', direction: 'credit', kind: 'expense', categoryId: ids['Food & Dining'], merchant: 'Zooba refund', occurredAt: '2026-08-12T12:00:00+03:00' });
    await tx({ accountId: ids.card, amount: '250.00', direction: 'debit', kind: 'expense', categoryId: ids['Groceries'], merchant: 'كارفور المعادي', occurredAt: '2026-08-15T18:00:00+03:00' });
    await tx({ accountId: ids.bank, amount: '2000.00', direction: 'debit', kind: 'expense', categoryId: ids['Travel'], merchant: 'EgyptAir', occurredAt: '2026-08-20T09:00:00+03:00' });
    await tx({ accountId: ids.broker, amount: '10000.00', direction: 'debit', kind: 'trade', merchant: 'TMG', occurredAt: '2026-08-05T11:00:00+03:00' });
    await tx({ accountId: ids.broker, amount: '25.00', direction: 'debit', kind: 'fee', categoryId: ids['Fees & Charges'], merchant: 'Thndr commission', occurredAt: '2026-08-05T11:00:00+03:00' });
    await tx({ accountId: ids.bank, amount: '30000.00', direction: 'credit', kind: 'income', categoryId: ids['Salary'], merchant: 'Employer', occurredAt: '2026-08-25T10:00:00+03:00' });
    await tx({ accountId: ids.usdCard, amount: '20.00', direction: 'debit', kind: 'expense', categoryId: ids['Subscriptions'], merchant: 'Claude.ai', occurredAt: '2026-08-25T10:00:00+03:00' });

    // The card payment you make manually: bank -> card. NOT spending.
    const transfer = await me.post('/api/transfers', { fromAccountId: ids.bank, toAccountId: ids.card, amount: '3000.00', occurredAt: '2026-08-28T10:00:00+03:00' });
    if (transfer.status !== 201) throw new Error(`transfer failed: ${JSON.stringify(transfer.body)}`);

    // --- The Cairo midnight boundary ---
    // 1 Aug 00:30 Cairo = 31 Jul 21:30 UTC. Belongs to AUGUST.
    await tx({ accountId: ids.card, amount: '99.00', direction: 'debit', kind: 'expense', categoryId: ids['Groceries'], merchant: 'Seoudi', occurredAt: '2026-07-31T21:30:00Z' });
    // 1 Sep 00:30 Cairo = 31 Aug 21:30 UTC. Belongs to SEPTEMBER, not August.
    await tx({ accountId: ids.card, amount: '5000.00', direction: 'debit', kind: 'expense', categoryId: ids['Food & Dining'], merchant: 'Late dinner', occurredAt: '2026-08-31T21:30:00Z' });

    // --- July, for the month-over-month comparison ---
    await tx({ accountId: ids.card, amount: '500.00', direction: 'debit', kind: 'expense', categoryId: ids['Food & Dining'], merchant: 'Zooba', occurredAt: '2026-07-15T19:00:00+03:00' });
  });

  it('starts every user with the default categories', () => {
    expect(ids['Food & Dining']).toBeDefined();
    expect(ids['Salary']).toBeDefined();
    expect(ids['Subscriptions']).toBeDefined();
  });

  it('reports August spending by category, correctly', async () => {
    const res = await me.get('/api/analytics/categories?from=2026-08-01&to=2026-08-31');
    expect(res.status).toBe(200);

    const egp = res.body.currencies.find((c: { currency: string }) => c.currency === 'EGP');
    const byName = Object.fromEntries(
      egp.spending.categories.map((c: { name: string; total: string }) => [c.name, c.total]),
    );

    expect(byName).toEqual({
      Travel: '2000.00',
      'Food & Dining': '650.00', // 750 minus the 100 refund
      Groceries: '349.00', // 250 + the 99 bought at 00:30 on 1 August, Cairo time
      'Fees & Charges': '25.00',
    });
    // The transfer (3000), the TMG shares (10000) and the 5000 dinner on
    // 1 September are all absent.
    expect(egp.spending.total).toBe('3024.00');
  });

  it('shows the TMG purchase under investing, not spending', async () => {
    const res = await me.get('/api/analytics/categories?from=2026-08-01&to=2026-08-31');
    const egp = res.body.currencies.find((c: { currency: string }) => c.currency === 'EGP');
    expect(egp.investing).toEqual({ invested: '10000.00', withdrawn: '0.00', net: '10000.00', count: 1 });
    expect(egp.income.total).toBe('30000.00');
  });

  it('keeps the USD Claude charge in its own currency section', async () => {
    const res = await me.get('/api/analytics/categories?from=2026-08-01&to=2026-08-31');
    const usd = res.body.currencies.find((c: { currency: string }) => c.currency === 'USD');
    expect(usd.spending.total).toBe('20.00');
    expect(usd.spending.categories[0].name).toBe('Subscriptions');
  });

  it('compares with July: food went from 500 to 650, +30%', async () => {
    const res = await me.get('/api/analytics/categories?from=2026-08-01&to=2026-08-31');
    const egp = res.body.currencies.find((c: { currency: string }) => c.currency === 'EGP');
    const food = egp.spending.categories.find((c: { name: string }) => c.name === 'Food & Dining');
    expect(res.body.previousPeriod).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    expect(food.previousTotal).toBe('500.00');
    expect(food.changePercent).toBe(30);
  });

  it('files the 00:30 purchase under September when asking about September', async () => {
    const res = await me.get('/api/analytics/categories?from=2026-09-01&to=2026-09-30');
    const egp = res.body.currencies.find((c: { currency: string }) => c.currency === 'EGP');
    expect(egp.spending.categories.find((c: { name: string }) => c.name === 'Food & Dining').total).toBe('5000.00');
  });

  it('records the card payment as two linked transfer rows', async () => {
    const res = await me.get('/api/transactions?from=2026-08-28&to=2026-08-28');
    const legs = res.body.transactions.filter((t: { kind: string }) => t.kind === 'transfer');
    expect(legs).toHaveLength(2);
    expect(new Set(legs.map((t: { direction: string }) => t.direction))).toEqual(new Set(['debit', 'credit']));
    expect(legs[0].transferGroupId).toBe(legs[1].transferGroupId);
    expect(legs.every((t: { countsAsSpending: boolean }) => !t.countsAsSpending)).toBe(true);
  });

  it('lists transactions newest first, filtered by Cairo dates, with Arabic intact', async () => {
    const res = await me.get('/api/transactions?from=2026-08-15&to=2026-08-15');
    expect(res.status).toBe(200);
    expect(res.body.transactions.map((t: { merchant: string }) => t.merchant)).toEqual(['كارفور المعادي']);
    expect(res.body.transactions[0].amount).toBe('250.00');
  });
});

suite('input rules for money', () => {
  let me: Awaited<ReturnType<typeof newUser>>;
  let bank: string;
  let usd: string;

  beforeAll(async () => {
    me = await newUser();
    bank = (await me.post('/api/accounts', { name: 'Bank', type: 'checking', currency: 'EGP' })).body.account.id;
    usd = (await me.post('/api/accounts', { name: 'USD', type: 'checking', currency: 'USD' })).body.account.id;
  });

  const base = () => ({ accountId: bank, amount: '10.00', direction: 'debit', kind: 'expense', merchant: 'X', occurredAt: '2026-08-01T10:00:00+03:00' });

  it('rejects an amount sent as a JSON number — floats lose cents', async () => {
    expect((await me.post('/api/transactions', { ...base(), amount: 10.5 })).status).toBe(400);
  });

  it('rejects zero, negative and 3-decimal amounts', async () => {
    for (const amount of ['0', '0.00', '-5.00', '1.234']) {
      expect((await me.post('/api/transactions', { ...base(), amount })).status).toBe(400);
    }
  });

  it('rejects income recorded as money going out', async () => {
    expect((await me.post('/api/transactions', { ...base(), kind: 'income' })).status).toBe(400);
  });

  it('refuses a one-sided transfer through the transactions endpoint', async () => {
    expect((await me.post('/api/transactions', { ...base(), kind: 'transfer' })).status).toBe(400);
  });

  it('refuses an income category on an expense', async () => {
    const categories = (await me.get('/api/categories')).body.categories;
    const salary = categories.find((c: { name: string }) => c.name === 'Salary').id;
    const res = await me.post('/api/transactions', { ...base(), categoryId: salary });
    expect(res.status).toBe(400);
  });

  it('refuses a transfer between currencies, or to the same account', async () => {
    const t = { amount: '5.00', occurredAt: '2026-08-01T10:00:00+03:00' };
    expect((await me.post('/api/transfers', { ...t, fromAccountId: bank, toAccountId: usd })).status).toBe(400);
    expect((await me.post('/api/transfers', { ...t, fromAccountId: bank, toAccountId: bank })).status).toBe(400);
  });

  it('rejects a duplicate category name with 409', async () => {
    const res = await me.post('/api/categories', { name: 'Food & Dining' });
    expect(res.status).toBe(409);
  });

  it('rejects an impossible date in a report query', async () => {
    expect((await me.get('/api/analytics/categories?from=2026-02-30')).status).toBe(400);
  });
});

suite('subscriptions', () => {
  let me: Awaited<ReturnType<typeof newUser>>;
  let netflixId: string;

  beforeAll(async () => {
    me = await newUser();
    const netflix = await me.post('/api/subscriptions', {
      name: 'Netflix', amount: '240.00', currency: 'EGP', cycle: 'monthly', anchorDate: '2026-01-05',
    });
    netflixId = netflix.body.subscription.id;
    await me.post('/api/subscriptions', {
      name: 'Claude Pro', amount: '20.00', currency: 'USD', cycle: 'monthly', anchorDate: '2026-02-25', merchant: 'CLAUDE.AI SUBSCRIPTION',
    });
    await me.post('/api/subscriptions', {
      name: 'Shahid VIP', amount: '1200.00', currency: 'EGP', cycle: 'yearly', anchorDate: '2026-03-01',
    });
  });

  it('files new subscriptions under the Subscriptions category by default', async () => {
    const categories = (await me.get('/api/categories')).body.categories;
    const subsCategory = categories.find((c: { name: string }) => c.name === 'Subscriptions').id;
    const list = (await me.get('/api/subscriptions')).body.subscriptions;
    expect(list.every((s: { categoryId: string }) => s.categoryId === subsCategory)).toBe(true);
  });

  it('computes the next charge date and the monthly cost', async () => {
    const list = (await me.get('/api/subscriptions')).body.subscriptions;
    const netflix = list.find((s: { name: string }) => s.name === 'Netflix');
    const shahid = list.find((s: { name: string }) => s.name === 'Shahid VIP');

    expect(netflix.nextChargeDate).toMatch(/^\d{4}-\d{2}-05$/); // always the 5th
    expect(shahid.monthlyEquivalent).toBe('100.00'); // 1200 / 12
    expect(shahid.yearlyCost).toBe('1200.00');
  });

  it('totals monthly and yearly cost per currency', async () => {
    const res = await me.get('/api/subscriptions/summary?days=31');
    expect(res.status).toBe(200);
    expect(res.body.activeCount).toBe(3);
    expect(res.body.totals).toEqual([
      { currency: 'EGP', monthly: '340.00', yearly: '4080.00' },
      { currency: 'USD', monthly: '20.00', yearly: '240.00' },
    ]);
    // A 31-day window always contains exactly one monthly charge each.
    const names = res.body.upcoming.map((u: { name: string }) => u.name);
    expect(names.filter((n: string) => n === 'Netflix')).toHaveLength(1);
    expect(names.filter((n: string) => n === 'Claude Pro')).toHaveLength(1);
  });

  it('pausing removes it from totals and upcoming charges', async () => {
    const paused = await me.post(`/api/subscriptions/${netflixId}/pause`);
    expect(paused.body.subscription.status).toBe('paused');
    expect(paused.body.subscription.nextChargeDate).toBeNull();

    const summary = (await me.get('/api/subscriptions/summary')).body;
    expect(summary.activeCount).toBe(2);
    expect(summary.totals[0]).toEqual({ currency: 'EGP', monthly: '100.00', yearly: '1200.00' });

    await me.post(`/api/subscriptions/${netflixId}/resume`);
  });

  it('a cancelled subscription cannot be resumed', async () => {
    const created = await me.post('/api/subscriptions', {
      name: 'Gym', amount: '900.00', currency: 'EGP', cycle: 'monthly', anchorDate: '2026-04-01',
    });
    const id = created.body.subscription.id;

    expect((await me.post(`/api/subscriptions/${id}/cancel`)).body.subscription.status).toBe('cancelled');
    expect((await me.post(`/api/subscriptions/${id}/resume`)).status).toBe(400);
  });

  it('rejects an unknown action and a non-uuid id', async () => {
    expect((await me.post(`/api/subscriptions/${netflixId}/delete`)).status).toBe(400);
    expect((await me.post('/api/subscriptions/not-a-uuid/pause')).status).toBe(400);
  });
});

suite('tenancy — one user can never touch another user’s money', () => {
  it('isolates accounts, categories, subscriptions and reports', async () => {
    const alice = await newUser();
    const bob = await newUser();

    const aliceBank = (await alice.post('/api/accounts', { name: 'Alice Bank', type: 'checking', currency: 'EGP' })).body.account.id;
    const aliceFood = (await alice.get('/api/categories')).body.categories.find((c: { name: string }) => c.name === 'Food & Dining').id;
    const aliceSub = (await alice.post('/api/subscriptions', {
      name: 'Netflix', amount: '240.00', currency: 'EGP', cycle: 'monthly', anchorDate: '2026-01-05',
    })).body.subscription.id;
    await alice.post('/api/transactions', {
      accountId: aliceBank, amount: '999.00', direction: 'debit', kind: 'expense', merchant: 'Secret', occurredAt: '2026-08-10T10:00:00+03:00',
    });

    const bobBank = (await bob.post('/api/accounts', { name: 'Bob Bank', type: 'checking', currency: 'EGP' })).body.account.id;

    // Bob cannot write into Alice's account…
    expect((await bob.post('/api/transactions', {
      accountId: aliceBank, amount: '1.00', direction: 'debit', kind: 'expense', merchant: 'x', occurredAt: '2026-08-10T10:00:00+03:00',
    })).status).toBe(404);
    // …nor use her category on his own account…
    expect((await bob.post('/api/transactions', {
      accountId: bobBank, amount: '1.00', direction: 'debit', kind: 'expense', categoryId: aliceFood, merchant: 'x', occurredAt: '2026-08-10T10:00:00+03:00',
    })).status).toBe(404);
    // …nor transfer out of it…
    expect((await bob.post('/api/transfers', {
      fromAccountId: aliceBank, toAccountId: bobBank, amount: '1.00', occurredAt: '2026-08-10T10:00:00+03:00',
    })).status).toBe(404);
    // …nor cancel her subscription.
    expect((await bob.post(`/api/subscriptions/${aliceSub}/cancel`)).status).toBe(404);

    // And nothing of Alice's appears in anything Bob can read.
    expect((await bob.get('/api/accounts')).body.accounts).toHaveLength(1);
    expect((await bob.get('/api/transactions')).body.transactions).toHaveLength(0);
    expect((await bob.get('/api/subscriptions')).body.subscriptions).toHaveLength(0);
    expect((await bob.get('/api/analytics/categories?from=2026-08-01&to=2026-08-31')).body.currencies).toEqual([]);
  });

  it('requires authentication for every finance route', async () => {
    for (const path of ['/api/accounts', '/api/categories', '/api/transactions', '/api/subscriptions', '/api/analytics/categories']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });
});
