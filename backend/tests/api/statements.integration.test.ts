import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/api/container.js';
import { createServer } from '../../src/api/server.js';
import { getPrismaClient } from '../../src/infrastructure/persistence/prisma-client.js';
import { systemClock } from '../../src/infrastructure/system-clock.js';
import { BANK_CATALOG } from '../../src/domain/sms/banks/index.js';
import { buildPdf, statementRow, statementSummary, type PdfText } from '../pdf-fixture.js';
import { PrismaCardStatementRepository } from '../../src/infrastructure/persistence/prisma-card-statement-repository.js';
import { ConflictError } from '../../src/application/errors.js';
import { calendarDate } from '../../src/domain/calendar-date.js';
import type { ParsePayload } from '../../src/application/ports/sms.js';
import { databaseAvailable, PASSWORD, testConfig } from './helpers.js';

/**
 * Statement PDF -> statements, confirmed and new transactions, end to end.
 * The PDFs are generated in the CIB layout with FAKE data only.
 */
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
  const email = `statements-${randomUUID()}@example.com`;
  emails.push(email);
  const token = (await request(app).post('/api/auth/register').send({ email, password: PASSWORD })).body.accessToken as string;
  const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const deviceKey = (await as(request(app).post('/api/devices')).send({ name: 'Phone' })).body.key as string;
  return {
    sms: (body: string, receivedAt: string) =>
      request(app).post('/api/ingest/sms').set('X-Device-Key', deviceKey).send({ sender: 'CIB', body, receivedAt }),
    get: (path: string) => as(request(app).get(path)),
    del: (path: string) => as(request(app).delete(path)),
    /** The raw bytes of a response, e.g. a PDF. */
    bytes: (path: string) =>
      as(request(app).get(path))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        }),
    post: (path: string, body: object) => as(request(app).post(path)).send(body),
    upload: (accountId: string, pdf: Uint8Array | string, type = 'application/pdf') =>
      as(request(app).post(`/api/accounts/${accountId}/statements`)).set('Content-Type', type).send(Buffer.from(pdf)),
  };
}

const balance = (top: number, which: string, amount: string): PdfText[] => [
  { x: 151, top: top - 1, text: 'Jul-26' },
  { x: 250, top, text: `${which} BALANCE` },
  { x: 530, top, text: amount },
];

/** July 2026, card 1111: 1000 + 450 + 25 + 0.83 - 275 - 100 = 1100.83. */
function julyPdf(card = '1111'): Uint8Array {
  return buildPdf(julyPages(card));
}

function julyPages(card = '1111'): PdfText[][] {
  return [
    [
      ...statementSummary({ period: 'Jul-26', due: '2026-08-10', total: '1100.83', card }),
      ...balance(480, 'OPENING', '1,000.00'),
      ...statementRow(493, '30-06', '02-07', 'TEST CAFE CAIRO', '450.00'),
      ...statementRow(506, '05-07', '06-07', 'TEST SOFTWARE SUB', '25.00'),
      ...statementRow(519, '00-00', '00-00', 'USD1,00', '.00'),
    ],
    [
      ...statementRow(30, '06-07', '06-07', 'Stamp Duty', '.83'),
      ...statementRow(44, '07-07', '07-07', 'PAYMENT RECEIVED INTERNET', '275.00 CR'),
      ...statementRow(58, '08-07', '08-07', 'PAYMENT RECEIVED INTERNET', '100.00 CR'),
      { x: 250, top: 72, text: 'Test CashBack Jul-26' },
      { x: 530, top: 72, text: '12.50' },
      ...balance(100, 'CLOSING', '1100.83'),
    ],
  ];
}

