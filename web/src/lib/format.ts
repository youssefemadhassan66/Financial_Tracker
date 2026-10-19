import type { Currency } from './api/types';

// All dates are shown in Cairo time (API.md section 1).
const TIME_ZONE = 'Africa/Cairo';

// Written as code points so no invisible or look-alike character hides in the source.
const NO_BREAK_SPACE = String.fromCharCode(0xa0);
const MINUS_SIGN = String.fromCharCode(0x2212);
const EN_DASH = String.fromCharCode(0x2013);

const moneyFormatters = new Map<Currency, Intl.NumberFormat>();
function moneyFormatter(currency: Currency): Intl.NumberFormat {
  let f = moneyFormatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    moneyFormatters.set(currency, f);
  }
  return f;
}

/**
 * Formats a decimal-string amount ("8450.5") for display: "EGP 8,450.50".
 * The string goes to Intl as-is (Intl formats numeric strings exactly), so the
 * amount is never turned into a JS number and never loses precision.
 * `sign` prefixes "+" or a real minus sign for money in or out.
 */
export function formatMoney(amount: string, currency: Currency, sign?: '+' | '-'): string {
  const text = moneyFormatter(currency)
    .format(amount as Intl.StringNumericLiteral)
    // A no-break space keeps "EGP" and the digits together on one line.
    .replace(/^([A-Z]{3})\s*/, `$1${NO_BREAK_SPACE}`);
  if (sign === '+') return `+${text}`;
  if (sign === '-') return `${MINUS_SIGN}${text}`;
  return text;
}

/** "10 Sep" / "10 Sep 2025" in the given time zone. Built from parts so every browser agrees. */
function dayMonth(date: Date, timeZone: string, withYear: boolean): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return withYear ? `${get('day')} ${get('month')} ${get('year')}` : `${get('day')} ${get('month')}`;
}

function cairoYear(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric' }).format(date);
}

function calendarDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "2026-09-10T10:00:00.000Z" -> "10 Sep" (Cairo day). Adds the year when it isn't this year. */
export function formatInstantDay(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  return dayMonth(date, TIME_ZONE, cairoYear(date) !== cairoYear(now));
}

/** A calendar day "2026-10-05" -> "5 Oct". Parsed as a plain date so no time zone can shift it. */
export function formatCalendarDay(day: string): string {
  return dayMonth(calendarDate(day), 'UTC', false);
}

/** A period like { from: "2026-09-01", to: "2026-09-30" } -> "1 - 30 Sep", or "2 Aug - 1 Sep". */
export function formatPeriod(from: string, to: string): string {
  const end = formatCalendarDay(to);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return sameMonth ? `${Number(from.slice(8, 10))} ${EN_DASH} ${end}` : `${formatCalendarDay(from)} ${EN_DASH} ${end}`;
}

/** Month name of a calendar day: "2026-08-02" -> "August". */
export function monthName(day: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long' }).format(calendarDate(day));
}
