import { randomUUID } from 'node:crypto';
import type { Account } from '../../domain/account.js';
import { addDays, localDateOf, startOfLocalDay } from '../../domain/calendar-date.js';
import { DomainError } from '../../domain/errors.js';
import { newTransactionId, type UserId } from '../../domain/ids.js';
import { normalizeMerchantKey } from '../../domain/merchant-key.js';
import { Money } from '../../domain/money.js';
import { defaultCountsAsSpending, type SpendingPolicy } from '../../domain/spending-policy.js';
import { Transaction } from '../../domain/transaction.js';
import type { CardStatement, StatementLine } from '../../domain/statements/card-statement.js';
import { parseCibCardStatements } from '../../domain/statements/cib-card-statement.js';
import { kindOfNewLine, MATCH_WINDOW_DAYS, reconcile } from '../../domain/statements/reconcile.js';
import { NotFoundError } from '../errors.js';
import type { AccountRepository, UserSettingsRepository } from '../ports/finance.js';
import type { PdfTextReader } from '../ports/pdf.js';
import type { CardStatementRepository, CardStatementView, StatementLineToSave } from '../ports/statements.js';

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
  ) {}

  async execute(userId: UserId, accountId: string, pdf: Uint8Array): Promise<StatementImportResult[]> {
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
    return results;
  }

  private async importOne(
    userId: UserId,
    account: Account,
    statement: CardStatement,
    policy: SpendingPolicy,
  ): Promise<StatementImportResult> {
    const period = periodName(statement.period);
    const skipped = { period, status: 'already-imported', confirmed: 0, created: 0, unmatchedPayments: 0 } as const;
    if (await this.statements.isImported(account.id, statement.period)) {
      return skipped;
    }

    const candidates = await this.candidatesFor(userId, account, statement.lines);
    const decisions = reconcile(statement.lines, candidates);

    const lines: StatementLineToSave[] = [];
    const newTransactions: Transaction[] = [];
    decisions.forEach((decision, i) => {
      const line = statement.lines[i]!;
      let transactionId: string | null = null;
      if (decision.kind === 'link') {
        transactionId = decision.transactionId;
      } else if (decision.kind === 'create') {
        const transaction = this.transactionFor(userId, account, line, policy);
        newTransactions.push(transaction);
        transactionId = transaction.id;
      }
      lines.push({ lineNo: i + 1, line, transactionId });
    });

    const saved = await this.statements.save({ userId, accountId: account.id, statement, lines, newTransactions });
    if (saved === 'already-imported') {
      return skipped;
    }
    return {
      period,
      status: 'imported',
      confirmed: decisions.filter((d) => d.kind === 'link').length,
      created: newTransactions.length,
      unmatchedPayments: decisions.filter((d) => d.kind === 'unmatched-payment').length,
    };
  }

  private async candidatesFor(userId: UserId, account: Account, lines: readonly StatementLine[]) {
    if (lines.length === 0) {
      return [];
    }
    const dates = lines.map((l) => l.transactionDate).sort();
    const from = startOfLocalDay(addDays(dates[0]!, -MATCH_WINDOW_DAYS));
    const to = startOfLocalDay(addDays(dates.at(-1)!, MATCH_WINDOW_DAYS + 1));
    const rows = await this.statements.listUnconfirmed(userId, account.id, from, to);
    return rows.map((r) => ({ ...r, date: localDateOf(r.occurredAt) }));
  }

  private transactionFor(userId: UserId, account: Account, line: StatementLine, policy: SpendingPolicy): Transaction {
    const kind = kindOfNewLine(line);
    return Transaction.create({
      id: newTransactionId(randomUUID()),
      userId,
      accountId: account.id,
      amount: Money.create(line.amount, account.currency),
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
