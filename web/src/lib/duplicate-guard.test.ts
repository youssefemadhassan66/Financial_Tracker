import { describe, expect, it } from 'vitest';
import type { TransactionView } from './api/types';
import { findPossibleDuplicate } from './duplicate-guard';

const sampleRows: TransactionView[] = [
  {
    id: 'tx-11111111-1111-1111-1111-111111111111',
    accountId: 'acc-11111111-1111-1111-1111-111111111111',
    accountName: 'Test Account',
    amount: '150.00',
    currency: 'EGP',
    direction: 'debit',
    kind: 'expense',
    countsAsSpending: true,
    category: { id: 'cat-1', name: 'TEST Food', icon: null },
    merchant: 'TEST MARKET',
    occurredAt: '2026-09-27T10:00:00.000Z',
    source: 'manual',
    transferGroupId: null,
    original: null,
  },
  {
    id: 'tx-22222222-2222-2222-2222-222222222222',
    accountId: 'acc-11111111-1111-1111-1111-111111111111',
    accountName: 'Test Account',
    amount: '500.00',
    currency: 'EGP',
    direction: 'credit',
    kind: 'income',
    countsAsSpending: false,
    category: null,
    merchant: 'TEST SALARY',
    occurredAt: '2026-09-27T12:00:00.000Z',
    source: 'manual',
    transferGroupId: null,
    original: null,
  },
];

describe('findPossibleDuplicate', () => {
  it('returns the row when amount and direction match', () => {
    const dup = findPossibleDuplicate(sampleRows, '150.00', 'debit');
    expect(dup).not.toBeNull();
    expect(dup?.id).toBe('tx-11111111-1111-1111-1111-111111111111');
    expect(dup?.merchant).toBe('TEST MARKET');
  });

  it('returns null when amount matches but direction differs', () => {
    const dup = findPossibleDuplicate(sampleRows, '150.00', 'credit');
    expect(dup).toBeNull();
  });

  it('returns null when direction matches but amount differs', () => {
    const dup = findPossibleDuplicate(sampleRows, '999.00', 'debit');
    expect(dup).toBeNull();
  });

  it('returns null on an empty list', () => {
    const dup = findPossibleDuplicate([], '150.00', 'debit');
    expect(dup).toBeNull();
  });

  it('matches what the user typed ("150", "150.5") against API amounts ("150.00", "150.50")', () => {
    expect(findPossibleDuplicate(sampleRows, '150', 'debit')?.merchant).toBe('TEST MARKET');
    expect(findPossibleDuplicate(sampleRows, '500.0', 'credit')?.merchant).toBe('TEST SALARY');
    expect(findPossibleDuplicate(sampleRows, '15', 'debit')).toBeNull();
  });
});
