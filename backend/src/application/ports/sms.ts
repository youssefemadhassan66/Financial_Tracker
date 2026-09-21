import type { CategoryId, UserId } from '../../domain/ids.js';
import type { Transaction } from '../../domain/transaction.js';
import type { SmsParseResult } from '../../domain/sms/sms-template.js';

/**
 * Turns SMS text into structured data.
 *
 * Async on purpose even though the regex parser answers instantly: the
 * planned LLM fallback implements this same port and needs a network
 * call. Callers written against the port never change when it arrives.
 */
export interface SmsParser {
  parse(sender: string, body: string): Promise<SmsParseResult>;
}

export type RawMessageStatus = 'pending' | 'parsed' | 'unparsed' | 'ignored';

export interface RawMessageRecord {
  id: string;
  userId: UserId;
  sender: string;
  body: string;
  receivedAt: Date;
  status: RawMessageStatus;
}

export interface RawMessageView extends RawMessageRecord {
  parseError: string | null;
  transactionId: string | null;
}

/**
 * Parser output kept beside the raw message, so you can see WHY a
 * message became what it became — which template, which values.
 */
export type ParsePayload = Record<string, string | null>;

/**
 * The processing side of stored SMS. Separate from RawMessageRepository
 * (which only inserts) so the ingest path, which must stay tiny and fast,
 * does not depend on processing methods it never calls — the Interface
 * Segregation Principle, the "I" in SOLID.
 */
export interface SmsInbox {
  findForUser(id: string, userId: UserId): Promise<RawMessageRecord | null>;

  /**
   * Messages that are not yet a transaction, oldest first, so a backlog
   * replays in the order it happened. `afterId` continues after that
   * message: ignored ones stay ignored, so without a cursor the same
   * first page would come back forever.
   */
  listIdsNeedingParse(userId: UserId, limit: number, afterId?: string): Promise<string[]>;

  list(userId: UserId, filter: { status?: RawMessageStatus; limit: number }): Promise<RawMessageView[]>;

  /** Records why a message did not become a transaction. */
  markNotTransaction(
    id: string,
    userId: UserId,
    status: 'ignored' | 'unparsed',
    reason: string,
    payload: ParsePayload | null,
  ): Promise<void>;

  /**
   * Saves the transaction AND marks the message parsed, atomically.
   *
   * Returns 'already-processed' when another run got there first (the
   * ingest request and a manual reprocess racing). Exactly one of them
   * creates the transaction; the other changes nothing.
   */
  completeWithTransaction(
    id: string,
    userId: UserId,
    transaction: Transaction,
    payload: ParsePayload,
  ): Promise<'saved' | 'already-processed'>;
}

/** Your own "this merchant is that category" memory. */
export interface MerchantCategoryRepository {
  findCategoryId(userId: UserId, merchantKey: string): Promise<CategoryId | null>;
}
