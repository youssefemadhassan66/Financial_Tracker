import { describe, expect, it } from 'vitest';
import { normalizeMerchantKey } from '../../src/domain/merchant-key.js';
import { Money } from '../../src/domain/money.js';
import { DomainError } from '../../src/domain/errors.js';

const TATWEEL = String.fromCharCode(0x0640);
const FATHA = String.fromCharCode(0x064e);

describe('normalizeMerchantKey', () => {
  it('gives the same key to different spellings of one shop', () => {
    const a = normalizeMerchantKey('CARREFOUR MAADI #1234');
    const b = normalizeMerchantKey('Carrefour-Maadi');
    const c = normalizeMerchantKey('carrefour   maadi 0098');
    expect(a).toBe('CARREFOUR MAADI');
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('keeps short numbers that are part of the name', () => {
    expect(normalizeMerchantKey('7 Eleven')).toBe('7 ELEVEN');
  });

  it('drops Arabic-Indic reference numbers too', () => {
    expect(normalizeMerchantKey('كارفور ٤٤٧١')).toBe('كارفور');
  });

  it('folds Arabic spelling variants to one form', () => {
    // Alef-with-hamza vs bare alef, taa marbuta vs haa.
    expect(normalizeMerchantKey('أسواق المدينة')).toBe(normalizeMerchantKey('اسواق المدينه'));
  });

  it('ignores Arabic diacritics and tatweel', () => {
    expect(normalizeMerchantKey(`كار${FATHA}فو${TATWEEL}ر`)).toBe('كارفور');
  });

  it('refuses input with nothing usable in it', () => {
    expect(() => normalizeMerchantKey('#### 1234')).toThrow(DomainError);
  });
});

describe('Money.scale', () => {
  it('rounds half-up to 2 places', () => {
    expect(Money.create('20.00', 'USD').scale(1, 12).toDecimalString()).toBe('1.67');
    expect(Money.create('0.05', 'EGP').scale(1, 2).toDecimalString()).toBe('0.03');
  });

  it('multiplies before dividing so rounding happens once', () => {
    expect(Money.create('100.00', 'EGP').scale(52, 12).toDecimalString()).toBe('433.33');
  });

  it('refuses fractional or negative ratios', () => {
    expect(() => Money.create('1', 'EGP').scale(1.5, 1)).toThrow(DomainError);
    expect(() => Money.create('1', 'EGP').scale(1, 0)).toThrow(DomainError);
    expect(() => Money.create('1', 'EGP').scale(-1, 1)).toThrow(DomainError);
  });
});
