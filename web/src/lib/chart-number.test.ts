import { describe, expect, it } from 'vitest';
import { formatCompactMoney, toChartNumber } from './chart-number';

describe('toChartNumber', () => {
  it('converts decimal strings to numbers for chart geometry', () => {
    expect(toChartNumber('8450.50')).toBe(8450.5);
    expect(toChartNumber('0.00')).toBe(0);
    expect(toChartNumber('123.45')).toBe(123.45);
  });

  it('handles empty and whitespace strings gracefully', () => {
    expect(toChartNumber('')).toBe(0);
    expect(toChartNumber('   ')).toBe(0);
  });

  it('handles huge values without crashing', () => {
    expect(toChartNumber('999999999999999.99')).toBe(999999999999999.99);
  });
});

describe('formatCompactMoney', () => {
  it('formats zero and small amounts without suffix', () => {
    expect(formatCompactMoney('0', 'EGP')).toBe(`EGP${String.fromCharCode(0xa0)}0`);
    expect(formatCompactMoney('0.00', 'USD')).toBe(`USD${String.fromCharCode(0xa0)}0`);
    expect(formatCompactMoney('450', 'EGP')).toBe(`EGP${String.fromCharCode(0xa0)}450`);
    expect(formatCompactMoney('999.99', 'USD')).toBe(`USD${String.fromCharCode(0xa0)}1000`);
  });

  it('formats thousands with K suffix', () => {
    expect(formatCompactMoney('8500', 'EGP')).toBe(`EGP${String.fromCharCode(0xa0)}8.5K`);
    expect(formatCompactMoney('8000', 'USD')).toBe(`USD${String.fromCharCode(0xa0)}8K`);
    expect(formatCompactMoney('12345.67', 'EGP')).toBe(`EGP${String.fromCharCode(0xa0)}12.3K`);
  });

  it('formats millions with M suffix', () => {
    expect(formatCompactMoney('1200000', 'EGP')).toBe(`EGP${String.fromCharCode(0xa0)}1.2M`);
    expect(formatCompactMoney('10000000', 'USD')).toBe(`USD${String.fromCharCode(0xa0)}10M`);
  });

  it('formats billions with B suffix', () => {
    expect(formatCompactMoney('2500000000', 'EGP')).toBe(`EGP${String.fromCharCode(0xa0)}2.5B`);
    expect(formatCompactMoney('50000000000', 'USD')).toBe(`USD${String.fromCharCode(0xa0)}50B`);
  });

  it('formats negative amounts with a minus sign', () => {
    const minus = String.fromCharCode(0x2212);
    expect(formatCompactMoney('-1500', 'EGP')).toBe(`${minus}EGP${String.fromCharCode(0xa0)}1.5K`);
  });
});
