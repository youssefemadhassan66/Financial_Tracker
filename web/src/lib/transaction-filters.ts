export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
}

export interface ParsedFiltersResult {
  filters: TransactionFilters;
  dateRangeError: string | null;
  hasFilters: boolean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(str: string): boolean {
  return UUID_REGEX.test(str);
}

/**
 * Validates a real calendar date in YYYY-MM-DD format (rejects 2026-02-30).
 */
export function isValidCalendarDay(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Parses search parameters into valid API filter parameters.
 * - Non-UUID accountId or categoryId values are ignored
 * - Malformed or impossible dates are ignored
 * - When both from and to are present and to < from, sets dateRangeError
 */
export function parseTransactionFilters(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): ParsedFiltersResult {
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

  const rawAccountId = getParam('accountId');
  const rawCategoryId = getParam('categoryId');
  const rawFrom = getParam('from');
  const rawTo = getParam('to');

  const hasFilters = Boolean(rawAccountId || rawCategoryId || rawFrom || rawTo);

  const filters: TransactionFilters = {};

  if (rawAccountId && isValidUuid(rawAccountId)) {
    filters.accountId = rawAccountId;
  }

  if (rawCategoryId && isValidUuid(rawCategoryId)) {
    filters.categoryId = rawCategoryId;
  }

  if (rawFrom && isValidCalendarDay(rawFrom)) {
    filters.from = rawFrom;
  }

  if (rawTo && isValidCalendarDay(rawTo)) {
    filters.to = rawTo;
  }

  let dateRangeError: string | null = null;
  if (filters.from && filters.to && filters.to < filters.from) {
    dateRangeError = 'The end date cannot be earlier than the start date';
  }

  return {
    filters,
    dateRangeError,
    hasFilters,
  };
}
