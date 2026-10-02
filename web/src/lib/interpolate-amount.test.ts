import { describe, expect, it } from 'vitest';
import { interpolateAmount } from './interpolate-amount';

describe('interpolateAmount', () => {
  it('returns from exactly when progress is 0', () => {
    expect(interpolateAmount('0', '8450.00', 0)).toBe('0');
    expect(interpolateAmount('123.45', '678.90', 0)).toBe('123.45');
  });

  it('returns to exactly when progress is 1', () => {
    expect(interpolateAmount('0', '8450.00', 1)).toBe('8450.00');
    expect(interpolateAmount('123.45', '678.90', 1)).toBe('678.90');
  });

  it('calculates the 0.5 midpoint correctly ("0" -> "8450.00" gives "4225.00")', () => {
    expect(interpolateAmount('0', '8450.00', 0.5)).toBe('4225.00');
  });

  it('handles decreasing values', () => {
    expect(interpolateAmount('100.00', '50.00', 0.5)).toBe('75.00');
    expect(interpolateAmount('8450.00', '0.00', 0.5)).toBe('4225.00');
    expect(interpolateAmount('200.00', '100.00', 0.25)).toBe('175.00');
  });

  it('preserves full precision for huge values ("9007199254740993.01")', () => {
    const huge = '9007199254740993.01';
    expect(interpolateAmount('0', huge, 1)).toBe(huge);
    expect(interpolateAmount(huge, '0', 0)).toBe(huge);
    // Number.MAX_SAFE_INTEGER is 9007199254740991; standard JS Number loses cents here.
    expect(interpolateAmount('0', huge, 0.5)).toBe('4503599627370496.51');
  });

  it('clamps progress to [0, 1]', () => {
    expect(interpolateAmount('0', '8450.00', -0.5)).toBe('0');
    expect(interpolateAmount('0', '8450.00', 1.5)).toBe('8450.00');
    expect(interpolateAmount('100.00', '200.00', -2)).toBe('100.00');
    expect(interpolateAmount('100.00', '200.00', 3)).toBe('200.00');
  });
});
