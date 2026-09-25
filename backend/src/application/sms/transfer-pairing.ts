import { randomUUID } from 'node:crypto';
import type { Account } from '../../domain/account.js';
import { isCurrency } from '../../domain/currency.js';
import { DomainError } from '../../domain/errors.js';
import { newTransactionId, newTransferGroupId, type AccountId, type UserId } from '../../domain/ids.js';
import { normalizeMerchantKey } from '../../domain/merchant-key.js';
import { Money } from '../../domain/money.js';
import type { TransferLegEvent } from '../../domain/sms/sms-template.js';
import { Transaction, type TransactionDirection } from '../../domain/transaction.js';
import { ConflictError, NotFoundError } from '../errors.js';
import type { Clock } from '../ports/clock.js';
import type { AccountRepository } from '../ports/finance.js';
import type { ParsePayload, RawMessageRecord, RivalCheck, SmsInbox } from '../ports/sms.js';

/**
 * How far apart the two SMS of one transfer may arrive. They normally
 * come minutes apart; 48 hours covers a phone that was off over a
 * weekend without letting two unrelated same-amount payments meet.
 */
export const PAIR_WINDOW_MS = 48 * 60 * 60 * 1000;

const WAITING_REASON: Record<TransferLegEvent, string> = {
  'transfer-out': 'Waiting for the matching credit card payment SMS',
  'card-payment': 'Waiting for the matching account debit SMS',
};
const AMBIGUOUS_REASON = 'Several possible matches; pair this transfer manually';

const OPPOSITE: Record<TransferLegEvent, TransferLegEvent> = {
  'transfer-out': 'card-payment',
  'card-payment': 'transfer-out',
};

/** One transfer half, as stored on its waiting raw message. */
interface Leg {
  messageId: string;
  receivedAt: Date;
  event: TransferLegEvent;
  amount: Money;
  accountId: string;
  payload: ParsePayload;
}

export type LegOutcome =
  | { status: 'parsed'; transactionId: string; pairedMessageId: string }
  | { status: 'awaiting_pair'; reason: string }
  | { status: 'already-processed' };

/**
 * Pairs the two SMS one internal transfer produces — "your account was
 * debited 1,200" and "1,200 was paid to your credit card" — into ONE
 * transfer: a debit on the account and a credit on the card, sharing a
 * transferGroupId, never counted as spending.
 *
 * It never guesses. A half pairs automatically only when each side has
 * exactly one possible partner; otherwise it waits for a human.
 */
