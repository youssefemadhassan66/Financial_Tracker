import { beforeEach, describe, expect, it } from 'vitest';
import { ProcessRawSms, ReprocessSms } from '../../src/application/sms/process-sms.js';
import { TemplateSmsParser } from '../../src/application/sms/template-sms-parser.js';
import type {
  AccountRepository,
  CategoryRecord,
  CategoryRepository,
  UserSettingsRepository,
} from '../../src/application/ports/finance.js';
import type {
  MerchantCategoryRepository,
  ParsePayload,
  RawMessageRecord,
  RawMessageStatus,
  RawMessageView,
  SmsInbox,
} from '../../src/application/ports/sms.js';
import { NotFoundError } from '../../src/application/errors.js';
import { Account } from '../../src/domain/account.js';
import type { Transaction } from '../../src/domain/transaction.js';
import { DEFAULT_SPENDING_POLICY } from '../../src/domain/spending-policy.js';
import { BANK_CATALOG } from '../../src/domain/sms/banks/index.js';
import type { SmsTemplate } from '../../src/domain/sms/sms-template.js';
import { newAccountId, newCategoryId, newUserId, type CategoryId, type UserId } from '../../src/domain/ids.js';
import { FakeClock } from './fakes.js';

const USER = newUserId('11111111-1111-1111-1111-111111111111');
const STRANGER = newUserId('22222222-2222-2222-2222-222222222222');
const FOOD = newCategoryId('c0000000-0000-0000-0000-00000000f00d');
const SALARY = newCategoryId('c0000000-0000-0000-0000-000000005a1a');

// 21 Sep 2026, 10:00 Cairo.
const NOW = new Date('2026-09-21T07:00:00Z');

/** A FICTIONAL bank. Real formats come from real (redacted) SMS. */
const TEMPLATES: SmsTemplate[] = [
  {
    id: 'test.purchase',
    bank: 'Test Bank',
    senders: ['TESTBANK'],
    event: 'purchase',
    pattern: /card (?<last4>\d{4}) charged (?<currency>[A-Z]{3}) (?<amount>[\d,.]+) at (?<merchant>.+)$/,
  },
  {
    id: 'test.refund',
    bank: 'Test Bank',
    senders: ['TESTBANK'],
    event: 'refund',
    pattern: /refund of (?<currency>[A-Z]{3}) (?<amount>[\d,.]+) from (?<merchant>.+) to card (?<last4>\d{4})$/,
  },
  {
    id: 'test.salary',
    bank: 'Test Bank',
    senders: ['TESTBANK'],
    event: 'deposit',
    pattern: /account (?<last4>\d{4}) credited (?<currency>[A-Z]{3}) (?<amount>[\d,.]+) from (?<merchant>.+)$/,
  },
  {
    id: 'test.nodigits',
    bank: 'Test Bank',
    senders: ['TESTBANK'],
    event: 'purchase',
    pattern: /paid (?<currency>[A-Z]{3}) (?<amount>[\d,.]+) to (?<merchant>.+)$/,
  },
];

class FakeInbox implements SmsInbox {
  readonly rows = new Map<string, RawMessageRecord & { reason: string | null; payload: ParsePayload | null }>();
  readonly saved: Transaction[] = [];
  /** Simulates another run winning the race between our read and write. */
  loseNextRace = false;

  add(id: string, body: string, options: { userId?: UserId; sender?: string; receivedAt?: Date } = {}): void {
    this.rows.set(id, {
      id,
      userId: options.userId ?? USER,
      sender: options.sender ?? 'TESTBANK',
      body,
      receivedAt: options.receivedAt ?? new Date(NOW.getTime() - 60_000),
      status: 'pending',
      reason: null,
      payload: null,
    });
  }

  async findForUser(id: string, userId: UserId): Promise<RawMessageRecord | null> {
    const row = this.rows.get(id);
    return row !== undefined && row.userId === userId ? row : null;
  }

