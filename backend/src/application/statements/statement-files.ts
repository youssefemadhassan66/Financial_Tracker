import type { UserId } from '../../domain/ids.js';
import { NotFoundError } from '../errors.js';
import type { AccountRepository } from '../ports/finance.js';
import type { StatementFileInfo, StatementFileRepository } from '../ports/statements.js';

/** Your kept statement PDFs, newest first; one account's when asked. */
export class ListStatementFiles {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly files: StatementFileRepository,
  ) {}

  async execute(userId: UserId, accountId?: string): Promise<StatementFileInfo[]> {
    if (accountId === undefined) {
      return this.files.listForUser(userId);
    }
    const account = await this.accounts.findForUser(accountId, userId);
    if (account === null) {
      throw new NotFoundError('Account not found');
    }
    return this.files.listForUser(userId, account.id);
  }
}

/** The bytes of one of your kept PDFs. Someone else's file is "not found". */
export class GetStatementFile {
  constructor(private readonly files: StatementFileRepository) {}

  async execute(userId: UserId, id: string): Promise<{ fileName: string; content: Uint8Array }> {
    const file = await this.files.contentFor(id, userId);
    if (file === null) {
      throw new NotFoundError('Statement file not found');
    }
    return file;
  }
}

/**
 * Deletes a kept PDF. The months imported from it, and their
 * transactions, stay: only the copy of the file goes.
 */
export class DeleteStatementFile {
  constructor(private readonly files: StatementFileRepository) {}

  async execute(userId: UserId, id: string): Promise<void> {
    if (!(await this.files.delete(id, userId))) {
      throw new NotFoundError('Statement file not found');
    }
  }
}
