import { DomainError } from '../errors.js';
import type { Currency } from '../currency.js';

// Built from code points rather than typed literally: an invisible or
// look-alike character pasted into source is impossible to review.
const ARABIC_INDIC_ZERO = 0x0660; // ٠ .. ٩ = 0x0660 .. 0x0669
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0; // ۰ .. ۹ (Persian/Urdu forms)
const ARABIC_DECIMAL_SEPARATOR = String.fromCharCode(0x066b);
const ARABIC_THOUSANDS_SEPARATOR = String.fromCharCode(0x066c);

/**
 * Puts an SMS body into ONE canonical form before any template sees it.
 *
 * Egyptian bank SMS mix scripts: the same bank may send "1,250.00" in
 * one message and "١٬٢٥٠٫٠٠" in the next, depending on the phone's
 * language. Normalizing once, here, means every template is written
 * against plain ASCII digits and single spaces, instead of every
 * template handling every variant (and some forgetting).
 *
 * - NFKC folds compatibility forms (full-width digits, Arabic
 *   presentation forms some phones emit) into their plain letters.
 * - Arabic-Indic digits become 0-9; the Arabic decimal and thousands
 *   separators become "." and ",".
 * - Any run of whitespace (including line breaks and no-break spaces)
 *   becomes one space, so templates never depend on line layout.
 */
export function normalizeSmsText(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFKC')) {
    const code = ch.charCodeAt(0);
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO);
    } else if (code >= EXTENDED_ARABIC_INDIC_ZERO && code <= EXTENDED_ARABIC_INDIC_ZERO + 9) {
      out += String(code - EXTENDED_ARABIC_INDIC_ZERO);
    } else if (ch === ARABIC_DECIMAL_SEPARATOR) {
      out += '.';
    } else if (ch === ARABIC_THOUSANDS_SEPARATOR) {
      out += ',';
    } else {
      out += ch;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** "1,250.50" — commas must sit exactly every three digits. */
const GROUPED_AMOUNT = /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/;
/** "1250.50" or "1250". */
const PLAIN_AMOUNT = /^\d+(?:\.\d{1,2})?$/;

/**
 * Reads an amount out of SMS text and returns a decimal STRING.
 *
 * Deliberately strict. "1.250,00" (European style) is rejected rather
 * than guessed, because guessing wrong turns 1,250 EGP into 1.25 EGP
 * without any error — the worst kind of money bug. A rejected SMS lands
 * in the "unparsed" list where you can see it; a misread one hides in
 * your totals.
 */
export function parseSmsAmount(raw: string): string {
  const plain = parseSmsBalance(raw);
  if (/^0+(?:\.0+)?$/.test(plain)) {
    throw new DomainError('Amount cannot be zero');
  }
  return plain;
}

/**
 * Same strict reading as parseSmsAmount, but zero is allowed: a balance
 * of 0.00 is a real balance, while a transaction of 0.00 is a misread.
 */
export function parseSmsBalance(raw: string): string {
  const text = normalizeSmsText(raw).replace(/ /g, '');
  if (!GROUPED_AMOUNT.test(text) && !PLAIN_AMOUNT.test(text)) {
    throw new DomainError(`Unreadable amount "${raw}"`);
  }
  return text.replace(/,/g, '');
}

/**
 * The ways Egyptian bank SMS write a currency. Keys are compared after
 * normalizeSmsText and upper-casing.
 */
const CURRENCY_TOKENS: ReadonlyMap<string, Currency> = new Map<string, Currency>([
  ['EGP', 'EGP'],
  ['LE', 'EGP'],
  ['L.E', 'EGP'],
  ['L.E.', 'EGP'],
  ['جنيه', 'EGP'],
  ['جنيها', 'EGP'],
  ['جنيهاً', 'EGP'],
  ['ج.م', 'EGP'],
  ['ج.م.', 'EGP'],
  ['جم', 'EGP'], // CIB InstaPay: "بمبلغ 800.00 جم"
  ['USD', 'USD'],
  ['US$', 'USD'],
  ['$', 'USD'],
  ['دولار', 'USD'],
]);

/**
 * Maps a currency word from an SMS to a Currency. Unknown words are an
 * error, never a default: silently treating "EUR 50" as 50 EGP would be
 * wrong by a factor of ~50.
 */
export function currencyFromSmsToken(token: string): Currency {
  const currency = CURRENCY_TOKENS.get(normalizeSmsText(token).toUpperCase());
  if (currency === undefined) {
    throw new DomainError(`Unsupported currency "${token}"`);
  }
  return currency;
}
