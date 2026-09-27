import { describe, expect, it } from 'vitest';
import {
  cairoDateTimeToIso,
  getCairoDayHeading,
  toCairoDateString,
} from './cairo-date';

describe('cairo-date helpers', () => {
  it('formats headings as Today, Yesterday, or formatted date', () => {
    // Reference date: 2026-09-27T12:00:00Z
    const fakeNow = new Date('2026-09-27T12:00:00Z');

    expect(getCairoDayHeading('2026-09-27', fakeNow)).toBe('Today');
    expect(getCairoDayHeading('2026-09-26', fakeNow)).toBe('Yesterday');
    expect(getCairoDayHeading('2026-09-25', fakeNow)).toBe('25 Sep');
    expect(getCairoDayHeading('2025-09-25', fakeNow)).toBe('25 Sep 2025');
  });

  it('converts date to Cairo calendar day string', () => {
    const d = new Date('2026-09-27T23:30:00Z'); // 23:30 UTC is next day in Cairo (02:30 on Sept 28)
    expect(toCairoDateString(d)).toBe('2026-09-28');
  });

  it('converts datetime-local value to ISO with offset', () => {
    const iso = cairoDateTimeToIso('2026-09-27T14:30');
    expect(iso).toMatch(/^2026-09-27T14:30:00\+\d{2}:\d{2}$/);
  });

  it('uses the offset of the chosen date, not of today (Egypt summer vs winter time)', () => {
    expect(cairoDateTimeToIso('2026-01-15T10:00')).toBe('2026-01-15T10:00:00+02:00');
    expect(cairoDateTimeToIso('2026-07-15T10:00')).toBe('2026-07-15T10:00:00+03:00');
    // Just before midnight in winter must stay on the same Cairo day.
    expect(toCairoDateString(cairoDateTimeToIso('2026-01-15T23:30'))).toBe('2026-01-15');
  });
});
