import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/api/container.js';
import { createServer } from '../../src/api/server.js';
import { getPrismaClient } from '../../src/infrastructure/persistence/prisma-client.js';
import { BANK_CATALOG } from '../../src/domain/sms/banks/index.js';
import { databaseAvailable, PASSWORD, testConfig } from './helpers.js';

/** Budgets and installment plans, end to end. FAKE data only. */
const hasDb = await databaseAvailable();
const suite = hasDb ? describe : describe.skip;

// A fixed "today": budget months and paid installments depend on it.
const clock = { now: () => new Date('2026-10-19T10:00:00Z') };
const config = testConfig();
const prisma = getPrismaClient();
const app = createServer(buildContainer(config, prisma, clock, BANK_CATALOG), config);
const emails: string[] = [];

afterAll(async () => {
  if (hasDb) await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

async function newUser() {
  const email = `plans-${randomUUID()}@example.com`;
  emails.push(email);
  const token = (await request(app).post('/api/auth/register').send({ email, password: PASSWORD })).body.accessToken as string;
  const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (path: string) => as(request(app).get(path)),
    post: (path: string, body: object = {}) => as(request(app).post(path)).send(body),
    put: (path: string, body: object = {}) => as(request(app).put(path)).send(body),
    del: (path: string) => as(request(app).delete(path)),
  };
}

type User = Awaited<ReturnType<typeof newUser>>;

suite('budgets', () => {
  let me: User;
  let other: User;
  let card: string;
  let groceries: string;
  let transport: string;
  let salary: string;

  beforeAll(async () => {
    me = await newUser();
    other = await newUser();
    card = (await me.post('/api/accounts', { name: 'Test Visa', type: 'credit_card', currency: 'EGP', last4s: ['1111'] })).body
      .account.id;
    const categories = (await me.get('/api/categories')).body.categories as { id: string; name: string }[];
    const id = (name: string) => categories.find((c) => c.name === name)!.id;
    groceries = id('Groceries');
    transport = id('Transport');
    salary = id('Salary');

    const spend = (categoryId: string, amount: string, occurredAt: string, direction: 'debit' | 'credit' = 'debit') =>
      me.post('/api/transactions', {
        accountId: card, amount, direction, kind: 'expense', categoryId, merchant: 'TEST SHOP', occurredAt, countsAsSpending: true,
      });
    await spend(groceries, '300.00', '2026-10-02T10:00:00Z');
    await spend(groceries, '150.00', '2026-10-10T10:00:00Z');
    await spend(groceries, '50.00', '2026-10-12T10:00:00Z', 'credit'); // a refund
    await spend(groceries, '999.00', '2026-09-28T10:00:00Z'); // last month: not counted
    await spend(transport, '260.00', '2026-10-05T10:00:00Z');
  });

  it('sets limits and compares them with net spending this month', async () => {
    expect((await me.put(`/api/budgets/${groceries}`, { currency: 'EGP', limit: '500.00' })).status).toBe(204);
    expect((await me.put(`/api/budgets/${transport}`, { currency: 'EGP', limit: '200.00' })).status).toBe(204);

    const view = (await me.get('/api/budgets')).body;
    expect(view).toMatchObject({ month: '2026-10', period: { from: '2026-10-01', to: '2026-10-31' }, daysLeft: 13 });
    expect(view.budgets).toEqual([
      { categoryId: transport, categoryName: 'Transport', currency: 'EGP', limit: '200.00', spent: '260.00', remaining: '-60.00', percentUsed: 130, state: 'over' },
      { categoryId: groceries, categoryName: 'Groceries', currency: 'EGP', limit: '500.00', spent: '400.00', remaining: '100.00', percentUsed: 80, state: 'near' },
    ]);
  });

  it('carries a limit into later months, but not earlier ones', async () => {
    const november = (await me.get('/api/budgets?month=2026-11')).body;
    expect(november.budgets.map((b: { categoryName: string; spent: string }) => [b.categoryName, b.spent])).toEqual([
      ['Groceries', '0.00'],
      ['Transport', '0.00'],
    ]);
    expect(november.daysLeft).toBe(30);
    expect((await me.get('/api/budgets?month=2026-09')).body).toMatchObject({ budgets: [], daysLeft: 0 });
  });

  it('changing a limit replaces it from this month on', async () => {
    await me.put(`/api/budgets/${groceries}`, { currency: 'EGP', limit: '450.00' });
    const g = (await me.get('/api/budgets')).body.budgets.find((b: { categoryId: string }) => b.categoryId === groceries);
    expect(g).toMatchObject({ limit: '450.00', state: 'near' });
  });

  it('stopping a budget hides it from this month on', async () => {
    expect((await me.del(`/api/budgets/${transport}`)).status).toBe(204);
    const names = (await me.get('/api/budgets')).body.budgets.map((b: { categoryName: string }) => b.categoryName);
    expect(names).toEqual(['Groceries']);
    expect((await me.del(`/api/budgets/${transport}`)).status).toBe(404);
  });

  it('refuses income categories, zero limits, bad months, and other users\x27 categories', async () => {
    expect((await me.put(`/api/budgets/${salary}`, { currency: 'EGP', limit: '100.00' })).status).toBe(400);
    expect((await me.put(`/api/budgets/${groceries}`, { currency: 'EGP', limit: '0.00' })).status).toBe(400);
    expect((await me.get('/api/budgets?month=2026-13')).status).toBe(400);
    expect((await other.put(`/api/budgets/${groceries}`, { currency: 'EGP', limit: '100.00' })).status).toBe(404);
    expect((await other.get('/api/budgets')).body.budgets).toEqual([]);
  });
});

suite('installment plans', () => {
  let me: User;
  let other: User;

  beforeAll(async () => {
    me = await newUser();
    other = await newUser();
  });

  it('creates a plan and computes what is paid, next and remaining', async () => {
    const res = await me.post('/api/installments', {
      name: 'TEST Phone', provider: 'TEST Pay', installmentAmount: '750.00', currency: 'EGP', totalInstallments: 6, firstDueDate: '2026-08-11',
    });
    expect(res.status).toBe(201);
    expect(res.body.plan).toMatchObject({
      name: 'TEST Phone',
      provider: 'TEST Pay',
      paidInstallments: 3,
      nextDueDate: '2026-11-11',
      endDate: '2027-01-11',
      totalCost: '4500.00',
      remainingAmount: '2250.00',
      status: 'active',
      accountId: null,
    });

    await me.post('/api/installments', {
      name: 'TEST Fridge', installmentAmount: '500.00', currency: 'EGP', totalInstallments: 2, firstDueDate: '2026-07-01',
    });

    const view = (await me.get('/api/installments')).body;
    expect(view.plans.map((p: { name: string; status: string }) => [p.name, p.status])).toEqual([
      ['TEST Phone', 'active'],
      ['TEST Fridge', 'completed'],
    ]);
    // Completed plans are left out of the monthly total.
    expect(view.totals).toEqual([{ currency: 'EGP', monthly: '750.00', remaining: '2250.00' }]);
  });

  it('cancels a plan for good, and only its owner can', async () => {
    const id = (await me.get('/api/installments')).body.plans[0].id as string;
    expect((await other.post(`/api/installments/${id}/cancel`)).status).toBe(404);
    const res = await me.post(`/api/installments/${id}/cancel`);
    expect(res.body.plan).toMatchObject({ status: 'cancelled', nextDueDate: null, remainingAmount: '0.00' });
    expect((await me.post(`/api/installments/${id}/cancel`)).status).toBe(400);
    expect((await me.get('/api/installments')).body.totals).toEqual([]);
  });

  it('refuses bad plans', async () => {
    const base = { name: 'TEST', installmentAmount: '100.00', currency: 'EGP', totalInstallments: 3, firstDueDate: '2026-08-11' };
    expect((await me.post('/api/installments', { ...base, totalInstallments: 0 })).status).toBe(400);
    expect((await me.post('/api/installments', { ...base, installmentAmount: '0' })).status).toBe(400);
    expect((await me.post('/api/installments', { ...base, firstDueDate: '2026-02-30' })).status).toBe(400);
    expect((await me.post('/api/installments', { ...base, accountId: randomUUID() })).status).toBe(404);
  });
});
