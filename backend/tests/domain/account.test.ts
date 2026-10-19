import { describe, expect, it } from 'vitest';
import { Account, MAX_LAST4S } from '../../src/domain/account.js';
import { DomainError } from '../../src/domain/errors.js';
import { newAccountId, newUserId } from '../../src/domain/ids.js';

function build(overrides: Partial<Parameters<typeof Account.create>[0]> = {}) {
  return {
    id: newAccountId('acc_1'),
    userId: newUserId('usr_1'),
    name: 'CIB Current',
    type: 'checking' as const,
    currency: 'EGP' as const,
    ...overrides,
  };
}

describe('Account', () => {
  it('creates a valid account', () => {
    const account = Account.create(build());
    expect(account.getName()).toBe('CIB Current');
    expect(account.isArchived()).toBe(false);
  });

  it('trims the name', () => {
    expect(Account.create(build({ name: '  CIB  ' })).getName()).toBe('CIB');
  });

  it('rejects an empty name', () => {
    expect(() => Account.create(build({ name: '   ' }))).toThrow(DomainError);
  });

  it('rejects malformed card or account digits', () => {
    expect(() => Account.create(build({ last4s: ['12'] }))).toThrow(DomainError);
    expect(() => Account.create(build({ last4s: ['1234', 'abcd'] }))).toThrow(DomainError);
  });

  it('holds several numbers: a debit card and the account itself', () => {
    const account = Account.create(build({ last4s: ['4444', '2222'] }));
    expect(account.getLast4s()).toEqual(['4444', '2222']);
    expect(account.hasLast4('2222')).toBe(true);
    expect(account.hasLast4('9999')).toBe(false);
  });

  it('drops duplicate digits instead of storing them twice', () => {
    expect(Account.create(build({ last4s: ['4444', '4444'] })).getLast4s()).toEqual(['4444']);
  });

  it('defaults to no digits when none are given', () => {
    expect(Account.create(build()).getLast4s()).toEqual([]);
  });

  it(`refuses more than ${MAX_LAST4S} numbers`, () => {
    const many = Array.from({ length: MAX_LAST4S + 1 }, (_, i) => String(1000 + i));
    expect(() => Account.create(build({ last4s: many }))).toThrow(DomainError);
  });

  it('replaces the whole list, so a cancelled card can be removed', () => {
    const account = Account.create(build({ last4s: ['4444', '2222'] }));
    account.setLast4s(['2222']);
    expect(account.getLast4s()).toEqual(['2222']);
    expect(() => account.setLast4s(['12'])).toThrow(DomainError);
    expect(account.getLast4s()).toEqual(['2222']);
  });

  it('treats a credit card as a liability, a current account as not', () => {
    // A 3,000 balance on a card makes you poorer; in savings it makes
    // you richer. Same number, opposite sign for net worth.
    expect(Account.create(build({ type: 'credit_card' })).isLiability()).toBe(true);
    expect(Account.create(build({ type: 'checking' })).isLiability()).toBe(false);
  });

  it('only allows a brokerage account to hold positions', () => {
    expect(Account.create(build({ type: 'brokerage' })).canHoldPositions()).toBe(true);
    expect(Account.create(build({ type: 'wallet' })).canHoldPositions()).toBe(false);
  });

  it('archives instead of deleting, and refuses to archive twice', () => {
    const account = Account.create(build());
    account.archive();
    expect(account.isArchived()).toBe(true);
    expect(account.getArchivedAt()).toBeInstanceOf(Date);
    expect(() => account.archive()).toThrow(DomainError);
  });

  it('keeps identity across a rename', () => {
    const account = Account.create(build());
    const originalId = account.id;
    account.rename('CIB Visa');
    expect(account.id).toBe(originalId);
    expect(account.getName()).toBe('CIB Visa');
  });

  it('rejects renaming to empty', () => {
    const account = Account.create(build());
    expect(() => account.rename('  ')).toThrow(DomainError);
  });
});
