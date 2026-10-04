import { describe, expect, it } from 'vitest';
import { MAX_STATEMENT_BYTES, checkStatementFile, describeImport, formatStatementPeriod } from './statement-file';

describe('checkStatementFile', () => {
  it('accepts a PDF by type or by extension', () => {
    expect(checkStatementFile({ name: 'statement.pdf', type: '', size: 1000 })).toEqual({ ok: true });
    expect(checkStatementFile({ name: 'download', type: 'application/pdf', size: 1000 })).toEqual({ ok: true });
  });

  it('rejects other files, empty files and files over 5 MB', () => {
    expect(checkStatementFile({ name: 'photo.jpg', type: 'image/jpeg', size: 1000 }).ok).toBe(false);
    expect(checkStatementFile({ name: 'statement.pdf', type: 'application/pdf', size: 0 }).ok).toBe(false);
    expect(checkStatementFile({ name: 'statement.pdf', type: 'application/pdf', size: MAX_STATEMENT_BYTES }).ok).toBe(true);
    expect(checkStatementFile({ name: 'statement.pdf', type: 'application/pdf', size: MAX_STATEMENT_BYTES + 1 }).ok).toBe(false);
  });
});

describe('formatStatementPeriod', () => {
  it('names the month and year', () => {
    expect(formatStatementPeriod('2026-09')).toBe('September 2026');
    expect(formatStatementPeriod('2026-01')).toBe('January 2026');
  });
});

describe('describeImport', () => {
  const base = { status: 'imported' as const, confirmed: 0, created: 0, unmatchedPayments: 0, pricedSms: 0 };

  it('says nothing changed for a repeat import', () => {
    expect(describeImport({ ...base, status: 'already-imported', created: 3 })).toBe(
      'Already imported before. Nothing changed.',
    );
  });

  it('lists what happened, with singular and plural', () => {
    expect(describeImport({ ...base, confirmed: 5, created: 1, pricedSms: 2 })).toBe(
      '5 matched messages you already had, 1 new transaction added, 2 foreign charges got their EGP amount.',
    );
    expect(describeImport({ ...base, created: 20, unmatchedPayments: 6 })).toBe(
      '20 new transactions added. 6 card payments have no matching message yet.',
    );
  });
});
