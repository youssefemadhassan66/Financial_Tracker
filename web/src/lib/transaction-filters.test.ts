import { describe, expect, it } from 'vitest';
import { parseTransactionFilters } from './transaction-filters';

describe('parseTransactionFilters', () => {
  it('returns empty filters when no params provided', () => {
    const res = parseTransactionFilters(new URLSearchParams());
    expect(res.filters).toEqual({});
    expect(res.dateRangeError).toBeNull();
    expect(res.hasFilters).toBe(false);
  });

  it('correctly parses valid filter parameters', () => {
    const params = new URLSearchParams({
      accountId: '11111111-1111-1111-1111-111111111111',
      categoryId: '22222222-2222-2222-2222-222222222222',
      from: '2026-09-01',
      to: '2026-09-30',
    });

    const res = parseTransactionFilters(params);
    expect(res.filters).toEqual({
      accountId: '11111111-1111-1111-1111-111111111111',
      categoryId: '22222222-2222-2222-2222-222222222222',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(res.dateRangeError).toBeNull();
    expect(res.hasFilters).toBe(true);
  });

  it('ignores invalid non-UUID accountId and categoryId', () => {
    const params = new URLSearchParams({
      accountId: 'not-a-uuid',
      categoryId: '12345',
    });

    const res = parseTransactionFilters(params);
    expect(res.filters.accountId).toBeUndefined();
    expect(res.filters.categoryId).toBeUndefined();
    expect(res.hasFilters).toBe(true);
  });

  it('ignores invalid or impossible calendar dates', () => {
    const params = new URLSearchParams({
      from: 'invalid-date',
      to: '2026-02-30', // Feb 30th does not exist
    });

    const res = parseTransactionFilters(params);
    expect(res.filters.from).toBeUndefined();
    expect(res.filters.to).toBeUndefined();
    expect(res.hasFilters).toBe(true);
  });

  it('flags error when "to" date is earlier than "from" date', () => {
    const params = new URLSearchParams({
      from: '2026-09-20',
      to: '2026-09-10',
    });

    const res = parseTransactionFilters(params);
    expect(res.filters.from).toBe('2026-09-20');
    expect(res.filters.to).toBe('2026-09-10');
    expect(res.dateRangeError).toBe('The end date cannot be earlier than the start date');
    expect(res.hasFilters).toBe(true);
  });

  it('accepts same day for "from" and "to"', () => {
    const params = new URLSearchParams({
      from: '2026-09-20',
      to: '2026-09-20',
    });

    const res = parseTransactionFilters(params);
    expect(res.dateRangeError).toBeNull();
    expect(res.filters.from).toBe('2026-09-20');
    expect(res.filters.to).toBe('2026-09-20');
  });

  it('works with plain record object', () => {
    const res = parseTransactionFilters({
      from: '2026-09-01',
      to: '2026-09-15',
    });
    expect(res.filters.from).toBe('2026-09-01');
    expect(res.filters.to).toBe('2026-09-15');
    expect(res.dateRangeError).toBeNull();
    expect(res.hasFilters).toBe(true);
  });
});
