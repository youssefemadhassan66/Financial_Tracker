/**
 * Amount rules according to API.md and PRODUCT.md:
 * - Trim whitespace
 * - Allow the user to type thousands commas and strip them
 * - Must match API.md regex ^(0|[1-9]\d{0,15})(\.\d{1,2})?$
 * - Must not be zero
 * - Never use parseFloat (avoids IEEE 754 precision loss on large monetary strings)
 * - Returns the normalized string or a plain, kind error message
 */

export type AmountResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

const AMOUNT_REGEX = /^(0|[1-9]\d{0,15})(\.\d{1,2})?$/;

export function parseAmount(input: string): AmountResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter an amount' };
  }

  // Commas are only accepted as real thousands separators (groups of exactly 3
  // digits before any decimal point). Anything looser is ambiguous: "15,00" is
  // 15.00 in much of Europe, and stripping the comma would silently record 1500.
  if (trimmed.includes(',') && !/^[1-9]\d{0,2}(,\d{3})+(\.\d*)?$/.test(trimmed)) {
    return { ok: false, error: 'Enter a valid amount like 150 or 1,500.50' };
  }

  const stripped = trimmed.replace(/,/g, '');

  if (!AMOUNT_REGEX.test(stripped)) {
    return { ok: false, error: 'Enter a valid amount like 150 or 1,500.50' };
  }

  // Check if zero without parseFloat
  if (/^0(\.0+)?$/.test(stripped)) {
    return { ok: false, error: 'Amount must be greater than zero' };
  }

  return { ok: true, value: stripped };
}

export function normalizeAmount(input: string): AmountResult {
  return parseAmount(input);
}
