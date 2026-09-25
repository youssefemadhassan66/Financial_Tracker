import { daysBetween, type CalendarDate } from '../calendar-date.js';
import type { Currency } from '../currency.js';
import type { TransactionKind } from '../transaction-kind.js';
import type { StatementLine } from './card-statement.js';

/** A transaction already on the card that a statement line may confirm. */
export interface LinkCandidate {
  id: string;
  /** Decimal string. */
  amount: string;
  direction: 'debit' | 'credit';
  kind: TransactionKind;
  /** Local (Cairo) date the transaction happened. */
  date: CalendarDate;
}

export type LineDecision =
  /** The line confirms a transaction we already have (usually from SMS). */
  | { kind: 'link'; transactionId: string }
  /** Nothing matched: record the line itself as a transaction. */
  | { kind: 'create' }
  /**
   * A card payment with no matching SMS pair. It is only half of a
   * transfer (money came from some account), so it is never recorded
   * alone: it would look like income. It waits for you.
   */
  | { kind: 'unmatched-payment' }
  /**
   * The line is the billed amount of a foreign-currency charge whose SMS
   * is waiting for it: record it once, from both.
   */
  | { kind: 'price-sms'; rawMessageId: string };

/** A card charge in another currency, known from its SMS, not yet priced. */
export interface ForeignCharge {
  rawMessageId: string;
  /** Decimal string, in `currency`. */
  amount: string;
  currency: Currency;
  direction: 'debit' | 'credit';
  /** Local (Cairo) date the SMS arrived. */
  date: CalendarDate;
}

/** How far a statement date may be from the SMS date: the bank books late. */
export const MATCH_WINDOW_DAYS = 3;

/** "PAYMENT RECEIVED INTERNET": the arriving half of a card payment. */
export function isCardPayment(line: StatementLine): boolean {
  return line.direction === 'credit' && /^PAYMENT RECEIVED\b/i.test(line.description);
}

/**
 * Decides, for every statement line, whether it confirms a transaction
 * we already have or is new.
 *
 * A match is the same amount, the same direction and a date within
 * MATCH_WINDOW_DAYS; the closest date wins, and each transaction confirms
 * at most one line. Card payments only match transfers (the pair from the
 * two SMS), and other lines never do: a 500 refund must not "confirm" a
 * 500 payment.
 */
export function reconcile(lines: readonly StatementLine[], candidates: readonly LinkCandidate[]): LineDecision[] {
  const used = new Set<string>();
  return lines.map((line) => {
    const payment = isCardPayment(line);
    let best: { id: string; distance: number } | null = null;
    for (const c of candidates) {
      if (used.has(c.id) || c.amount !== line.amount || c.direction !== line.direction) continue;
      if ((c.kind === 'transfer') !== payment) continue;
      const distance = Math.abs(daysBetween(line.transactionDate, c.date));
      if (distance > MATCH_WINDOW_DAYS) continue;
      // Closest date first; on a tie the lower id, so the answer never
      // depends on the order the database returned the rows in.
      if (best === null || distance < best.distance || (distance === best.distance && c.id < best.id)) {
        best = { id: c.id, distance };
      }
    }
    if (best !== null) {
      used.add(best.id);
      return { kind: 'link', transactionId: best.id };
    }
    return payment ? { kind: 'unmatched-payment' } : { kind: 'create' };
  });
}

/**
 * Gives the lines that are still to be created, and carry a foreign
 * amount ("USD21,60"), the waiting SMS of that same charge: the same
 * foreign amount and currency, the same direction, within
 * MATCH_WINDOW_DAYS. Closest date first, each SMS at most once; every
 * other decision is kept as it was.
 */
export function priceForeignCharges(
  lines: readonly StatementLine[],
  decisions: readonly LineDecision[],
  charges: readonly ForeignCharge[],
): LineDecision[] {
  const used = new Set<string>();
  return decisions.map((decision, i) => {
    const line = lines[i]!;
    const original = line.original;
    if (decision.kind !== 'create' || original === null) {
      return decision;
    }
    let best: { id: string; distance: number } | null = null;
    for (const c of charges) {
      if (used.has(c.rawMessageId) || c.currency !== original.currency || c.amount !== original.amount) continue;
      if (c.direction !== line.direction) continue;
      const distance = Math.abs(daysBetween(line.transactionDate, c.date));
      if (distance > MATCH_WINDOW_DAYS) continue;
      if (best === null || distance < best.distance || (distance === best.distance && c.rawMessageId < best.id)) {
        best = { id: c.rawMessageId, distance };
      }
    }
    if (best === null) {
      return decision;
    }
    used.add(best.id);
    return { kind: 'price-sms', rawMessageId: best.id };
  });
}

/**
 * What an unmatched line is. Bank charges are fees (they are spending you
 * did not choose, reported apart from purchases); a credit that is not a
 * payment is a refund, a reversed fee or cashback: money back.
 */
export function kindOfNewLine(line: StatementLine): 'fee' | 'expense' {
  return /\b(fees?|stamp duty|interest|insurance)\b/i.test(line.description) ? 'fee' : 'expense';
}
