import { describe, expect, it } from 'vitest';
import {
  buildMonthlyRanges,
  daysInMonth,
  formatPeriodExplicit,
  getCairoYMD,
  parsePeriodParams,
  periodRange,
  periodToSearchParams,
  validateCustomRange,
} from './analytics-period';

describe('analytics-period', () => {
  describe('Cairo date and month calculations', () => {
    it('calculates Cairo YMD accurately across time zones', () => {
      // 2026-09-20 22:30:00 UTC -> 2026-09-21 01:30:00 in Cairo (UTC+3)
      const date = new Date('2026-09-20T22:30:00Z');
      const cairo = getCairoYMD(date);
      expect(cairo).toEqual({ year: 2026, month: 9, day: 21 });
    });

    it('handles leap year Feb 2024 vs non-leap Feb 2026', () => {
      expect(daysInMonth(2024, 2)).toBe(29);
      expect(daysInMonth(2026, 2)).toBe(28);
      expect(daysInMonth(2026, 1)).toBe(31);
      expect(daysInMonth(2026, 4)).toBe(30);
      expect(daysInMonth(2026, 12)).toBe(31);
    });
  });

  describe('period presets', () => {
    // Fixed now: 2026-09-20 in Cairo
    const nowSep20 = new Date('2026-09-20T12:00:00Z');

    it('calculates this-month correctly for month end', () => {
      const range = periodRange('this-month', nowSep20);
      expect(range).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    });

    it('calculates this-month during a leap year Feb', () => {
      const leapNow = new Date('2024-02-15T12:00:00Z');
      const range = periodRange('this-month', leapNow);
      expect(range).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    });

    it('calculates last-month', () => {
      const range = periodRange('last-month', nowSep20);
      expect(range).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    });

    it('handles year boundary for last-month when now is January', () => {
      const janNow = new Date('2026-01-15T12:00:00Z');
      const range = periodRange('last-month', janNow);
      expect(range).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    });

    it('calculates last 3 months (current + 2 before)', () => {
      const range = periodRange('3m', nowSep20);
      expect(range).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    });

    it('calculates last 3 months spanning year boundary', () => {
      const febNow = new Date('2026-02-10T12:00:00Z');
      const range = periodRange('3m', febNow);
      expect(range).toEqual({ from: '2025-12-01', to: '2026-02-28' });
    });

    it('calculates last 6 months (current + 5 before)', () => {
      const range = periodRange('6m', nowSep20);
      expect(range).toEqual({ from: '2026-04-01', to: '2026-09-30' });
    });

    it('calculates this year (Jan 1 to today)', () => {
      const range = periodRange('ytd', nowSep20);
      expect(range).toEqual({ from: '2026-01-01', to: '2026-09-20' });
    });
  });

  describe('custom range validation & 366-day cap', () => {
    it('accepts valid range within 366 days', () => {
      const res = validateCustomRange('2026-01-01', '2026-12-31');
      expect(res.valid).toBe(true);
      expect(res.error).toBeNull();
    });

    it('accepts exactly 366 days in a leap year', () => {
      const res = validateCustomRange('2024-01-01', '2024-12-31');
      expect(res.valid).toBe(true);
      expect(res.error).toBeNull();
    });

    it('rejects range exceeding 366 days with inline message', () => {
      const res = validateCustomRange('2025-01-01', '2026-01-05');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Date range cannot exceed 366 days');
    });

    it('rejects end date before start date', () => {
      const res = validateCustomRange('2026-05-10', '2026-05-01');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('The end date cannot be earlier than the start date');
    });

    it('rejects malformed or invalid calendar dates', () => {
      const res = validateCustomRange('2026-02-30', '2026-03-05');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Enter valid dates in YYYY-MM-DD format');
    });

    it('rejects missing dates', () => {
      const res = validateCustomRange(undefined, '2026-03-05');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Please choose both a start and an end date');
    });
  });

  describe('URL parsing round-trip', () => {
    const nowSep20 = new Date('2026-09-20T12:00:00Z');

    it('defaults to this-month when params are empty', () => {
      const parsed = parsePeriodParams(new URLSearchParams(), nowSep20);
      expect(parsed.preset).toBe('this-month');
      expect(parsed.range).toEqual({ from: '2026-09-01', to: '2026-09-30' });
      expect(parsed.error).toBeNull();
    });

    it('parses preset parameter', () => {
      const params = new URLSearchParams('period=3m');
      const parsed = parsePeriodParams(params, nowSep20);
      expect(parsed.preset).toBe('3m');
      expect(parsed.range).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    });

    it('parses custom from and to parameters', () => {
      const params = new URLSearchParams('from=2026-05-01&to=2026-06-15');
      const parsed = parsePeriodParams(params, nowSep20);
      expect(parsed.preset).toBe('custom');
      expect(parsed.range).toEqual({ from: '2026-05-01', to: '2026-06-15' });
      expect(parsed.error).toBeNull();
    });

    it('round-trips presets and custom ranges via periodToSearchParams', () => {
      const sp1 = periodToSearchParams('3m');
      const p1 = parsePeriodParams(sp1, nowSep20);
      expect(p1.preset).toBe('3m');

      const sp2 = periodToSearchParams('custom', { from: '2026-03-01', to: '2026-04-15' });
      const p2 = parsePeriodParams(sp2, nowSep20);
      expect(p2.preset).toBe('custom');
      expect(p2.range).toEqual({ from: '2026-03-01', to: '2026-04-15' });
    });
  });

  describe('formatPeriodExplicit', () => {
    const nowSep20 = new Date('2026-09-20T12:00:00Z');

    it('formats range ending in current month with (this month so far)', () => {
      const label = formatPeriodExplicit({ from: '2026-07-01', to: '2026-09-30' }, nowSep20);
      expect(label).toBe('1 Jul to 30 Sep (this month so far)');
    });

    it('formats range in past months without (this month so far)', () => {
      const label = formatPeriodExplicit({ from: '2026-08-01', to: '2026-08-31' }, nowSep20);
      expect(label).toBe('1 Aug to 31 Aug');
    });

    it('formats range across years with explicit years', () => {
      const label = formatPeriodExplicit({ from: '2025-11-01', to: '2026-01-31' }, nowSep20);
      expect(label).toBe('1 Nov 2025 to 31 Jan 2026');
    });
  });

  describe('buildMonthlyRanges', () => {
    const nowSep20 = new Date('2026-09-20T12:00:00Z');

    it('pads short ranges (<2 months) to at least 6 months ending at current month', () => {
      const ranges = buildMonthlyRanges('2026-09-01', '2026-09-30', nowSep20);
      expect(ranges).toHaveLength(6);
      expect(ranges[0].label).toBe('Apr');
      expect(ranges[0].from).toBe('2026-04-01');
      expect(ranges[0].to).toBe('2026-04-30');

      const last = ranges[5];
      expect(last.label).toBe('Sep (so far)');
      expect(last.from).toBe('2026-09-01');
      expect(last.to).toBe('2026-09-20'); // capped at today
      expect(last.isCurrentMonth).toBe(true);
    });

    it('builds exact months when range is 3 months', () => {
      const ranges = buildMonthlyRanges('2026-07-01', '2026-09-30', nowSep20);
      expect(ranges).toHaveLength(3);
      expect(ranges.map((r) => r.label)).toEqual(['Jul', 'Aug', 'Sep (so far)']);
      expect(ranges[0].to).toBe('2026-07-31');
      expect(ranges[1].to).toBe('2026-08-31');
      expect(ranges[2].to).toBe('2026-09-20');
    });
  });
});
