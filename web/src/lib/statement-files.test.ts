import { describe, expect, it } from 'vitest';
import { formatStatementPeriod } from './statement-file';
import { describePeriods, describePlans, formatFileSize } from './statement-files';

describe('formatFileSize', () => {
  it('uses the unit a person would', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(81_234)).toBe('79 KB');
    expect(formatFileSize(2_400_000)).toBe('2.3 MB');
  });
});

describe('describePeriods', () => {
  it('names one month, a range in one year, and a range across years', () => {
    expect(describePeriods(['2026-09'], formatStatementPeriod)).toBe('September 2026');
    expect(describePeriods(['2026-09', '2026-07', '2026-08'], formatStatementPeriod)).toBe('July – September 2026');
    expect(describePeriods(['2026-01', '2025-12'], formatStatementPeriod)).toBe('December 2025 – January 2026');
    expect(describePeriods([], formatStatementPeriod)).toBe('No months imported from it');
  });
});

describe('describePlans', () => {
  it('says what an import did with installment plans', () => {
    expect(describePlans({ added: 0, alreadyKnown: 0 })).toBeNull();
    expect(describePlans({ added: 1, alreadyKnown: 0 })).toBe('1 installment plan added to Plans.');
    expect(describePlans({ added: 2, alreadyKnown: 1 })).toBe('2 installment plans added to Plans.');
    expect(describePlans({ added: 0, alreadyKnown: 2 })).toBe('Its installment plans are already in Plans.');
  });
});
