import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPENDING_POLICY,
  defaultCountsAsSpending,
} from '../../src/domain/spending-policy.js';
import { TRANSACTION_KINDS } from '../../src/domain/transaction-kind.js';

const feesOn = { countFeesAsSpending: true };
const feesOff = { countFeesAsSpending: false };

describe('defaultCountsAsSpending', () => {
  it('counts a plain expense', () => {
    expect(defaultCountsAsSpending('expense', feesOn)).toBe(true);
  });

  it('counts credit card interest — real money paid to the bank', () => {
    expect(defaultCountsAsSpending('interest', feesOn)).toBe(true);
  });

  it('makes fees follow the user policy, in both directions', () => {
    expect(defaultCountsAsSpending('fee', feesOn)).toBe(true);
    expect(defaultCountsAsSpending('fee', feesOff)).toBe(false);
  });

  it('never counts money that merely moved', () => {
    // These are the three double-counting traps the design exists to stop.
    expect(defaultCountsAsSpending('transfer', feesOn)).toBe(false);
    expect(defaultCountsAsSpending('trade', feesOn)).toBe(false);
    expect(defaultCountsAsSpending('adjustment', feesOn)).toBe(false);
  });

  it('does not count money coming in', () => {
    expect(defaultCountsAsSpending('income', feesOn)).toBe(false);
    expect(defaultCountsAsSpending('dividend', feesOn)).toBe(false);
  });

  it('defaults fees to on', () => {
    expect(DEFAULT_SPENDING_POLICY.countFeesAsSpending).toBe(true);
  });

  it('returns a boolean for every kind — no kind left unhandled', () => {
    for (const kind of TRANSACTION_KINDS) {
      expect(typeof defaultCountsAsSpending(kind, feesOn)).toBe('boolean');
    }
  });
});