export class TransferPairing {
  constructor(
    private readonly inbox: SmsInbox,
    private readonly accounts: AccountRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Parks one routed half as awaiting_pair, then looks for its partner.
   *
   * Why "park first, then look" is safe when both halves are processed
   * at the same moment: each run commits its own awaiting_pair row
   * BEFORE searching. Whichever run commits second therefore searches
   * after both rows exist and finds its partner — so the pair can never
   * be left with both halves waiting for each other. If both runs find
   * each other, both try to pair; completeTransferPair claims both rows
   * in one transaction, so exactly one wins and the other gets
   * 'already-processed'.
   *
   * A third half parked between our search and our claim (two identical
   * debits and one payment, arriving together) is caught by the claim
   * itself: parking and pairing run one at a time per user, and the
   * claim looks for rivals again before it commits.
   */
  async offerLeg(
    userId: UserId,
    message: RawMessageRecord,
    event: TransferLegEvent,
    account: Account,
    amount: Money,
    basePayload: ParsePayload,
  ): Promise<LegOutcome> {
    const payload: ParsePayload = { ...basePayload, accountId: account.id };
    const parked = await this.inbox.markNotTransaction(message.id, userId, 'awaiting_pair', WAITING_REASON[event], payload);
    if (!parked) {
      // Another run already paired this half between our read and now.
      return { status: 'already-processed' };
    }

    const leg: Leg = { messageId: message.id, receivedAt: message.receivedAt, event, amount, accountId: account.id, payload };
    const partners = await this.partnersOf(userId, leg);
    if (partners.length === 0) {
      return { status: 'awaiting_pair', reason: WAITING_REASON[event] };
    }
    const partner = partners[0]!;
    // Symmetric check: the partner must have exactly one candidate too.
    // Two 1,200 debits and one 1,200 card payment: the payment sees two,
    // so neither debit may claim it on its own.
    const partnersOfPartner = partners.length === 1 ? await this.partnersOf(userId, partner) : [];
    if (partners.length > 1 || partnersOfPartner.length !== 1) {
      await this.inbox.markNotTransaction(message.id, userId, 'awaiting_pair', AMBIGUOUS_REASON, payload);
      return { status: 'awaiting_pair', reason: AMBIGUOUS_REASON };
    }

    const result = await this.pair(userId, leg, partner, rivalCheck(leg, partner));
    if (result === 'already-processed') {
      return { status: 'already-processed' };
    }
    if (result === 'ambiguous') {
      await this.inbox.markNotTransaction(message.id, userId, 'awaiting_pair', AMBIGUOUS_REASON, payload);
      return { status: 'awaiting_pair', reason: AMBIGUOUS_REASON };
    }
    return { status: 'parsed', transactionId: result.transactionIds[leg.messageId]!, pairedMessageId: partner.messageId };
  }

  /** POST /api/sms/pair: the user decides which two halves belong together. */
  async pairManually(
    userId: UserId,
    debitMessageId: string,
    paymentMessageId: string,
  ): Promise<{ transferGroupId: string; transactionIds: string[] }> {
    const debit = await this.waitingLeg(userId, debitMessageId);
    const payment = await this.waitingLeg(userId, paymentMessageId);
    if (debit.event !== 'transfer-out' || payment.event !== 'card-payment') {
      throw new DomainError('Pair an account debit SMS with a credit card payment SMS');
    }
    if (!sameAmount(debit.amount, payment.amount)) {
      throw new DomainError(
        `The amounts differ (${debit.amount.toString()} vs ${payment.amount.toString()}); these are not one transfer`,
      );
    }
    // Your decision: other identical halves waiting do not stop it.
    const result = await this.pair(userId, debit, payment, NO_RIVAL_CHECK);
    if (result === 'already-processed' || result === 'ambiguous') {
      throw new ConflictError('One of these messages was already turned into a transaction');
    }
    return { transferGroupId: result.transferGroupId, transactionIds: Object.values(result.transactionIds) };
  }

  private async waitingLeg(userId: UserId, messageId: string): Promise<Leg> {
    const message = await this.inbox.findForUser(messageId, userId);
    if (message === null) {
      throw new NotFoundError('Message not found');
    }
    const leg = message.status === 'awaiting_pair' ? legOf(message) : null;
    if (leg === null) {
      throw new ConflictError('This message is not waiting for a transfer partner');
    }
    return leg;
  }

  /** Waiting halves that could be this leg's partner. */
  private async partnersOf(userId: UserId, leg: Leg): Promise<Leg[]> {
    const from = new Date(leg.receivedAt.getTime() - PAIR_WINDOW_MS);
    const to = new Date(leg.receivedAt.getTime() + PAIR_WINDOW_MS);
    const waiting = await this.inbox.listAwaitingPair(userId, from, to);
    return waiting.map(legOf).filter((other): other is Leg => other !== null && canPair(leg, other));
  }

  private async pair(
    userId: UserId,
    a: Leg,
    b: Leg,
    check: RivalCheck,
  ): Promise<{ transferGroupId: string; transactionIds: Record<string, string> } | 'already-processed' | 'ambiguous'> {
    const debit = a.event === 'transfer-out' ? a : b;
    const payment = debit === a ? b : a;

    const from = await this.activeAccount(userId, debit.accountId);
    const to = await this.activeAccount(userId, payment.accountId);
    if (from.currency !== to.currency || debit.amount.getCurrency() !== from.currency) {
      throw new DomainError('Transfers between different currencies are not supported');
    }

    // Both rows get the EARLIER SMS time: the transfer happened no later
    // than the first message about it, whichever half that was. Capped
    // at now, because a phone clock running ahead must not date a
    // transaction in the future.
    const earliest = Math.min(debit.receivedAt.getTime(), payment.receivedAt.getTime());
    const occurredAt = new Date(Math.min(earliest, this.clock.now().getTime()));
    const groupId = newTransferGroupId(randomUUID());

    const leg = (account: Account, direction: TransactionDirection, label: string) =>
      Transaction.create({
        id: newTransactionId(randomUUID()),
        userId,
        accountId: account.id as AccountId,
        amount: debit.amount,
        direction,
        kind: 'transfer',
        countsAsSpending: false,
        merchantKey: normalizeMerchantKey('TRANSFER'),
        merchantRaw: label,
        occurredAt,
        source: 'sms',
        transferGroupId: groupId,
      });
    const debitTx = leg(from, 'debit', `Transfer to ${to.getName()}`);
    const paymentTx = leg(to, 'credit', `Transfer from ${from.getName()}`);

    const saved = await this.inbox.completeTransferPair(userId, [
      { messageId: debit.messageId, transaction: debitTx, payload: debit.payload },
      { messageId: payment.messageId, transaction: paymentTx, payload: payment.payload },
    ], check);
    if (saved !== 'saved') {
      return saved;
    }
    return {
      transferGroupId: groupId,
      transactionIds: { [debit.messageId]: debitTx.id, [payment.messageId]: paymentTx.id },
    };
  }

  private async activeAccount(userId: UserId, accountId: string): Promise<Account> {
    const account = await this.accounts.findForUser(accountId, userId);
    if (account === null || account.isArchived()) {
      throw new DomainError('An account in this transfer no longer exists or is archived');
    }
    return account;
  }
}

/** Rebuilds a Leg from a stored payload; null if it is not a transfer half. */
function legOf(message: RawMessageRecord): Leg | null {
  const p = message.parsedPayload;
  const event = p?.['event'];
  const currency = p?.['currency'];
  const amount = p?.['amount'];
  const accountId = p?.['accountId'];
  if (
    p === null ||
    (event !== 'transfer-out' && event !== 'card-payment') ||
    typeof currency !== 'string' || !isCurrency(currency) ||
    typeof amount !== 'string' ||
    typeof accountId !== 'string'
  ) {
    return null;
  }
  return {
    messageId: message.id,
    receivedAt: message.receivedAt,
    event,
    amount: Money.create(amount, currency),
    accountId,
    payload: p,
  };
}

/** Could `other` be the other half of the transfer `leg` belongs to? */
function canPair(leg: Leg, other: Leg): boolean {
  return (
    other.messageId !== leg.messageId &&
    other.event === OPPOSITE[leg.event] &&
    other.accountId !== leg.accountId &&
    sameAmount(other.amount, leg.amount)
  );
}

/**
 * Pairing `a` with `b` is only safe while no OTHER waiting half could be
 * the partner of either one. Searched over both halves' windows.
 */
function rivalCheck(a: Leg, b: Leg): RivalCheck {
  const times = [a.receivedAt.getTime(), b.receivedAt.getTime()];
  return {
    from: new Date(Math.min(...times) - PAIR_WINDOW_MS),
    to: new Date(Math.max(...times) + PAIR_WINDOW_MS),
    hasRival: (waiting) =>
      waiting
        .map(legOf)
        .some(
          (other) =>
            other !== null &&
            other.messageId !== a.messageId &&
            other.messageId !== b.messageId &&
            ((canPair(a, other) && withinWindow(a, other)) || (canPair(b, other) && withinWindow(b, other))),
        ),
  };
}

const NO_RIVAL_CHECK: RivalCheck = { from: new Date(0), to: new Date(0), hasRival: () => false };

const withinWindow = (a: Leg, b: Leg) => Math.abs(a.receivedAt.getTime() - b.receivedAt.getTime()) <= PAIR_WINDOW_MS;

/** Money.equals also compares currency: 1,200 EGP is not 1,200 USD. */
function sameAmount(a: Money, b: Money): boolean {
  return a.equals(b);
}
