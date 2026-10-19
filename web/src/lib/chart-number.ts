import Decimal from 'decimal.js';
import type { Currency } from './api/types';

/**
 * Converts a decimal amount string to a JavaScript number for chart geometry.
 * Bar lengths only; never displayed, never summed.
 */
export function toChartNumber(amount: string): number {
  if (!amount || amount.trim() === '') return 0;
  try {
    const d = new Decimal(amount.trim());
    return d.toNumber();
  } catch {
    return 0;
  }
}

const NO_BREAK_SPACE = String.fromCharCode(0xa0);
const MINUS_SIGN = String.fromCharCode(0x2212);

/**
 * Formats a decimal-string amount into compact currency format (e.g. "EGP 8.5K", "USD 1.2M").
 * Built from the string with decimal.js so precision is preserved.
 */
export function formatCompactMoney(amount: string, currency: Currency): string {
  if (!amount || amount.trim() === '') {
    return `${currency}${NO_BREAK_SPACE}0`;
  }
  try {
    const d = new Decimal(amount.trim());
    const isNegative = d.isNegative();
    const abs = d.abs();

    let formatted: string;
    if (abs.greaterThanOrEqualTo(1_000_000_000)) {
      const b = abs.dividedBy(1_000_000_000);
      formatted = `${trimTrailingZeros(b.toFixed(1))}B`;
    } else if (abs.greaterThanOrEqualTo(1_000_000)) {
      const m = abs.dividedBy(1_000_000);
      formatted = `${trimTrailingZeros(m.toFixed(1))}M`;
    } else if (abs.greaterThanOrEqualTo(1_000)) {
      const k = abs.dividedBy(1_000);
      formatted = `${trimTrailingZeros(k.toFixed(1))}K`;
    } else {
      formatted = trimTrailingZeros(abs.toFixed(0));
    }

    const sign = isNegative ? MINUS_SIGN : '';
    return `${sign}${currency}${NO_BREAK_SPACE}${formatted}`;
  } catch {
    return `${currency}${NO_BREAK_SPACE}0`;
  }
}

function trimTrailingZeros(val: string): string {
  if (val.includes('.')) {
    return val.replace(/\.0$/, '').replace(/(\.\d)0$/, '$1');
  }
  return val;
}
