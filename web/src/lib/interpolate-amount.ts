import Decimal from 'decimal.js';

/**
 * Pure helper interpolating between two decimal money strings without losing precision.
 */
export function interpolateAmount(from: string, to: string, progress: number): string {
  const p = Math.min(Math.max(progress, 0), 1);
  if (p === 0) return from;
  if (p === 1) return to;

  const dFrom = new Decimal(from || '0');
  const dTo = new Decimal(to || '0');
  return dTo.minus(dFrom).times(p).plus(dFrom).toFixed(2);
}
