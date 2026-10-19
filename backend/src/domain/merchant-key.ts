import { DomainError } from './errors.js';
import { newMerchantKey, type MerchantKey } from './ids.js';

/**
 * Turns a merchant name as written by a bank into a stable lookup key.
 *
 * Banks write the same shop many ways — "CARREFOUR MAADI #1234",
 * "Carrefour-Maadi", "كارفور المعادي". The category learned for one
 * spelling should apply to the next, which only works if they share a
 * key. This is deliberately conservative: it only removes differences
 * that never change which merchant it is.
 */

/** Arabic tatweel (ـ), a purely decorative stretching character. Built
 *  from its code point so no invisible character sits in this file. */
const TATWEEL = String.fromCharCode(0x0640);

/**
 * Arabic letters written several interchangeable ways, especially in
 * typed and bank text: alef with hamza forms, taa marbuta, alef maksura.
 * This is the standard folding used for Arabic search.
 */
const ARABIC_FOLDS: ReadonlyArray<[RegExp, string]> = [
  [/[أإآٱ]/g, 'ا'],
  [/ة/g, 'ه'],
  [/ى/g, 'ي'],
];

export function normalizeMerchantKey(raw: string): MerchantKey {
  let text = raw
    // NFKC folds compatibility forms too — Arabic presentation-form
    // glyphs and full-width Latin letters become their ordinary letters.
    .normalize('NFKC')
    // Diacritics (Arabic tashkeel, Latin accents after NFKD-style marks)
    // never change the merchant.
    .replace(/\p{M}/gu, '')
    .split(TATWEEL)
    .join('');

  for (const [pattern, replacement] of ARABIC_FOLDS) {
    text = text.replace(pattern, replacement);
  }

  const key = text
    .toUpperCase()
    // Punctuation and symbols become word breaks.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    // Tokens that are ONLY digits, 3 or more long, are branch numbers,
    // terminal ids and references — they change on every visit to the
    // same shop. Short ones ("7" in "7 ELEVEN") are kept.
    .filter((token) => token.length > 0 && !/^\p{N}{3,}$/u.test(token))
    .join(' ');

  if (key.length === 0) {
    throw new DomainError(`Cannot derive a merchant key from "${raw}"`);
  }
  return newMerchantKey(key);
}
