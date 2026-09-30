import { describe, expect, it } from 'vitest';
import { normalizeAmount, parseAmount } from './money';

describe('money amount parsing and validation', () => {
  describe('valid amounts', () => {
    it('accepts integer amounts like "150"', () => {
      const res = parseAmount('150');
      expect(res).toEqual({ ok: true, value: '150' });
    });

    it('strips thousands commas like "1,500.50"', () => {
      const res = parseAmount('1,500.50');
      expect(res).toEqual({ ok: true, value: '1500.50' });
    });

    it('accepts decimal amounts less than 1 like "0.5"', () => {
      const res = parseAmount('0.5');
      expect(res).toEqual({ ok: true, value: '0.5' });
    });

    it('preserves amounts beyond Number.MAX_SAFE_INTEGER exactly ("9007199254740993.01")', () => {
      const res = parseAmount('9007199254740993.01');
      expect(res).toEqual({ ok: true, value: '9007199254740993.01' });
    });

    it('trims leading and trailing whitespace', () => {
      const res = parseAmount('  250.75  ');
      expect(res).toEqual({ ok: true, value: '250.75' });
    });

    it('works identically via normalizeAmount', () => {
      const res = normalizeAmount('1,500.50');
      expect(res).toEqual({ ok: true, value: '1500.50' });
    });
  });

  describe('invalid amounts', () => {
    it('rejects empty string ""', () => {
      const res = parseAmount('');
      expect(res.ok).toBe(false);
    });

    it('rejects zero "0"', () => {
      const res = parseAmount('0');
      expect(res.ok).toBe(false);
    });

    it('rejects zero with decimals "0.00"', () => {
      const res = parseAmount('0.00');
      expect(res.ok).toBe(false);
    });

    it('rejects negative amounts "-5"', () => {
      const res = parseAmount('-5');
      expect(res.ok).toBe(false);
    });

    it('rejects more than 2 decimal digits "1.234"', () => {
      const res = parseAmount('1.234');
      expect(res.ok).toBe(false);
    });

    it('rejects non-numeric strings "abc"', () => {
      const res = parseAmount('abc');
      expect(res.ok).toBe(false);
    });

    it('rejects leading zeroes on integer numbers "01"', () => {
      const res = parseAmount('01');
      expect(res.ok).toBe(false);
    });

    it('rejects scientific notation "1e3"', () => {
      const res = parseAmount('1e3');
      expect(res.ok).toBe(false);
    });

    it('rejects more than 16 integer digits (17 integer digits: "10000000000000000")', () => {
      const res = parseAmount('10000000000000000');
      expect(res.ok).toBe(false);
    });

    it('rejects commas after decimal point "100.5,0"', () => {
      const res = parseAmount('100.5,0');
      expect(res.ok).toBe(false);
    });

    it('rejects trailing comma "100,"', () => {
      const res = parseAmount('100,');
      expect(res.ok).toBe(false);
    });

    it('rejects a comma used as a decimal separator instead of turning "15,00" into 1500', () => {
      expect(parseAmount('15,00').ok).toBe(false);
      expect(parseAmount('1,5').ok).toBe(false);
      expect(parseAmount('1,50,000').ok).toBe(false);
      expect(parseAmount('1,500,000.25')).toEqual({ ok: true, value: '1500000.25' });
    });
  });
});