suite('credit card statement import', () => {
  let me: Awaited<ReturnType<typeof newUser>>;
  let other: Awaited<ReturnType<typeof newUser>>;
  let card: string;
  let checking: string;

  const transactions = async () =>
    (await me.get(`/api/transactions?accountId=${card}&limit=200`)).body.transactions as {
      merchant: string;
      amount: string;
      kind: string;
      direction: string;
      source: string;
      occurredAt: string;
    }[];

  beforeAll(async () => {
    me = await newUser();
    other = await newUser();
    card = (await me.post('/api/accounts', { name: 'Test Visa', type: 'credit_card', currency: 'EGP', last4s: ['1111'] })).body
      .account.id;
    checking = (await me.post('/api/accounts', { name: 'Current', type: 'checking', currency: 'EGP', last4s: ['2222'] })).body
      .account.id;
    // What the SMS already recorded: the cafe purchase and one card payment.
    await me.post('/api/transactions', {
      accountId: card,
      amount: '450.00',
      direction: 'debit',
      kind: 'expense',
      merchant: 'TEST CAFE',
      occurredAt: '2026-06-30T09:00:00Z',
    });
    await me.post('/api/transfers', { fromAccountId: checking, toAccountId: card, amount: '275.00', occurredAt: '2026-07-08T09:00:00Z' });
  });

  it('confirms what SMS recorded, adds what it missed, and holds back an unmatched payment', async () => {
    const res = await me.upload(card, julyPdf());
    expect(res.status).toBe(201);
    expect(res.body.statements).toEqual([
      { period: '2026-07', status: 'imported', confirmed: 2, created: 2, unmatchedPayments: 1, pricedSms: 0 },
    ]);

    const txs = await transactions();
    expect(txs.filter((t) => t.merchant === 'TEST CAFE')).toHaveLength(1);
    expect(txs).toContainEqual(
      expect.objectContaining({ merchant: 'Stamp Duty', amount: '0.83', kind: 'fee', direction: 'debit', source: 'statement' }),
    );
    expect(txs).toContainEqual(
      expect.objectContaining({ merchant: 'TEST SOFTWARE SUB', amount: '25.00', kind: 'expense', source: 'statement' }),
    );
    // Start of 6 July in Cairo (UTC+3): 5 July 21:00 UTC.
    expect(txs.find((t) => t.merchant === 'Stamp Duty')?.occurredAt).toBe('2026-07-05T21:00:00.000Z');
    // The unmatched 100.00 payment is NOT recorded as money.
    expect(txs.filter((t) => t.amount === '100.00')).toEqual([]);
  });

  it('lists the statement and keeps the card limit and due day', async () => {
    const res = await me.get(`/api/accounts/${card}/statements`);
    expect(res.body.statements).toEqual([
      expect.objectContaining({
        period: '2026-07',
        dueDate: '2026-08-10',
        totalDue: '1100.83',
        creditLimit: '20000.00',
        openingBalance: '1000.00',
        closingBalance: '1100.83',
        lineCount: 5,
        unmatchedPayments: 1,
      }),
    ]);
    const details = await prisma.creditCardDetails.findUniqueOrThrow({ where: { accountId: card } });
    expect(details.creditLimit?.toFixed(2)).toBe('20000.00');
    expect(details.dueDay).toBe(10);
  });

  it('changes nothing when the same file is uploaded again', async () => {
    const before = (await transactions()).length;
    const res = await me.upload(card, julyPdf());
    expect(res.status).toBe(201);
    expect(res.body.statements).toEqual([
      { period: '2026-07', status: 'already-imported', confirmed: 0, created: 0, unmatchedPayments: 0, pricedSms: 0 },
    ]);
    expect(await transactions()).toHaveLength(before);
  });

  it('imports an older month without rolling the card details back', async () => {
    const june = buildPdf([
      [
        ...statementSummary({ period: 'Jun-26', due: '2026-07-12', total: '10.00' }),
        ...balance(480, 'OPENING', '.00'),
        ...statementRow(493, '03-06', '04-06', 'TEST BAKERY', '10.00'),
        ...balance(520, 'CLOSING', '10.00'),
      ],
    ]);
    expect((await me.upload(card, june)).body.statements).toEqual([
      { period: '2026-06', status: 'imported', confirmed: 0, created: 1, unmatchedPayments: 0, pricedSms: 0 },
    ]);
    const details = await prisma.creditCardDetails.findUniqueOrThrow({ where: { accountId: card } });
    expect(details.dueDay).toBe(10);
  });

  it('keeps the newest month on the card when two months are uploaded at once', async () => {
    const racer = await newUser();
    const racerCard = (
      await racer.post('/api/accounts', { name: 'Race Visa', type: 'credit_card', currency: 'EGP', last4s: ['1111'] })
    ).body.account.id as string;
    const month = (period: string, due: string, date: string) =>
      buildPdf([
        [
          ...statementSummary({ period, due, total: '10.00' }),
          ...balance(480, 'OPENING', '.00'),
          ...statementRow(493, date, date, 'TEST BAKERY', '10.00'),
          ...balance(520, 'CLOSING', '10.00'),
        ],
      ]);
    // Smoke test only: the bad interleaving (newer month commits first)
    // depends on timing, so a missing lock does not reliably fail it.
    const [older, newer] = await Promise.all([
      racer.upload(racerCard, month('Jul-26', '2026-08-10', '03-07')),
      racer.upload(racerCard, month('Aug-26', '2026-09-15', '03-08')),
    ]);
    expect([older.status, newer.status]).toEqual([201, 201]);
    const details = await prisma.creditCardDetails.findUniqueOrThrow({ where: { accountId: racerCard } });
    expect(details.dueDay).toBe(15);
  });

  it('prices a USD charge the SMS reported at the amount the statement billed', async () => {
    const u = await newUser();
    const usdCard = (await u.post('/api/accounts', { name: 'USD Visa', type: 'credit_card', currency: 'EGP', last4s: ['1111'] }))
      .body.account.id as string;
    // FAKE merchant and amounts. The SMS knows only the dollars.
    const sms = await u.sms(
      'Your credit card #1111 was charged for USD 21.60 at TEST SOFTWARE CLAU on 06/08/26 at 11:40.',
      '2026-08-06T08:40:00Z',
    );
    expect(sms.body.processing).toBe('awaiting_statement');

    // 1000 + 1036.44 + 50.00 = 2086.44. The second USD line has no SMS.
    const august = buildPdf([
      [
        ...statementSummary({ period: 'Aug-26', due: '2026-09-10', total: '2086.44' }),
        ...balance(480, 'OPENING', '1,000.00'),
        ...statementRow(493, '06-08', '09-08', 'TEST SOFTWARE CLAUDE', '1,036.44'),
        ...statementRow(506, '00-00', '00-00', 'USD21,60', '.00'),
        ...statementRow(519, '10-08', '11-08', 'TEST HOSTING', '50.00'),
        ...statementRow(532, '00-00', '00-00', 'USD1,00', '.00'),
        ...balance(560, 'CLOSING', '2086.44'),
      ],
    ]);
    const res = await u.upload(usdCard, august);
    expect(res.body.statements).toEqual([
      { period: '2026-08', status: 'imported', confirmed: 0, created: 1, unmatchedPayments: 0, pricedSms: 1 },
    ]);

    const txs = (await u.get(`/api/transactions?accountId=${usdCard}&limit=10`)).body.transactions as {
      merchant: string;
      amount: string;
      original: { amount: string; currency: string } | null;
      occurredAt: string;
    }[];
    expect(txs).toContainEqual(
      expect.objectContaining({
        // Merchant and time from the SMS, amount billed from the statement.
        merchant: 'TEST SOFTWARE CLAU',
        amount: '1036.44',
        original: { amount: '21.60', currency: 'USD' },
        occurredAt: '2026-08-06T08:40:00.000Z',
      }),
    );
    expect(txs).toContainEqual(
      expect.objectContaining({ merchant: 'TEST HOSTING', amount: '50.00', original: { amount: '1.00', currency: 'USD' } }),
    );

    // The SMS is done, and points at the transaction it became.
    const message = await prisma.rawMessage.findUniqueOrThrow({
      where: { id: sms.body.id },
      select: { status: true, transaction: { select: { amount: true } } },
    });
    expect(message.status).toBe('parsed');
    expect(message.transaction?.amount.toFixed(2)).toBe('1036.44');
  });

  it('saves nothing when a priced SMS changed after the import read it', async () => {
    const u = await newUser();
    const racerCard = (await u.post('/api/accounts', { name: 'Race USD', type: 'credit_card', currency: 'EGP', last4s: ['1111'] }))
      .body.account.id as string;
    const sms = await u.sms('Your credit card #1111 was charged for USD 5.00 at TEST APP on 06/08/26 at 11:40.', '2026-08-06T08:40:00Z');
    const read = await prisma.rawMessage.findUniqueOrThrow({ where: { id: sms.body.id }, select: { parsedPayload: true } });
    const payload = read.parsedPayload as ParsePayload;
    // A reprocess re-routed it meanwhile: the payload the import holds is stale.
    await prisma.rawMessage.update({ where: { id: sms.body.id }, data: { parsedPayload: { ...payload, accountId: card } } });

    const save = new PrismaCardStatementRepository(prisma).save({
      userId: (await prisma.account.findUniqueOrThrow({ where: { id: racerCard } })).userId as never,
      accountId: racerCard as never,
      statement: {
        cardLast4: '1111',
        period: { year: 2026, month: 8 },
        dueDate: calendarDate('2026-09-10'),
        creditLimit: '20000.00',
        availableCredit: '19000.00',
        totalDue: '0.00',
        minimumDue: '0.00',
        openingBalance: '0.00',
        closingBalance: '0.00',
        lines: [],
        installments: [],
      },
      lines: [],
      newTransactions: [],
      pricedMessages: [{ rawMessageId: sms.body.id, transactionId: 'unused', payload }],
    });
    await expect(save).rejects.toBeInstanceOf(ConflictError);
    expect(await prisma.cardStatement.count({ where: { accountId: racerCard } })).toBe(0);
    const after = await prisma.rawMessage.findUniqueOrThrow({ where: { id: sms.body.id }, select: { status: true } });
    expect(after.status).toBe('awaiting_statement');
  });

  it("refuses a statement of a card this account does not have", async () => {
    const res = await me.upload(card, julyPdf('9999'));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('9999');
  });

  it('refuses a statement on an account that is not a credit card', async () => {
    expect((await me.upload(checking, julyPdf())).status).toBe(400);
  });

  it('refuses a body that is not a PDF, whatever it claims to be', async () => {
    const fake = await me.upload(card, 'just text');
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('INVALID_PDF');
    expect((await me.upload(card, julyPdf(), 'application/json')).status).toBe(400);
  });

  it("treats another user's card as not found", async () => {
    expect((await other.upload(card, julyPdf())).status).toBe(404);
    expect((await other.get(`/api/accounts/${card}/statements`)).status).toBe(404);
  });
});