  async listIdsNeedingParse(userId: UserId, limit: number, afterId?: string): Promise<string[]> {
    // Same keyset semantics as the real repository: the cursor is a
    // POSITION, found whatever its status is now.
    const ordered = [...this.rows.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime() || a.id.localeCompare(b.id));
    const start = afterId === undefined ? 0 : ordered.findIndex((r) => r.id === afterId) + 1;
    if (afterId !== undefined && start === 0) return [];
    return ordered.slice(start).filter((r) => r.status !== 'parsed').slice(0, limit).map((r) => r.id);
  }

  async list(): Promise<RawMessageView[]> {
    return [];
  }

  async markNotTransaction(id: string, userId: UserId, status: 'ignored' | 'unparsed', reason: string, payload: ParsePayload | null) {
    const row = this.rows.get(id);
    if (row !== undefined && row.userId === userId && row.status !== 'parsed') {
      Object.assign(row, { status, reason, payload });
    }
  }

  async completeWithTransaction(id: string, userId: UserId, transaction: Transaction, payload: ParsePayload) {
    const row = this.rows.get(id);
    if (this.loseNextRace || row === undefined || row.userId !== userId || row.status === 'parsed') {
      this.loseNextRace = false;
      return 'already-processed' as const;
    }
    Object.assign(row, { status: 'parsed' as RawMessageStatus, reason: null, payload });
    this.saved.push(transaction);
    return 'saved' as const;
  }
}

function account(name: string, last4: string | undefined, options: { currency?: 'EGP' | 'USD'; archived?: boolean } = {}): Account {
  const a = Account.create({
    id: newAccountId(`a0000000-0000-0000-0000-00000000${name.padStart(4, '0').slice(-4)}`),
    userId: USER,
    name,
    type: 'credit_card',
    currency: options.currency ?? 'EGP',
    ...(last4 === undefined ? {} : { last4s: [last4] }),
  });
  if (options.archived === true) a.archive();
  return a;
}

const categoryRecords: CategoryRecord[] = [
  { id: FOOD, name: 'Food & Dining', kind: 'spending', icon: null, color: null, isSystem: true },
  { id: SALARY, name: 'Salary', kind: 'income', icon: null, color: null, isSystem: true },
];

