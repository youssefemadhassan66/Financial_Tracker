import { randomUUID } from 'node:crypto';
import type { Account } from '../../domain/account.js';
import { addDays, localDateOf, startOfLocalDay, type CalendarDate } from '../../domain/calendar-date.js';
import { isCurrency } from '../../domain/currency.js';
import { DomainError } from '../../domain/errors.js';
import { newTransactionId, type UserId } from '../../domain/ids.js';
import { firstDueDateFromStatement, InstallmentPlan } from '../../domain/installment.js';
import { normalizeMerchantKey } from '../../domain/merchant-key.js';
import { Money } from '../../domain/money.js';
import { transactionShapeOf } from '../../domain/sms/sms-template.js';
import { defaultCountsAsSpending, type SpendingPolicy } from '../../domain/spending-policy.js';
import { Transaction } from '../../domain/transaction.js';
import type { CardStatement, StatementInstallment, StatementLine } from '../../domain/statements/card-statement.js';
import { parseCibCardStatements } from '../../domain/statements/cib-card-statement.js';
import {
  kindOfNewLine,
  MATCH_WINDOW_DAYS,
  priceForeignCharges,
  reconcile,
  type ForeignCharge,
} from '../../domain/statements/reconcile.js';
import { NotFoundError } from '../errors.js';
import type { AccountRepository, InstallmentPlanRepository, UserSettingsRepository } from '../ports/finance.js';
import type { PdfTextReader } from '../ports/pdf.js';
import type { ParsePayload, RawMessageRecord } from '../ports/sms.js';
import type {
  CardStatementRepository,
  CardStatementView,
  PricedMessage,
  StatementFileRepository,
  StatementLineToSave,
} from '../ports/statements.js';

export interface StatementImportResult {
  /** "2026-07" */
  period: string;
  status: 'imported' | 'already-imported';
  /** Lines that confirmed a transaction you already had (from SMS). */
  confirmed: number;
  /** Lines recorded as new transactions: fees, cashback, missed purchases. */
  created: number;
  /** Card payments with no SMS pair; not recorded, waiting for you. */
  unmatchedPayments: number;
  /** Foreign-currency charges known from SMS, now recorded at the amount billed. */
  pricedSms: number;
}

export interface StatementImportOutcome {
  /** One per month in the file, oldest first. */
  statements: StatementImportResult[];
  /** Installment plans read from the statements' installment tables. */
  installmentPlans: { added: number; alreadyKnown: number };
  /** The kept PDF, to open it again later. */
  fileId: string;
}

/** A waiting foreign-currency SMS, read back from what it stored. */
interface WaitingSms {
  charge: ForeignCharge;
  event: 'purchase' | 'refund';
  merchant: string;
  receivedAt: Date;
  payload: ParsePayload;
}

const periodName = (p: CardStatement['period']) => `${p.year}-${String(p.month).padStart(2, '0')}`;

/**
 * Imports a credit card e-statement PDF into a card account.
 *
 * Each month in the file is checked line by line against what the SMS
 * already recorded: a match confirms the transaction, anything else
 * (fees, cashback, a purchase no SMS reported, months before you
 * forwarded SMS at all) becomes a transaction of its own. Uploading the
 * same file again changes nothing: a month is imported once.
 */