/** The July statement with an installment table after it: one FAKE plan, payment 2 of 6. */
function julyPdfWithPlan(): Uint8Array {
  const pages = [...(julyPages() as PdfText[][])];
  pages[1] = [
    ...pages[1]!,
    { x: 44, top: 140, text: 'TEST PHONE' },
    { x: 117, top: 140, text: '11/06' },
    { x: 194, top: 140, text: '750.00' },
    { x: 271, top: 140, text: '.00' },
    { x: 347, top: 140, text: '750.00' },
    { x: 424, top: 140, text: '2' },
    { x: 513, top: 140, text: '6' },
  ];
  return buildPdf(pages);
}

suite('kept statement files and installment plans', () => {
  it('keeps the PDF, adds its plans once, and lets only you open or delete it', async () => {
    const u = await newUser();
    const stranger = await newUser();
    const cardId = (await u.post('/api/accounts', { name: 'Plan Visa', type: 'credit_card', currency: 'EGP', last4s: ['1111'] }))
      .body.account.id as string;
    const pdf = julyPdfWithPlan();

    const first = await u.upload(cardId, pdf).set('X-File-Name', encodeURIComponent('July statement.pdf'));
    expect(first.status).toBe(201);
    expect(first.body.installmentPlans).toEqual({ added: 1, alreadyKnown: 0 });
    const fileId = first.body.fileId as string;

    const plans = (await u.get('/api/installments')).body.plans as Record<string, unknown>[];
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      name: 'TEST PHONE',
      provider: 'CIB',
      installmentAmount: '750.00',
      totalInstallments: 6,
      // Payment 2 is due with this statement (10 Aug), so payment 1 was due 10 Jul.
      firstDueDate: '2026-07-10',
      accountId: cardId,
    });

    // The same file again: nothing new, same kept file.
    const again = await u.upload(cardId, pdf);
    expect(again.body.statements[0].status).toBe('already-imported');
    expect(again.body.installmentPlans).toEqual({ added: 0, alreadyKnown: 1 });
    expect(again.body.fileId).toBe(fileId);
    expect((await u.get('/api/installments')).body.plans).toHaveLength(1);

    const files = (await u.get('/api/statement-files')).body.files as Record<string, unknown>[];
    expect(files).toEqual([
      expect.objectContaining({ id: fileId, accountId: cardId, fileName: 'July statement.pdf', sizeBytes: pdf.byteLength, periods: ['2026-07'] }),
    ]);
    expect(files[0]).not.toHaveProperty('content');
    expect((await u.get(`/api/accounts/${cardId}/statements`)).body.statements[0].fileId).toBe(fileId);

    const content = await u.bytes(`/api/statement-files/${fileId}/content`);
    expect(content.status).toBe(200);
    expect(content.headers['content-type']).toBe('application/pdf');
    expect(content.headers['cache-control']).toContain('no-store');
    expect(Buffer.compare(content.body as Buffer, Buffer.from(pdf))).toBe(0);

    expect((await stranger.get(`/api/statement-files/${fileId}/content`)).status).toBe(404);
    expect((await stranger.del(`/api/statement-files/${fileId}`)).status).toBe(404);
    expect((await stranger.get('/api/statement-files')).body.files).toEqual([]);

    // Deleting the file keeps the month it was read from.
    expect((await u.del(`/api/statement-files/${fileId}`)).status).toBe(204);
    expect((await u.get('/api/statement-files')).body.files).toEqual([]);
    const statements = (await u.get(`/api/accounts/${cardId}/statements`)).body.statements as Record<string, unknown>[];
    expect(statements).toHaveLength(1);
    expect(statements[0]!.fileId).toBeNull();
  });

  it('never keeps a file that is not a statement of the card', async () => {
    const u = await newUser();
    const cardId = (await u.post('/api/accounts', { name: 'Other Visa', type: 'credit_card', currency: 'EGP', last4s: ['2222'] }))
      .body.account.id as string;
    expect((await u.upload(cardId, buildPdf([[{ x: 30, top: 100, text: 'Hello' }]]))).status).toBeGreaterThanOrEqual(400);
    // Card 1111's statement on a 2222 card is refused.
    expect((await u.upload(cardId, julyPdfWithPlan())).status).toBeGreaterThanOrEqual(400);
    expect((await u.get('/api/statement-files')).body.files).toEqual([]);
    expect((await u.get('/api/installments')).body.plans).toEqual([]);
  });
});
