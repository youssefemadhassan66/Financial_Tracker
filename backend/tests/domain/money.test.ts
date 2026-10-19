import { describe, expect, it } from 'vitest';
import { Money } from '../../src/domain/money.js';
import { DomainError } from '../../src/domain/errors.js';

describe('Money', () => {
  it('creates a valid amount', () => {
    const money = Money.create('19.99', 'EGP');
    expect(money.toDecimalString()).toBe('19.99');
    expect(money.getCurrency()).toBe('EGP');
  });

  it('rejects a negative amount', () => {
    expect(() => Money.create('-5', 'EGP')).toThrow(DomainError);
  });

  it('rejects more than 2 decimal places', () => {
    expect(() => Money.create('19.999', 'EGP')).toThrow(DomainError);
  });

  it('rejects a non-finite amount', () => {
    expect(() => Money.create(Infinity, 'EGP')).toThrow(DomainError);
  });

  it('adds two amounts in the same currency', () => {
    const total = Money.create('10.50', 'EGP').add(Money.create('4.25', 'EGP'));
    expect(total.toDecimalString()).toBe('14.75');
  });

  it('refuses to add different currencies', () => {
    expect(() => Money.create('10', 'EGP').add(Money.create('10', 'USD'))).toThrow(DomainError);
  });

  it('subtracts within the same currency', () => {
    const remaining = Money.create('20', 'EGP').subtract(Money.create('5', 'EGP'));
    expect(remaining.toDecimalString()).toBe('15.00');
  });

  it('refuses a subtraction that would go negative', () => {
    expect(() => Money.create('5', 'EGP').subtract(Money.create('20', 'EGP'))).toThrow(
      DomainError,
    );
  });

  it('is exact where plain floating point is not', () => {
    // The classic float trap: 0.1 + 0.2 !== 0.3 with plain numbers.
    // This is the whole reason Money exists instead of `amount: number`.
    const sum = Money.create('0.1', 'EGP').add(Money.create('0.2', 'EGP'));
    expect(sum.toDecimalString()).toBe('0.30');
  });

  it('compares by value, not by reference', () => {
    const a = Money.create('100', 'EGP');
    const b = Money.create('100', 'EGP');
    expect(a).not.toBe(b); // different objects
    expect(a.equals(b)).toBe(true); // same value
  });

  it('never mutates — add() returns a new instance', () => {
    const original = Money.create('10', 'EGP');
    const result = original.add(Money.create('5', 'EGP'));
    expect(original.toDecimalString()).toBe('10.00'); // unchanged
    expect(result.toDecimalString()).toBe('15.00');
  });
});
