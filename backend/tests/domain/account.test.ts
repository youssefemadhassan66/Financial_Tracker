import { describe, expect, it } from 'vitest';
import { Account } from '../../src/domain/account.js';
import { DomainError } from '../../src/domain/errors.js';
import { newAccountId } from '../../src/domain/ids.js';

function build(overrides: Partial<Parameters<typeof Account.create>[0]> = {}) {
  return {
    id: newAccountId('acc_1'),
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

  it('rejects a malformed last4', () => {
    expect(() => Account.create(build({ last4: '12' }))).toThrow(DomainError);
    expect(() => Account.create(build({ last4: 'abcd' }))).toThrow(DomainError);
  });

  it('accepts a valid last4', () => {
    expect(Account.create(build({ last4: '1234' })).last4).toBe('1234');
  });

  it('defaults last4 to null when not given', () => {
    expect(Account.create(build()).last4).toBeNull();
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
