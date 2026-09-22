import { randomUUID } from 'node:crypto';
import { Money } from '../../domain/money.js';
import { Transaction } from '../../domain/transaction.js';
import { canBeCategorized } from '../../domain/transaction-kind.js';
import { defaultCountsAsSpending } from '../../domain/spending-policy.js';
import { normalizeMerchantKey } from '../../domain/merchant-key.js';
import { DomainError } from '../../domain/errors.js';
import { newTransactionId, type UserId } from '../../domain/ids.js';
import { transactionShapeOf, type ParsedSms } from '../../domain/sms/sms-template.js';
import { NotFoundError } from '../errors.js';
import type { Clock } from '../ports/clock.js';
import type { AccountRepository, CategoryRepository, UserSettingsRepository } from '../ports/finance.js';
import type {
  MerchantCategoryRepository,
  ParsePayload,
  RawMessageStatus,
  RawMessageView,
  SmsInbox,
  SmsParser,
} from '../ports/sms.js';

export type ProcessOutcome =
  | { status: 'parsed'; transactionId: string }
  | { status: 'ignored' | 'unparsed'; reason: string }
  | { status: 'already-processed' };

/**
 * Turns ONE stored SMS into a transaction, or records why it could not.
 *
 * Safe to run any number of times on the same message: a message that
 * is already a transaction is left alone, and the database guarantees
 * one transaction per message even if two runs race.
 */
export class ProcessRawSms {
  constructor(
    private readonly inbox: SmsInbox,
    private readonly parser: SmsParser,
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository,
    private readonly merchantCategories: MerchantCategoryRepository,
    private readonly settings: UserSettingsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId, rawMessageId: string): Promise<ProcessOutcome> {
    const message = await this.inbox.findForUser(rawMessageId, userId);
    if (message === null) {
      throw new NotFoundError('Message not found');
    }
    if (message.status === 'parsed') {
      return { status: 'already-processed' };
    }

    const result = await this.parser.parse(message.sender, message.body);

    if (result.outcome === 'not-transaction') {
      await this.inbox.markNotTransaction(message.id, userId, 'ignored', result.reason, null);
      return { status: 'ignored', reason: result.reason };
    }
    if (result.outcome === 'unrecognized') {
      return this.unparsed(message.id, userId, result.reason, null);
    }

    const payload: ParsePayload = { templateId: result.templateId, ...result.parsed };

    let transaction: Transaction;
    try {
      transaction = await this.buildTransaction(userId, result.parsed, message.receivedAt);
    } catch (error) {
      // A DomainError here is a fact about THIS message (no matching
      // account, a merchant name with no letters): record it and move
      // on. Anything else is a real failure and must surface.
      if (error instanceof DomainError) {
        return this.unparsed(message.id, userId, error.message, payload);
      }
      throw error;
    }

    const saved = await this.inbox.completeWithTransaction(message.id, userId, transaction, payload);
    return saved === 'saved' ? { status: 'parsed', transactionId: transaction.id } : { status: 'already-processed' };
  }

  private async unparsed(id: string, userId: UserId, reason: string, payload: ParsePayload | null): Promise<ProcessOutcome> {
    await this.inbox.markNotTransaction(id, userId, 'unparsed', reason, payload);
    return { status: 'unparsed', reason };
  }

