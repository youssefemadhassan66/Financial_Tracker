/**
 * Cairo time zone helpers (Africa/Cairo).
 * All calendar days and user-facing dates adhere to Cairo time zone.
 */

const TIME_ZONE = 'Africa/Cairo';

export function toCairoDateString(dateOrIso: Date | string): string {
  const date = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function toCairoDateTimeLocalString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function getCairoOffset(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const part = parts.find((p) => p.type === 'timeZoneName')?.value;
  if (part && part.startsWith('GMT')) {
    return part.slice(3);
  }
  return '+03:00';
}

/**
 * "2026-01-15T10:00" typed as Cairo wall time -> "2026-01-15T10:00:00+02:00".
 * Egypt has summer time (UTC+3) and winter time (UTC+2), so the offset must be
 * the one in force on the chosen date, not today's. First guess from the wall
 * time read as UTC, then settle with the instant that guess gives.
 */
export function cairoDateTimeToIso(dateTimeLocal: string): string {
  const guess = getCairoOffset(new Date(`${dateTimeLocal}:00Z`));
  const offset = getCairoOffset(new Date(`${dateTimeLocal}:00${guess}`));
  return `${dateTimeLocal}:00${offset}`;
}

export function getCairoDayHeading(cairoDay: string, now: Date = new Date()): string {
  const today = toCairoDateString(now);
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterday = toCairoDateString(yesterdayDate);

  if (cairoDay === today) return 'Today';
  if (cairoDay === yesterday) return 'Yesterday';

  const [y, m, d] = cairoDay.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const currentCairoYear = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
  }).format(now);

  const isCurrentYear = String(y) === currentCairoYear;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return isCurrentYear
    ? `${get('day')} ${get('month')}`
    : `${get('day')} ${get('month')} ${get('year')}`;
}