describe('ProcessRawSms', () => {
  let inbox: FakeInbox;
  let accounts: Account[];
  let merchantMap: Map<string, CategoryId>;
  let processOne: ProcessRawSms;

  beforeEach(() => {
    inbox = new FakeInbox();
    accounts = [account('1', '1234')];
    merchantMap = new Map();

    const accountRepo: AccountRepository = {
      create: async () => undefined,
      findForUser: async () => null,
      listForUser: async (userId) => accounts.filter((a) => a.userId === userId),
      update: async () => undefined,
    };
    const categoryRepo: CategoryRepository = {
      listForUser: async () => categoryRecords,
      findForUser: async (id) => categoryRecords.find((c) => c.id === id) ?? null,
      findByNameForUser: async () => null,
      create: async () => {
        throw new Error('unused');
      },
    };
    const merchants: MerchantCategoryRepository = {
      findCategoryId: async (_u, key) => merchantMap.get(key) ?? null,
    };
    const settings: UserSettingsRepository = { getSpendingPolicy: async () => DEFAULT_SPENDING_POLICY };

    processOne = new ProcessRawSms(
      inbox,
      new TemplateSmsParser({ templates: TEMPLATES, ignoreRules: BANK_CATALOG.ignoreRules }),
      accountRepo,
      categoryRepo,
      merchants,
      settings,
      new FakeClock(NOW),
    );
  });

  it('turns a purchase SMS into an expense on the account with those card digits', async () => {
    inbox.add('m1', 'card 1234 charged EGP 1,250.50 at CARREFOUR MAADI #1234');
    const outcome = await processOne.execute(USER, 'm1');

    expect(outcome.status).toBe('parsed');
    const tx = inbox.saved[0]!;
    expect(tx.accountId).toBe(accounts[0]!.id);
    expect(tx.amount.toDecimalString()).toBe('1250.50');
    expect(tx).toMatchObject({ kind: 'expense', direction: 'debit', source: 'sms', merchantKey: 'CARREFOUR MAADI' });
    expect(tx.getCountsAsSpending()).toBe(true);
    expect(inbox.rows.get('m1')).toMatchObject({ status: 'parsed', payload: { templateId: 'test.purchase', amount: '1250.50' } });
  });

  it('records a refund as a credit that still counts in spending, so it nets out', async () => {
    inbox.add('m1', 'refund of EGP 120.00 from CARREFOUR MAADI to card 1234');
    await processOne.execute(USER, 'm1');
    const tx = inbox.saved[0]!;
    expect(tx).toMatchObject({ kind: 'expense', direction: 'credit' });
    expect(tx.getCountsAsSpending()).toBe(true);
  });

  it('records salary as income that does not count as spending', async () => {
    inbox.add('m1', 'account 1234 credited EGP 30,000.00 from ACME PAYROLL');
    await processOne.execute(USER, 'm1');
    const tx = inbox.saved[0]!;
    expect(tx).toMatchObject({ kind: 'income', direction: 'credit' });
    expect(tx.getCountsAsSpending()).toBe(false);
  });

  it('applies the category you taught it for that merchant', async () => {
    merchantMap.set('CARREFOUR MAADI', FOOD);
    inbox.add('m1', 'card 1234 charged EGP 300.00 at Carrefour-Maadi');
    await processOne.execute(USER, 'm1');
    expect(inbox.saved[0]!.getCategoryId()).toBe(FOOD);
  });

  it('refuses a remembered category of the wrong kind (income category on a purchase)', async () => {
    merchantMap.set('CARREFOUR MAADI', SALARY);
    inbox.add('m1', 'card 1234 charged EGP 300.00 at CARREFOUR MAADI');
    await processOne.execute(USER, 'm1');
    expect(inbox.saved[0]!.getCategoryId()).toBeNull();
  });

  it('leaves the message unparsed, with a fixable reason, when no account has those digits', async () => {
    inbox.add('m1', 'card 9999 charged EGP 50.00 at KIOSK');
    const outcome = await processOne.execute(USER, 'm1');
    expect(outcome).toMatchObject({ status: 'unparsed', reason: expect.stringContaining('9999') });
    // The parse result is kept, so you can see what was read.
    expect(inbox.rows.get('m1')?.payload).toMatchObject({ last4: '9999', amount: '50.00' });
    expect(inbox.saved).toHaveLength(0);
  });

  it('does not route to an archived account', async () => {
    accounts = [account('1', '1234', { archived: true })];
    inbox.add('m1', 'card 1234 charged EGP 50.00 at KIOSK');
    expect((await processOne.execute(USER, 'm1')).status).toBe('unparsed');
  });

  it('refuses to guess when two active accounts share the digits', async () => {
    accounts = [account('1', '1234'), account('2', '1234')];
    inbox.add('m1', 'card 1234 charged EGP 50.00 at KIOSK');
    expect(await processOne.execute(USER, 'm1')).toMatchObject({ status: 'unparsed', reason: expect.stringContaining('More than one') });
  });

  it('refuses to guess an account when the SMS names no card digits', async () => {
    inbox.add('m1', 'paid EGP 50.00 to KIOSK');
    expect((await processOne.execute(USER, 'm1')).status).toBe('unparsed');
  });

  it('refuses a USD charge on an EGP account instead of recording 20 USD as 20 EGP', async () => {
    inbox.add('m1', 'card 1234 charged USD 20.00 at TEST SOFTWARE');
    expect(await processOne.execute(USER, 'm1')).toMatchObject({ status: 'unparsed', reason: expect.stringContaining('conversion') });
    expect(inbox.saved).toHaveLength(0);
  });

  it('marks an OTP as ignored', async () => {
    inbox.add('m1', 'Your OTP for card 1234 charged EGP 500.00 at AMAZON');
    expect((await processOne.execute(USER, 'm1')).status).toBe('ignored');
    expect(inbox.saved).toHaveLength(0);
  });

  it('marks a personal SMS as ignored and never parses it', async () => {
    inbox.add('m1', 'card 1234 charged EGP 500.00 at FAKE', { sender: '+201001234567' });
    expect((await processOne.execute(USER, 'm1')).status).toBe('ignored');
  });

  it('caps the date at "now" when the phone clock runs ahead', async () => {
    inbox.add('m1', 'card 1234 charged EGP 10.00 at KIOSK', { receivedAt: new Date(NOW.getTime() + 120_000) });
    await processOne.execute(USER, 'm1');
    expect(inbox.saved[0]!.occurredAt).toEqual(NOW);
  });

  it('does nothing to a message that is already a transaction', async () => {
    inbox.add('m1', 'card 1234 charged EGP 10.00 at KIOSK');
    await processOne.execute(USER, 'm1');
    expect(await processOne.execute(USER, 'm1')).toEqual({ status: 'already-processed' });
    expect(inbox.saved).toHaveLength(1);
  });

  it('reports already-processed when another run wins the race', async () => {
    inbox.add('m1', 'card 1234 charged EGP 10.00 at KIOSK');
    inbox.loseNextRace = true;
    expect(await processOne.execute(USER, 'm1')).toEqual({ status: 'already-processed' });
    expect(inbox.saved).toHaveLength(0);
  });

  it("treats another user's message as not found", async () => {
    inbox.add('m1', 'card 1234 charged EGP 10.00 at KIOSK', { userId: STRANGER });
    await expect(processOne.execute(USER, 'm1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('parses a previously unparsed message once the account gets its digits', async () => {
    accounts = [account('1', undefined)];
    inbox.add('m1', 'card 1234 charged EGP 75.00 at KIOSK');
    expect((await processOne.execute(USER, 'm1')).status).toBe('unparsed');

    accounts = [account('1', '1234')];
    expect((await processOne.execute(USER, 'm1')).status).toBe('parsed');
  });

  describe('ReprocessSms', () => {
    it('reprocesses everything not yet parsed and counts the outcomes', async () => {
      inbox.add('m1', 'card 1234 charged EGP 10.00 at KIOSK', { receivedAt: new Date('2026-09-01T10:00:00Z') });
      inbox.add('m2', 'card 9999 charged EGP 10.00 at KIOSK', { receivedAt: new Date('2026-09-02T10:00:00Z') });
      inbox.add('m3', 'Your OTP is 1234', { receivedAt: new Date('2026-09-03T10:00:00Z') });

      const summary = await new ReprocessSms(inbox, processOne).execute(USER);
      expect(summary).toEqual({ processed: 3, parsed: 1, unparsed: 1, ignored: 1, next: null });
    });

    it('pages with a cursor, so ignored messages cannot block newer ones forever', async () => {
      for (let i = 0; i < 5; i += 1) {
        inbox.add(`otp${i}`, 'Your OTP is 1234', { receivedAt: new Date(Date.UTC(2026, 8, 1, i)) });
      }
      inbox.add('real', 'card 1234 charged EGP 10.00 at KIOSK', { receivedAt: new Date('2026-09-05T10:00:00Z') });
      const reprocess = new ReprocessSms(inbox, processOne);

      const first = await reprocess.execute(USER, { limit: 3 });
      expect(first).toMatchObject({ processed: 3, ignored: 3, next: 'otp2' });

      const second = await reprocess.execute(USER, { limit: 3, after: first.next! });
      expect(second).toMatchObject({ processed: 3, parsed: 1, ignored: 2, next: 'real' });

      const third = await reprocess.execute(USER, { limit: 3, after: second.next! });
      expect(third).toMatchObject({ processed: 0, next: null });
    });
  });
});