export class ImportCardStatements {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly statements: CardStatementRepository,
    private readonly reader: PdfTextReader,
    private readonly settings: UserSettingsRepository,
    private readonly files: StatementFileRepository,
    private readonly plans: InstallmentPlanRepository,
  ) {}

  async execute(userId: UserId, accountId: string, pdf: Uint8Array, fileName = 'statement.pdf'): Promise<StatementImportOutcome> {
    const account = await this.accounts.findForUser(accountId, userId);
    if (account === null) {
      throw new NotFoundError('Account not found');
    }
    if (account.type !== 'credit_card') {
      throw new DomainError('Statements can only be imported into a credit card account');
    }

    const parsed = parseCibCardStatements(await this.reader.read(pdf));
    if (parsed.length === 0) {
      throw new DomainError('No CIB credit card statement was found in this PDF');
    }
    // Checked for the WHOLE file before anything is saved: the statement
    // of another card would put its purchases on this one.
    const foreign = parsed.find((s) => !account.hasLast4(s.cardLast4));
    if (foreign !== undefined) {
      throw new DomainError(
        `This statement is for the card ending ${foreign.cardLast4}, which is not one of this account's card digits`,
      );
    }
    if (account.currency !== 'EGP') {
      throw new DomainError('CIB statements are in EGP, but this account is not');
    }

    const policy = await this.settings.getSpendingPolicy(userId);
    const results: StatementImportResult[] = [];
    // Oldest first: a line can only confirm a transaction once, so the
    // order must not depend on how the bank laid out the file.
    const oldestFirst = [...parsed].sort((a, b) => a.period.year - b.period.year || a.period.month - b.period.month);
    for (const statement of oldestFirst) {
      results.push(await this.importOne(userId, account, statement, policy));
    }

    // Kept only now: a file that is not a statement of this card never
    // reaches here, so nothing but statements is ever stored.
    const fileId = await this.files.keep({
      userId,
      accountId: account.id,
      fileName: fileName.trim().slice(0, 200) || 'statement.pdf',
      content: pdf,
      periods: parsed.map((s) => s.period),
    });
    const installmentPlans = await this.addInstallmentPlans(userId, account, oldestFirst);
    return { statements: results, installmentPlans, fileId };
  }

  /**
   * One plan per row of the installment tables, added once: the same plan
   * on several months' statements (payment 2 of 6, then 3 of 6) has one
   * key. The newest statement dates it. Also done for months imported
   * before, so uploading an old file again picks up its plans.
   */
  private async addInstallmentPlans(
    userId: UserId,
    account: Account,
    oldestFirst: readonly CardStatement[],
  ): Promise<StatementImportOutcome['installmentPlans']> {
    const newest = new Map<string, { row: StatementInstallment; statement: CardStatement }>();
    for (const statement of oldestFirst) {
      for (const row of statement.installments) {
        newest.set(installmentKey(account.id, row), { row, statement });
      }
    }
    let added = 0;
    for (const [key, { row, statement }] of newest) {
      const plan = InstallmentPlan.create({
        id: randomUUID(),
        userId,
        name: row.description,
        provider: 'CIB',
        installmentAmount: Money.create(row.monthlyAmount, account.currency),
        totalInstallments: row.total,
        firstDueDate: firstDueDateFromStatement(statement.dueDate, row.number),
        accountId: account.id,
        externalKey: key,
      });
      if (await this.plans.createIfNew(plan)) added++;
    }
    return { added, alreadyKnown: newest.size - added };
  }

  private async importOne(
    userId: UserId,
    account: Account,
    statement: CardStatement,
    policy: SpendingPolicy,
  ): Promise<StatementImportResult> {
    const period = periodName(statement.period);
    const skipped = { period, status: 'already-imported', confirmed: 0, created: 0, unmatchedPayments: 0, pricedSms: 0 } as const;
    if (await this.statements.isImported(account.id, statement.period)) {
      return skipped;
    }

    const candidates = await this.candidatesFor(userId, account, statement.lines);
    const waiting = await this.waitingSmsFor(userId, account, statement.lines);
    const decisions = priceForeignCharges(
      statement.lines,
      reconcile(statement.lines, candidates),
      [...waiting.values()].map((w) => w.charge),
    );

    const lines: StatementLineToSave[] = [];
    const newTransactions: Transaction[] = [];
    const pricedMessages: PricedMessage[] = [];
    decisions.forEach((decision, i) => {
      const line = statement.lines[i]!;
      let transactionId: string | null = null;
      if (decision.kind === 'link') {
        transactionId = decision.transactionId;
      } else if (decision.kind === 'create') {
        const transaction = this.transactionFor(userId, account, line, policy);
        newTransactions.push(transaction);
        transactionId = transaction.id;
      } else if (decision.kind === 'price-sms') {
        const sms = waiting.get(decision.rawMessageId)!;
        const transaction = this.transactionForSms(userId, account, line, sms, policy);
        newTransactions.push(transaction);
        pricedMessages.push({ rawMessageId: decision.rawMessageId, transactionId: transaction.id, payload: sms.payload });
        transactionId = transaction.id;
      }
      lines.push({ lineNo: i + 1, line, transactionId });
    });

    const saved = await this.statements.save({ userId, accountId: account.id, statement, lines, newTransactions, pricedMessages });
    if (saved === 'already-imported') {
      return skipped;
    }
    return {
      period,
      status: 'imported',
      confirmed: decisions.filter((d) => d.kind === 'link').length,
      created: decisions.filter((d) => d.kind === 'create').length,
      unmatchedPayments: decisions.filter((d) => d.kind === 'unmatched-payment').length,
      pricedSms: pricedMessages.length,
    };
  }

  private async candidatesFor(userId: UserId, account: Account, lines: readonly StatementLine[]) {
    const window = matchWindow(lines);
    if (window === null) {
      return [];
    }
    const rows = await this.statements.listUnconfirmed(userId, account.id, window.from, window.to);
    return rows.map((r) => ({ ...r, date: localDateOf(r.occurredAt) }));
  }

  /** Foreign-currency SMS of this card waiting to be priced, by message id. */
  private async waitingSmsFor(userId: UserId, account: Account, lines: readonly StatementLine[]): Promise<Map<string, WaitingSms>> {
    const window = lines.some((l) => l.original !== null) ? matchWindow(lines) : null;
    if (window === null) {
      return new Map();
    }
    const rows = await this.statements.listAwaitingStatement(userId, account.id, window.from, window.to);
    const waiting = new Map<string, WaitingSms>();
    for (const row of rows) {
      const sms = waitingSmsOf(row);
      if (sms !== null) waiting.set(row.id, sms);
    }
    return waiting;
  }

  private transactionFor(userId: UserId, account: Account, line: StatementLine, policy: SpendingPolicy): Transaction {
    const kind = kindOfNewLine(line);
    return Transaction.create({
      id: newTransactionId(randomUUID()),
      userId,
      accountId: account.id,
      amount: Money.create(line.amount, account.currency),
      ...(line.original === null ? {} : { original: Money.create(line.original.amount, line.original.currency) }),
      direction: line.direction,
      kind,
      countsAsSpending: defaultCountsAsSpending(kind, policy),
      merchantKey: normalizeMerchantKey(line.description),
      merchantRaw: line.description,
      // The statement gives a day, not a time: the start of that day in
      // Cairo keeps it in the right day and month in every report.
      occurredAt: startOfLocalDay(line.transactionDate),
      source: 'statement',
    });
  }

  /**
   * A foreign charge priced by its statement line: the amount billed from
   * the statement; the foreign amount, merchant and time from the SMS.
   */
  private transactionForSms(
    userId: UserId,
    account: Account,
    line: StatementLine,
    sms: WaitingSms,
    policy: SpendingPolicy,
  ): Transaction {
    const { kind } = transactionShapeOf(sms.event);
    return Transaction.create({
      id: newTransactionId(randomUUID()),
      userId,
      accountId: account.id,
      amount: Money.create(line.amount, account.currency),
      original: Money.create(sms.charge.amount, sms.charge.currency),
      direction: line.direction,
      kind,
      countsAsSpending: defaultCountsAsSpending(kind, policy),
      merchantKey: normalizeMerchantKey(sms.merchant),
      merchantRaw: sms.merchant,
      // A phone clock running ahead must not date it in the future.
      occurredAt: new Date(Math.min(sms.receivedAt.getTime(), Date.now())),
      source: 'statement',
    });
  }
}