  private async buildTransaction(userId: UserId, parsed: ParsedSms, receivedAt: Date): Promise<Transaction> {
    // Route by card digits. Guessing an account when the SMS names none
    // would put money in the wrong place with no visible error, so an
    // SMS without digits waits for a human instead.
    if (parsed.last4 === null) {
      throw new DomainError('The SMS names no card or account digits, so it cannot be matched to an account');
    }
    const matches = (await this.accounts.listForUser(userId)).filter(
      (a) => !a.isArchived() && a.last4 === parsed.last4,
    );
    if (matches.length === 0) {
      throw new DomainError(
        `No active account ends in ${parsed.last4}. Set last4 on the account, then reprocess.`,
      );
    }
    if (matches.length > 1) {
      throw new DomainError(`More than one active account ends in ${parsed.last4}; cannot tell which one`);
    }
    const account = matches[0]!;

    if (parsed.currency !== account.currency) {
      // e.g. a USD Claude charge on an EGP card. The bank converts at its
      // own rate, which the SMS may or may not state; recording the USD
      // figure in an EGP account would be wrong by ~50x.
      throw new DomainError(
        `A ${parsed.currency} charge on a ${account.currency} account needs currency conversion, which is not supported yet`,
      );
    }

    const { kind, direction } = transactionShapeOf(parsed.event);
    const merchantKey = normalizeMerchantKey(parsed.merchant);
    const policy = await this.settings.getSpendingPolicy(userId);

    // The phone's clock may run up to a few minutes ahead of ours, and a
    // transaction may not be dated in the future. Cap at "now".
    const now = this.clock.now();
    const occurredAt = receivedAt.getTime() > now.getTime() ? now : receivedAt;

    const transaction = Transaction.create({
      id: newTransactionId(randomUUID()),
      userId,
      accountId: account.id,
      amount: Money.create(parsed.amount, account.currency),
      direction,
      kind,
      countsAsSpending: defaultCountsAsSpending(kind, policy),
      merchantKey,
      merchantRaw: parsed.merchant,
      occurredAt,
      source: 'sms',
    });

    if (canBeCategorized(kind)) {
      const categoryId = await this.merchantCategories.findCategoryId(userId, merchantKey);
      if (categoryId !== null) {
        // The remembered category must still exist, still be yours, and
        // fit the money's direction: an income category on a purchase
        // would corrupt both the spending and the income report.
        const category = await this.categories.findForUser(categoryId, userId);
        const wanted = kind === 'income' ? 'income' : 'spending';
        if (category !== null && category.kind === wanted) {
          transaction.categorize(category.id);
        }
      }
    }

    return transaction;
  }
}

export interface ReprocessSummary {
  processed: number;
  parsed: number;
  unparsed: number;
  ignored: number;
  /** Pass back as `after` to continue; null when everything was covered. */
  next: string | null;
}

/** Hard cap per call, so one request cannot run for minutes. */
export const MAX_REPROCESS_BATCH = 200;

/**
 * Re-runs every stored message that is not yet a transaction. Use after
 * adding card digits to an account or after new bank templates ship.
 */
export class ReprocessSms {
  constructor(
    private readonly inbox: SmsInbox,
    private readonly processOne: ProcessRawSms,
  ) {}

  async execute(userId: UserId, options: { after?: string; limit?: number } = {}): Promise<ReprocessSummary> {
    const limit = Math.min(options.limit ?? MAX_REPROCESS_BATCH, MAX_REPROCESS_BATCH);
    const ids = await this.inbox.listIdsNeedingParse(userId, limit, options.after);
    const summary: ReprocessSummary = {
      processed: 0,
      parsed: 0,
      unparsed: 0,
      ignored: 0,
      // A full page means there may be more; a short page means done.
      next: ids.length === limit ? (ids[ids.length - 1] ?? null) : null,
    };

    // One at a time, oldest first: they share accounts and settings, and
    // a backlog of a few hundred regex runs does not need parallelism.
    for (const id of ids) {
      const outcome = await this.processOne.execute(userId, id);
      summary.processed += 1;
      if (outcome.status === 'parsed' || outcome.status === 'unparsed' || outcome.status === 'ignored') {
        summary[outcome.status] += 1;
      }
    }
    return summary;
  }
}

/** Your stored SMS, newest first, with why each did or did not parse. */
export class ListSmsMessages {
  constructor(private readonly inbox: SmsInbox) {}

  execute(userId: UserId, filter: { status?: RawMessageStatus; limit: number }): Promise<RawMessageView[]> {
    return this.inbox.list(userId, filter);
  }
}
