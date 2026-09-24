import type { AccountId, UserId } from '../../domain/ids.js';
import type { Transaction } from '../../domain/transaction.js';
import type { TransactionKind } from '../../domain/transaction-kind.js';
import type { CardStatement, StatementLine } from '../../domain/statements/card-statement.js';

/** A transaction on the card that no statement line confirms yet. */
export interface UnconfirmedTransaction {
  id: string;
  amount: string;
  direction: 'debit' | 'credit';
  kind: TransactionKind;
  occurredAt: Date;
}

export interface StatementLineToSave {
  /** Position on the statement, from 1. */
  lineNo: number;
  line: StatementLine;
  /** The transaction it confirms or created; null for an unmatched card payment. */
  transactionId: string | null;
}

export interface CardStatementView {
  id: string;
  /** "2026-07": the month the statement closes. */
  period: string;
  dueDate: string;
  creditLimit: string;
  availableCredit: string;
  totalDue: string;
  minimumDue: string;
  openingBalance: string;
  closingBalance: string;
  lineCount: number;
  /** Card payments no SMS pair matched: they wait for you. */
  unmatchedPayments: number;
  importedAt: Date;
}

export interface CardStatementRepository {
  isImported(accountId: AccountId, period: CardStatement['period']): Promise<boolean>;

  /** Transactions of this account in [from, to) that no statement line confirms. */
  listUnconfirmed(userId: UserId, accountId: AccountId, from: Date, to: Date): Promise<UnconfirmedTransaction[]>;

  /**
   * Saves the statement, its lines and the transactions created from it,
   * all or nothing. Also refreshes the card's limit and due day when this
   * is its newest statement.
   *
   * 'already-imported' when that month of that card is already saved (a
   * second upload that raced this one): then nothing at all is written.
   */
  save(input: {
    userId: UserId;
    accountId: AccountId;
    statement: CardStatement;
    lines: StatementLineToSave[];
    newTransactions: Transaction[];
  }): Promise<'saved' | 'already-imported'>;

  /** Newest first. */
  listForAccount(userId: UserId, accountId: AccountId): Promise<CardStatementView[]>;
}
