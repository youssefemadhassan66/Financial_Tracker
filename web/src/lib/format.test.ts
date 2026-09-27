import { describe, expect, it } from 'vitest';
import { formatCalendarDay, formatInstantDay, formatMoney, formatPeriod, monthName } from './format';

const NBSP = String.fromCharCode(0xa0);
const MINUS = String.fromCharCode(0x2212);

describe('formatMoney', () => {
  it('formats a decimal string with the currency code and 2 decimals', () => {
    expect(formatMoney('8450.5', 'EGP')).toBe(`EGP${NBSP}8,450.50`);
    expect(formatMoney('21.6', 'USD')).toBe(`USD${NBSP}21.60`);
  });

  it('keeps full precision for amounts a JS number cannot hold', () => {
    // 9007199254740993 is above Number.MAX_SAFE_INTEGER; as a number it would print ...992.
    expect(formatMoney('9007199254740993.01', 'EGP')).toBe(`EGP${NBSP}9,007,199,254,740,993.01`);
  });

  it('adds a plus or a real minus sign for money in and out', () => {
    expect(formatMoney('25000', 'EGP', '+')).toBe(`+EGP${NBSP}25,000.00`);
    expect(formatMoney('149.99', 'EGP', '-')).toBe(`${MINUS}EGP${NBSP}149.99`);
  });
});

describe('dates', () => {
  it('shows instants on their Cairo day', () => {
    // 23:30 UTC on 9 Sep is already 10 Sep in Cairo (UTC+3 in summer).
    expect(formatInstantDay('2026-09-09T23:30:00.000Z', new Date('2026-09-27T12:00:00Z'))).toBe('10 Sep');
  });

  it('adds the year for other years', () => {
    expect(formatInstantDay('2025-12-31T10:00:00.000Z', new Date('2026-09-27T12:00:00Z'))).toBe('31 Dec 2025');
  });

  it('formats calendar days and periods without shifting them', () => {
    expect(formatCalendarDay('2026-10-05')).toBe('5 Oct');
    expect(formatPeriod('2026-09-01', '2026-09-30')).toBe(`1 ${String.fromCharCode(0x2013)} 30 Sep`);
    expect(monthName('2026-08-02')).toBe('August');
  });
});
