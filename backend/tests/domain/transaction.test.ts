import { describe, expect, it } from 'vitest';
import { Transaction } from '../../src/domain/transaction.js';
import { Money } from '../../src/domain/money.js';
import { DomainError } from '../../src/domain/errors.js';
import { newAccountId, newCategoryId, newMerchantKey, newTransactionId } from '../../src/domain/ids.js';

function buildInput(overrides: Partial<Parameters<typeof Transaction.create>[0]> = {}) {
  return {
    id: newTransactionId('txn_1'),
    accountId: newAccountId('acc_1'),
    amount: Money.create('45.50', 'EGP'),
    direction: 'debit' as const,
    merchantKey: newMerchantKey('CARREFOUR'),
    merchantRaw: 'كارفور المعادي',
    occurredAt: new Date('2026-09-01T10:00:00Z'),
    source: 'sms' as const,
    ...overrides,
  };
}

describe('Transaction', () => {
  it('creates uncategorized by default', () => {
    const txn = Transaction.create(buildInput());
    expect(txn.isCategorized()).toBe(false);
    expect(txn.getCategoryId()).toBeNull();
  });

  it('accepts Arabic merchant text unchanged', () => {
    const txn = Transaction.create(buildInput({ merchantRaw: 'كارفور المعادي' }));
    expect(txn.merchantRaw).toBe('كارفور المعادي');
  });

  it('rejects an empty merchantRaw', () => {
    expect(() => Transaction.create(buildInput({ merchantRaw: '   ' }))).toThrow(DomainError);
  });

  it('rejects a future occurredAt', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(() => Transaction.create(buildInput({ occurredAt: tomorrow }))).toThrow(DomainError);
  });

  it('becomes categorized after categorize()', () => {
    const txn = Transaction.create(buildInput());
    const categoryId = newCategoryId('cat_groceries');

    txn.categorize(categoryId);

    expect(txn.isCategorized()).toBe(true);
    expect(txn.getCategoryId()).toBe(categoryId);
  });

  it('keeps its identity across category changes', () => {
    // This is the entity vs value-object distinction made concrete:
    // the id never changes, no matter what else about the transaction does.
    const txn = Transaction.create(buildInput());
    const originalId = txn.id;

    txn.categorize(newCategoryId('cat_groceries'));
    txn.categorize(newCategoryId('cat_dining')); // user corrects it

    expect(txn.id).toBe(originalId);
    expect(txn.getCategoryId()).toBe(newCategoryId('cat_dining'));
  });
});
