import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  calendarDate,
  daysBetween,
  firstDayOfMonth,
  isCalendarDate,
  lastDayOfMonth,
  localDateOf,
  startOfLocalDay,
} from '../../src/domain/calendar-date.js';
import { DomainError } from '../../src/domain/errors.js';

const d = calendarDate;

describe('calendar dates', () => {
  it('rejects impossible dates instead of rolling them over', () => {
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('2026-9-1')).toBe(false);
    expect(() => calendarDate('2026-02-30')).toThrow(DomainError);
  });

  it('knows leap years', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(d('2026-03-01'), -1)).toBe('2026-02-28');
  });

  it('clamps month addition to the end of shorter months', () => {
    expect(addMonthsClamped(d('2026-01-31'), 1)).toBe('2026-02-28');
    expect(addMonthsClamped(d('2028-01-31'), 1)).toBe('2028-02-29');
    expect(addMonthsClamped(d('2026-01-31'), 3)).toBe('2026-04-30');
    expect(addMonthsClamped(d('2026-11-15'), 3)).toBe('2027-02-15');
  });

  it('finds month boundaries', () => {
    expect(firstDayOfMonth(d('2026-09-21'))).toBe('2026-09-01');
    expect(lastDayOfMonth(d('2026-09-21'))).toBe('2026-09-30');
    expect(lastDayOfMonth(d('2026-02-10'))).toBe('2026-02-28');
  });

  it('counts days between dates', () => {
    expect(daysBetween(d('2026-09-01'), d('2026-09-30'))).toBe(29);
    expect(daysBetween(d('2026-09-30'), d('2026-09-01'))).toBe(-29);
  });
});

describe('timezone conversion — Africa/Cairo', () => {
  it('puts a 00:30 Cairo purchase on the Cairo date, not the UTC date', () => {
    // 1 Oct 2026 00:30 in Cairo (UTC+3 in summer) is 30 Sep 21:30 UTC.
    const instant = new Date('2026-09-30T21:30:00Z');
    expect(instant.toISOString().slice(0, 10)).toBe('2026-09-30'); // UTC says September
    expect(localDateOf(instant)).toBe('2026-10-01'); // the user says October
  });

  it('starts an ordinary summer day at 21:00 UTC the evening before', () => {
    expect(startOfLocalDay(d('2026-09-21')).toISOString()).toBe('2026-09-20T21:00:00.000Z');
  });

  it('starts an ordinary winter day at 22:00 UTC the evening before', () => {
    expect(startOfLocalDay(d('2026-01-15')).toISOString()).toBe('2026-01-14T22:00:00.000Z');
  });

  it('handles the day whose midnight does not exist — DST start, 24 April 2026', () => {
    // Clocks jump 23:59 -> 01:00. The day begins at the jump.
    const start = startOfLocalDay(d('2026-04-24'));
    expect(start.toISOString()).toBe('2026-04-23T22:00:00.000Z');
    expect(localDateOf(start)).toBe('2026-04-24');
    // One minute earlier is still the previous day.
    expect(localDateOf(new Date(start.getTime() - 60_000))).toBe('2026-04-23');
  });

  it('handles the day with a repeated hour — DST end, 29 October 2026', () => {
    expect(startOfLocalDay(d('2026-10-29')).toISOString()).toBe('2026-10-28T21:00:00.000Z');
    // The following day starts after the repeated 23:00 hour, at UTC+2.
    expect(startOfLocalDay(d('2026-10-30')).toISOString()).toBe('2026-10-29T22:00:00.000Z');
  });

  it('makes day boundaries seamless: every day ends where the next begins', () => {
    let day = d('2026-04-20');
    for (let i = 0; i < 200; i += 1) {
      const next = addDays(day, 1);
      const lastMs = new Date(startOfLocalDay(next).getTime() - 1);
      expect(localDateOf(lastMs)).toBe(day);
      expect(localDateOf(startOfLocalDay(next))).toBe(next);
      day = next;
    }
  });
});
