import { describe, expect, it } from 'vitest';
import { withPendingDigits } from './card-digits';

describe('withPendingDigits', () => {
  it('includes 4 complete digits the user typed but did not add', () => {
    expect(withPendingDigits(['1111'], ' 2222 ')).toEqual({ ok: true, digits: ['1111', '2222'] });
  });

  it('keeps the list as is when the input is empty or already listed', () => {
    expect(withPendingDigits(['1111'], '')).toEqual({ ok: true, digits: ['1111'] });
    expect(withPendingDigits(['1111'], '1111')).toEqual({ ok: true, digits: ['1111'] });
  });

  it('blocks a half-typed entry instead of dropping it', () => {
    expect(withPendingDigits([], '22').ok).toBe(false);
    expect(withPendingDigits([], 'abcd').ok).toBe(false);
  });

  it('blocks going over the maximum', () => {
    // Only the repo's allowed fake digits, so the limit is lowered for the test.
    expect(withPendingDigits(['1111', '2222'], '3333', 2).ok).toBe(false);
    expect(withPendingDigits(['1111'], '3333', 2)).toEqual({ ok: true, digits: ['1111', '3333'] });
  });
});
