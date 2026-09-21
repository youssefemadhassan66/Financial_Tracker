import { DomainError } from '../errors.js';
import type { Currency } from '../currency.js';
import type { TransactionKind } from '../transaction-kind.js';
import type { TransactionDirection } from '../transaction.js';
import { currencyFromSmsToken, normalizeSmsText, parseSmsAmount } from './sms-text.js';

/**
 * What a bank SMS REPORTS, in the bank's terms. Mapped to our
 * TransactionKind by transactionShapeOf — kept separate so a template
 * author only has to answer "what does this message say happened?",
 * not "how does this app classify it?".
 */
export type SmsEvent =
  | 'purchase' // card or online payment
  | 'refund' // a merchant gave money back
  | 'withdrawal' // cash out of an ATM
  | 'deposit' // money arrived: salary, incoming transfer
  | 'fee'; // a bank charge

export interface ParsedSms {
  bank: string;
  event: SmsEvent;
  /** Decimal string, e.g. "1250.50". Never a JS number. */
  amount: string;
  currency: Currency;
  /** Merchant or counterparty as the SMS wrote it (may be Arabic). */
  merchant: string;
  /** Card or account digits the SMS mentions; routes it to an account. */
  last4: string | null;
}

export type SmsParseResult =
  | { outcome: 'transaction'; templateId: string; parsed: ParsedSms }
  /** A known bank said something that is not money moving: an OTP, an ad. */
  | { outcome: 'not-transaction'; reason: string }
  /** Looks like it should parse, but nothing understood it. Needs a human. */
  | { outcome: 'unrecognized'; reason: string };

/**
 * One SMS format of one bank.
 *
 * `pattern` runs against normalizeSmsText(body), so it only ever sees
 * ASCII digits and single spaces. It must use NAMED groups:
 *   amount   (required)
 *   currency (or set `currency`, for SMS that never state it)
 *   merchant (or set `merchant`, e.g. "ATM" for a cash withdrawal)
 *   last4    (optional, exactly 4 digits)
 */
export interface SmsTemplate {
  /** Stable id, stored with every parsed message: "cib.purchase.en.v1". */
  id: string;
  bank: string;
  /** Sender ids exactly as the phone shows them, e.g. "CIB". */
  senders: readonly string[];
  event: SmsEvent;
  pattern: RegExp;
  currency?: Currency;
  merchant?: string;
}

/** A known-bank message that must NOT become a transaction. */
export interface SmsIgnoreRule {
  id: string;
  /** Omit to apply to every known bank sender. */
  senders?: readonly string[];
  pattern: RegExp;
}

export interface SmsCatalog {
  templates: readonly SmsTemplate[];
  ignoreRules: readonly SmsIgnoreRule[];
}

/** Sender ids differ only in case/spacing between phones: "Cib " = "CIB". */
export function normalizeSender(sender: string): string {
  return normalizeSmsText(sender).toUpperCase();
}

/**
 * Checks a catalog once, up front, so a broken template fails at startup
 * (and in tests) instead of on the first real SMS.
 */
export function validateCatalog(catalog: SmsCatalog): void {
  const ids = new Set<string>();
  for (const t of [...catalog.templates, ...catalog.ignoreRules]) {
    if (ids.has(t.id)) {
      throw new DomainError(`Duplicate SMS template id "${t.id}"`);
    }
    ids.add(t.id);
    // A /g or /y regex remembers lastIndex between calls, so the SAME
    // message can match on one call and fail on the next. Banned.
    if (t.pattern.global || t.pattern.sticky) {
      throw new DomainError(`SMS template "${t.id}" must not use the g or y flag`);
    }
  }
  for (const t of catalog.templates) {
    const groups = namedGroupsOf(t.pattern);
    if (!groups.has('amount')) {
      throw new DomainError(`SMS template "${t.id}" needs an (?<amount>) group`);
    }
    if (!groups.has('currency') && t.currency === undefined) {
      throw new DomainError(`SMS template "${t.id}" needs a currency group or a fixed currency`);
    }
    if (!groups.has('merchant') && t.merchant === undefined) {
      throw new DomainError(`SMS template "${t.id}" needs a merchant group or a fixed merchant`);
    }
    if (t.senders.length === 0) {
      throw new DomainError(`SMS template "${t.id}" has no senders`);
    }
  }
}

