import { isValidCalendarDay } from './transaction-filters';

export type PeriodPreset = 'this-month' | 'last-month' | '3m' | '6m' | 'ytd' | 'custom';

export interface PeriodRange {
  from: string;
  to: string;
}

export interface MonthRange {
  year: number;
  month: number;
  from: string;
  to: string;
  label: string;
  shortName: string;
  isCurrentMonth: boolean;
}

const TIME_ZONE = 'Africa/Cairo';

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Extracts Cairo calendar year, month (1-12), and day (1-31) from a Date.
 */
export function getCairoYMD(date: Date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
  };
}

/**
 * Number of days in a Gregorian month (month is 1-12).
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Computes the Cairo calendar days for a period preset.
 */
export function periodRange(
  preset: PeriodPreset,
  now: Date = new Date(),
  custom?: { from?: string; to?: string },
): PeriodRange {
  const { year, month, day } = getCairoYMD(now);
  const todayStr = `${year}-${pad2(month)}-${pad2(day)}`;

  switch (preset) {
    case 'this-month': {
      const lastDay = daysInMonth(year, month);
      return {
        from: `${year}-${pad2(month)}-01`,
        to: `${year}-${pad2(month)}-${pad2(lastDay)}`,
      };
    }
    case 'last-month': {
      let prevYear = year;
      let prevMonth = month - 1;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }
      const lastDay = daysInMonth(prevYear, prevMonth);
      return {
        from: `${prevYear}-${pad2(prevMonth)}-01`,
        to: `${prevYear}-${pad2(prevMonth)}-${pad2(lastDay)}`,
      };
    }
    case '3m': {
      const startMonthIndex = year * 12 + (month - 1) - 2;
      const startYear = Math.floor(startMonthIndex / 12);
      const startMonth = (startMonthIndex % 12) + 1;
      const endLastDay = daysInMonth(year, month);
      return {
        from: `${startYear}-${pad2(startMonth)}-01`,
        to: `${year}-${pad2(month)}-${pad2(endLastDay)}`,
      };
    }
    case '6m': {
      const startMonthIndex = year * 12 + (month - 1) - 5;
      const startYear = Math.floor(startMonthIndex / 12);
      const startMonth = (startMonthIndex % 12) + 1;
      const endLastDay = daysInMonth(year, month);
      return {
        from: `${startYear}-${pad2(startMonth)}-01`,
        to: `${year}-${pad2(month)}-${pad2(endLastDay)}`,
      };
    }
    case 'ytd': {
      return {
        from: `${year}-01-01`,
        to: todayStr,
      };
    }
    case 'custom': {
      if (custom?.from && custom?.to) {
        return {
          from: custom.from,
          to: custom.to,
        };
      }
      const lastDay = daysInMonth(year, month);
      return {
        from: `${year}-${pad2(month)}-01`,
        to: `${year}-${pad2(month)}-${pad2(lastDay)}`,
      };
    }
  }
}

/**
 * Counts inclusive calendar days between two YYYY-MM-DD dates.
 */
export function countDaysInclusive(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((utc2 - utc1) / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Validates a custom date range:
 * - Both dates present and valid
 * - to >= from
 * - at most 366 days
 */
export function validateCustomRange(from?: string, to?: string): { valid: boolean; error: string | null } {
  if (!from || !to) {
    return { valid: false, error: 'Please choose both a start and an end date' };
  }
  if (!isValidCalendarDay(from) || !isValidCalendarDay(to)) {
    return { valid: false, error: 'Enter valid dates in YYYY-MM-DD format' };
  }
  if (to < from) {
    return { valid: false, error: 'The end date cannot be earlier than the start date' };
  }
  const days = countDaysInclusive(from, to);
  if (days > 366) {
    return { valid: false, error: 'Date range cannot exceed 366 days' };
  }
  return { valid: true, error: null };
}

export interface ParsedPeriod {
  preset: PeriodPreset;
  range: PeriodRange;
  error: string | null;
  customFrom?: string;
  customTo?: string;
}

/**
 * Parses query params (?period= or ?from=&to=) into a preset and date range.
 */
export function parsePeriodParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): ParsedPeriod {
  const getParam = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) {
      const val = params.get(key);
      return val ? val.trim() : undefined;
    }
    const val = params[key];
    if (Array.isArray(val)) return val[0]?.trim();
    if (typeof val === 'string') return val.trim();
    return undefined;
  };

  const rawPeriod = getParam('period');
  const rawFrom = getParam('from');
  const rawTo = getParam('to');

  if (rawFrom || rawTo) {
    const validation = validateCustomRange(rawFrom, rawTo);
    if (validation.valid && rawFrom && rawTo) {
      return {
        preset: 'custom',
        range: { from: rawFrom, to: rawTo },
        error: null,
        customFrom: rawFrom,
        customTo: rawTo,
      };
    }
    const fallback = periodRange('this-month', now);
    return {
      preset: 'custom',
      range: fallback,
      error: validation.error,
      customFrom: rawFrom,
      customTo: rawTo,
    };
  }

  const validPresets: PeriodPreset[] = ['this-month', 'last-month', '3m', '6m', 'ytd'];
  if (rawPeriod && validPresets.includes(rawPeriod as PeriodPreset)) {
    const preset = rawPeriod as PeriodPreset;
    return {
      preset,
      range: periodRange(preset, now),
      error: null,
    };
  }

  return {
    preset: 'this-month',
    range: periodRange('this-month', now),
    error: null,
  };
}

