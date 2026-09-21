import { describe, expect, it } from 'vitest';
import { Subscription, type BillingCycle } from '../../src/domain/subscription.js';
import { Money } from '../../src/domain/money.js';
import { calendarDate } from '../../src/domain/calendar-date.js';
import { DomainError } from '../../src/domain/errors.js';
import { newMerchantKey, newUserId } from '../../src/domain/ids.js';

const d = calendarDate;

function sub(cycle: BillingCycle, anchor: string, amount = '100.00', currency: 'EGP' | 'USD' = 'EGP') {
  return Subscription.create({
    id: 'sub_1',
    userId: newUserId('usr_1'),
    name: 'Netflix',
    merchantKey: newMerchantKey('NETFLIX'),
    amount: Money.create(amount, currency),
    cycle,
    anchorDate: d(anchor),
    categoryId: null,
    accountId: null,
    notes: null,
  });
}

describe('Subscription — billing dates', () => {
  it('bills monthly on the anchor day', () => {
    const s = sub('monthly', '2026-01-05');
    expect([0, 1, 2].map((n) => s.billingDate(n))).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
  });

  it('clamps the 31st to short months, then RETURNS to the 31st', () => {
    const s = sub('monthly', '2026-01-31');
    expect([0, 1, 2, 3].map((n) => s.billingDate(n))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31', // not the 28th — measured from the anchor, not the previous date
      '2026-04-30',
    ]);
  });

  it('bills on 29 February in a leap year and 28 February otherwise', () => {
    const s = sub('yearly', '2028-02-29');
    expect(s.billingDate(1)).toBe('2029-02-28');
    expect(s.billingDate(4)).toBe('2032-02-29');
  });

  it('bills weekly every 7 days', () => {
    const s = sub('weekly', '2026-09-01');
    expect(s.billingDate(2)).toBe('2026-09-15');
  });

  it('bills quarterly every 3 months', () => {
    expect(sub('quarterly', '2026-01-15').billingDate(2)).toBe('2026-07-15');
  });

  it('finds the next billing date on or after a given day', () => {
    const s = sub('monthly', '2026-01-05');
    expect(s.nextBillingOnOrAfter(d('2026-09-05'))).toBe('2026-09-05'); // same day counts
    expect(s.nextBillingOnOrAfter(d('2026-09-06'))).toBe('2026-10-05');
    expect(s.nextBillingOnOrAfter(d('2025-06-01'))).toBe('2026-01-05'); // before it started
  });

  it('finds the next date for a month-end anchor after many months', () => {
    expect(sub('monthly', '2026-01-31').nextBillingOnOrAfter(d('2026-11-01'))).toBe('2026-11-30');
  });

  it('lists every charge in a window, including several weekly ones', () => {
    expect(sub('weekly', '2026-09-01').chargesBetween(d('2026-09-01'), d('2026-09-30')))
      .toEqual(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']);
  });

  it('has no upcoming charges when paused or cancelled', () => {
    const paused = sub('monthly', '2026-01-05');
    paused.pause();
    expect(paused.chargesBetween(d('2026-09-01'), d('2026-12-31'))).toEqual([]);
  });
});

describe('Subscription — cost', () => {
  it('reports a monthly subscription at its own price', () => {
    expect(sub('monthly', '2026-01-01', '240.00').monthlyEquivalent().toString()).toBe('240.00 EGP');
  });

  it('spreads a yearly subscription across 12 months', () => {
    expect(sub('yearly', '2026-01-01', '1200.00').monthlyEquivalent().toString()).toBe('100.00 EGP');
  });

  it('uses 52 weeks, not 4 — a weekly charge costs 4.33 weeks a month', () => {
    // 100 * 52 / 12 = 433.333… Multiplying by 4 would under-report by 33.
    expect(sub('weekly', '2026-01-01', '100.00').monthlyEquivalent().toString()).toBe('433.33 EGP');
  });

  it('computes the yearly cost exactly, without compounding monthly rounding', () => {
    // Monthly equivalent is 433.33; x12 would be 5199.96. The truth is 5200.
    expect(sub('weekly', '2026-01-01', '100.00').yearlyCost().toString()).toBe('5200.00 EGP');
  });

  it('keeps the currency — a Claude subscription billed in USD stays USD', () => {
    expect(sub('monthly', '2026-01-01', '20.00', 'USD').monthlyEquivalent().getCurrency()).toBe('USD');
  });
});

describe('Subscription — lifecycle', () => {
  it('pauses and resumes', () => {
    const s = sub('monthly', '2026-01-05');
    s.pause();
    expect(s.status).toBe('paused');
    s.resume();
    expect(s.isActive()).toBe(true);
  });

  it('cancels for good and records when', () => {
    const s = sub('monthly', '2026-01-05');
    const at = new Date('2026-09-21T10:00:00Z');
    s.cancel(at);
    expect(s.status).toBe('cancelled');
    expect(s.cancelledAt).toEqual(at);
    expect(() => s.resume()).toThrow(DomainError);
    expect(() => s.cancel(at)).toThrow(DomainError);
  });

  it('refuses invalid transitions', () => {
    const s = sub('monthly', '2026-01-05');
    expect(() => s.resume()).toThrow(DomainError); // not paused
  });

  it('refuses a zero amount or an empty name', () => {
    expect(() => sub('monthly', '2026-01-05', '0')).toThrow(DomainError);
    expect(() =>
      Subscription.create({
        id: 'x', userId: newUserId('u'), name: '  ', merchantKey: newMerchantKey('X'),
        amount: Money.create('5', 'EGP'), cycle: 'monthly', anchorDate: d('2026-01-01'),
        categoryId: null, accountId: null, notes: null,
      }),
    ).toThrow(DomainError);
  });
});