/** Named groups a regex declares, found by matching it against nothing. */
function namedGroupsOf(pattern: RegExp): Set<string> {
  // Adding "|" makes the regex match the empty string, and a match
  // object lists every named group — matched or not.
  const probe = new RegExp(`${pattern.source}|`, pattern.flags).exec('');
  return new Set(Object.keys(probe?.groups ?? {}));
}

/**
 * Runs the catalog over one SMS.
 *
 * Order matters:
 *  1. Unknown sender -> not a transaction. A personal SMS from a friend
 *     is never parsed, and (later) never sent to an LLM.
 *  2. Ignore rules BEFORE templates. An OTP such as "Your code for a
 *     purchase of EGP 500 at AMAZON is 123456" reads like a purchase;
 *     counting it would record money you never spent.
 *  3. First matching template wins, so list specific formats first.
 */
export function parseWithTemplates(catalog: SmsCatalog, sender: string, body: string): SmsParseResult {
  const senderKey = normalizeSender(sender);
  const text = normalizeSmsText(body);

  const fromSender = (senders: readonly string[]) => senders.some((s) => normalizeSender(s) === senderKey);
  const templates = catalog.templates.filter((t) => fromSender(t.senders));
  const knownBank = templates.length > 0;

  if (!knownBank) {
    return { outcome: 'not-transaction', reason: 'sender is not a known bank' };
  }

  for (const rule of catalog.ignoreRules) {
    if ((rule.senders === undefined || fromSender(rule.senders)) && rule.pattern.test(text)) {
      return { outcome: 'not-transaction', reason: `matched ignore rule ${rule.id}` };
    }
  }

  for (const template of templates) {
    const match = template.pattern.exec(text);
    if (match === null) {
      continue;
    }
    try {
      return { outcome: 'transaction', templateId: template.id, parsed: extract(template, match.groups ?? {}) };
    } catch (error) {
      // The template recognized the message but a field is unreadable.
      // Do NOT fall through to the next template: that could turn a
      // real problem into a confidently wrong parse.
      if (error instanceof DomainError) {
        return { outcome: 'unrecognized', reason: `${template.id}: ${error.message}` };
      }
      throw error;
    }
  }

  return { outcome: 'unrecognized', reason: 'no template matched' };
}

function extract(template: SmsTemplate, groups: Record<string, string | undefined>): ParsedSms {
  const amountText = groups['amount'];
  if (amountText === undefined) {
    throw new DomainError('amount missing');
  }

  const currencyText = groups['currency'];
  const currency = currencyText === undefined ? template.currency : currencyFromSmsToken(currencyText);
  if (currency === undefined) {
    throw new DomainError('currency missing');
  }

  const merchant = (groups['merchant'] ?? template.merchant ?? '').trim();
  if (merchant.length === 0) {
    throw new DomainError('merchant missing');
  }

  const last4 = groups['last4'] ?? null;
  if (last4 !== null && !/^\d{4}$/.test(last4)) {
    throw new DomainError(`card digits "${last4}" are not 4 digits`);
  }

  return {
    bank: template.bank,
    event: template.event,
    amount: parseSmsAmount(amountText),
    currency,
    merchant,
    last4,
  };
}

/**
 * How each SMS event is recorded. The switch is exhaustive: a new
 * SmsEvent does not compile until someone decides how it reports.
 */
export function transactionShapeOf(event: SmsEvent): { kind: TransactionKind; direction: TransactionDirection } {
  switch (event) {
    case 'purchase':
      return { kind: 'expense', direction: 'debit' };
    case 'refund':
      // An expense in reverse. Stored as a CREDIT expense so analytics
      // nets it against the same category: 500 food - 120 refund = 380.
      return { kind: 'expense', direction: 'credit' };
    case 'withdrawal':
      // Cash out counts as spent when it leaves the bank. The app does
      // not track a cash wallet, so this is the honest approximation.
      return { kind: 'expense', direction: 'debit' };
    case 'deposit':
      return { kind: 'income', direction: 'credit' };
    case 'fee':
      return { kind: 'fee', direction: 'debit' };
  }
}
