import { DomainError } from './errors.js';

/**
 * Calendar dates — "2026-09-21" — with no time of day and no timezone.
 *
 * Billing dates and report periods are CALENDAR concepts. "Netflix
 * renews on the 5th" and "spending in September" mean dates on the
 * user's own calendar, not instants in UTC. Mixing the two is how a
 * purchase at 00:30 on 1 October in Cairo (21:30 UTC on 30 September)
 * lands in the wrong month's report.
 *
 * Stored as the ISO string itself: it sorts correctly as plain text and
 * is exactly what Postgres DATE columns and JSON want.
 */
export type CalendarDate = string & { readonly __brand: 'CalendarDate' };

/** The user's timezone. A constant until users can choose their own. */
export const DEFAULT_TIME_ZONE = 'Africa/Cairo';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCalendarDate(value: string): value is CalendarDate {
  const match = ISO_DATE.exec(value);
  if (match === null) return false;
  const [, y, m, d] = match.map(Number);
  // Rejects "2026-02-30": Date.UTC would silently roll it to 2 March.
  return m! >= 1 && m! <= 12 && d! >= 1 && d! <= daysInMonth(y!, m!);
}

export function calendarDate(value: string): CalendarDate {
  if (!isCalendarDate(value)) {
    throw new DomainError(`"${value}" is not a valid calendar date (YYYY-MM-DD)`);
  }
  return value;
}

function parts(date: CalendarDate): [year: number, month: number, day: number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y!, m!, d!];
}

function format(year: number, month: number, day: number): CalendarDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as CalendarDate;
}

/** month is 1-12. Day 0 of the NEXT month is the last day of this one. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const [y, m, d] = parts(date);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return format(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/**
 * Adds whole months, CLAMPING the day to the target month's length.
 *
 * 31 January + 1 month is 28 February (29 in a leap year) — not 3 March,
 * which is what naive Date arithmetic produces by rolling the overflow
 * into the next month.
 */
export function addMonthsClamped(date: CalendarDate, months: number): CalendarDate {
  const [y, m, d] = parts(date);
  const totalMonths = y * 12 + (m - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return format(year, month, Math.min(d, daysInMonth(year, month)));
}

export function firstDayOfMonth(date: CalendarDate): CalendarDate {
  const [y, m] = parts(date);
  return format(y, m, 1);
}

export function lastDayOfMonth(date: CalendarDate): CalendarDate {
  const [y, m] = parts(date);
  return format(y, m, daysInMonth(y, m));
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Months from `from` to `to`, counting calendar months only. */
export function monthsBetween(from: CalendarDate, to: CalendarDate): number {
  const [y1, m1] = parts(from);
  const [y2, m2] = parts(to);
  return (y2 - y1) * 12 + (m2 - m1);
}

// ---------------------------------------------------------------------
// Timezone conversion
// ---------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function wallClock(instant: Date, timeZone: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return values;
}

/** The calendar date an instant falls on, as seen in `timeZone`. */
export function localDateOf(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): CalendarDate {
  const w = wallClock(instant, timeZone);
  return format(w['year']!, w['month']!, w['day']!);
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w['year']!, w['month']! - 1, w['day']!, w['hour']!, w['minute']!, w['second']!);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The first instant of `date` in `timeZone` — the start of that local day.
 *
 * Not simply "midnight minus the offset", because Egypt observes DST:
 *
 *  - On 24 April 2026 clocks jump from 23:59 straight to 01:00. Local
 *    midnight DOES NOT EXIST that day; the day starts at 01:00 local,
 *    which is 22:00 UTC the previous evening.
 *  - The offset at midnight can differ from the offset later that day,
 *    so using "today's offset" picks the wrong hour around a change.
 *
 * So: estimate using the offset at local noon (never near a change),
 * then, if that estimate still lands on the previous local date — the
 * missing-midnight case — step forward to where the new date begins.
 */
export function startOfLocalDay(date: CalendarDate, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const [y, m, d] = parts(date);
  const midnightAsUtc = Date.UTC(y, m - 1, d);
  const noonOffset = offsetMs(new Date(midnightAsUtc + 12 * 3_600_000), timeZone);

  let candidate = midnightAsUtc - noonOffset;
  // At most a DST gap's worth of stepping; gaps are never over 2 hours.
  for (let step = 0; step < 8 && localDateOf(new Date(candidate), timeZone) < date; step += 1) {
    candidate += 15 * 60_000;
  }
  return new Date(candidate);
}