/**
 * Converts a preset and custom range back to URL search params.
 */
export function periodToSearchParams(
  preset: PeriodPreset,
  customRange?: { from?: string; to?: string },
): URLSearchParams {
  const params = new URLSearchParams();
  if (preset === 'custom' && customRange?.from && customRange?.to) {
    params.set('from', customRange.from);
    params.set('to', customRange.to);
  } else if (preset !== 'this-month') {
    params.set('period', preset);
  }
  return params;
}

/**
 * Formats a period range for display, e.g. "1 Jul to 30 Sep (this month so far)".
 */
export function formatPeriodExplicit(range: PeriodRange, now: Date = new Date()): string {
  const { year: nowYear, month: nowMonth } = getCairoYMD(now);
  const [y1, m1, d1] = range.from.split('-').map(Number);
  const [y2, m2, d2] = range.to.split('-').map(Number);

  const startMonthStr = MONTH_NAMES_SHORT[m1 - 1];
  const endMonthStr = MONTH_NAMES_SHORT[m2 - 1];

  let text: string;
  if (y1 === y2) {
    text = `${d1} ${startMonthStr} to ${d2} ${endMonthStr}`;
    if (y1 !== nowYear) {
      text += ` ${y1}`;
    }
  } else {
    text = `${d1} ${startMonthStr} ${y1} to ${d2} ${endMonthStr} ${y2}`;
  }

  const isCurrentMonth = y2 === nowYear && m2 === nowMonth;
  if (isCurrentMonth) {
    text += ' (this month so far)';
  }

  return text;
}

/**
 * Builds monthly ranges covering the period, with at least 6 months if the range is shorter than 2 months.
 * The current month is capped at today.
 */
export function buildMonthlyRanges(from: string, to: string, now: Date = new Date()): MonthRange[] {
  const { year: nowYear, month: nowMonth, day: nowDay } = getCairoYMD(now);
  const startYear = Number(from.slice(0, 4));
  const startMonth = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));

  let startIndex = startYear * 12 + (startMonth - 1);
  const endIndex = endYear * 12 + (endMonth - 1);
  const totalMonths = endIndex - startIndex + 1;

  if (totalMonths < 2) {
    startIndex = endIndex - 5;
  }

  const results: MonthRange[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const y = Math.floor(i / 12);
    const m = (i % 12) + 1;
    const isCurrent = y === nowYear && m === nowMonth;
    const monthLastDay = daysInMonth(y, m);
    const shortName = MONTH_NAMES_SHORT[m - 1];

    const toDay = isCurrent ? Math.min(nowDay, monthLastDay) : monthLastDay;
    const toDateStr = `${y}-${pad2(m)}-${pad2(toDay)}`;
    const fromDateStr = `${y}-${pad2(m)}-01`;
    const label = isCurrent ? `${shortName} (so far)` : shortName;

    results.push({
      year: y,
      month: m,
      from: fromDateStr,
      to: toDateStr,
      label,
      shortName,
      isCurrentMonth: isCurrent,
    });
  }

  return results;
}