/** What stays the same for one plan from month to month. */
function installmentKey(accountId: string, row: StatementInstallment): string {
  return ['cib', accountId, row.startDate, row.monthlyAmount, row.total, row.description.toUpperCase()].join('|');
}

/** [from, to) around the lines' dates, wide enough for the bank's late booking. */
function matchWindow(lines: readonly StatementLine[]): { from: Date; to: Date } | null {
  if (lines.length === 0) {
    return null;
  }
  const dates: CalendarDate[] = lines.map((l) => l.transactionDate).sort();
  return {
    from: startOfLocalDay(addDays(dates[0]!, -MATCH_WINDOW_DAYS)),
    to: startOfLocalDay(addDays(dates.at(-1)!, MATCH_WINDOW_DAYS + 1)),
  };
}

/** Reads a waiting SMS back from its stored payload; null if it is not a priceable charge. */
function waitingSmsOf(row: RawMessageRecord): WaitingSms | null {
  const p = row.parsedPayload;
  const event = p?.['event'];
  const amount = p?.['amount'];
  const currency = p?.['currency'];
  const merchant = p?.['merchant'];
  if (
    p === null ||
    (event !== 'purchase' && event !== 'refund') ||
    typeof amount !== 'string' ||
    typeof currency !== 'string' ||
    !isCurrency(currency) ||
    typeof merchant !== 'string'
  ) {
    return null;
  }
  return {
    charge: {
      rawMessageId: row.id,
      amount: Money.create(amount, currency).toDecimalString(),
      currency,
      direction: transactionShapeOf(event).direction,
      date: localDateOf(row.receivedAt),
    },
    event,
    merchant,
    receivedAt: row.receivedAt,
    payload: p,
  };
}

export class ListCardStatements {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly statements: CardStatementRepository,
  ) {}

  async execute(userId: UserId, accountId: string): Promise<CardStatementView[]> {
    const account = await this.accounts.findForUser(accountId, userId);
    if (account === null) {
      throw new NotFoundError('Account not found');
    }
    return this.statements.listForAccount(userId, account.id);
  }
}
