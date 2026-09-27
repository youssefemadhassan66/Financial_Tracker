import { describe, expect, it } from 'vitest';
import { calendarDate } from '../../src/domain/calendar-date.js';
import { newMerchantKey, newUserId } from '../../src/domain/ids.js';
import { Money } from '../../src/domain/money.js';
import { Subscription } from '../../src/domain/subscription.js';
import {
  suggestSubscriptions,
  type SuggestionCharge,
} from '../../src/domain/subscription-suggestions.js';

// FAKE merchants, accounts, and amounts only.
const CARD_1 = 'a0000000-0000-0000-0000-000000001111';
const CARD_2 = 'a0000000-0000-0000-0000-000000002222';

function charge(
  id: string,
  date: string,
  amount: string = '500.00',
  options: {
    merchantKey?: string;
    merchantRaw?: string;
    accountId?: string;
    currency?: 'EGP' | 'USD';
    original?: { amount: string; currency: 'EGP' | 'USD' } | null;
  } = {},
): SuggestionCharge {
  return {
    id,
    accountId: options.accountId ?? CARD_1,
    merchantKey: options.merchantKey ?? 'TEST GYM',
    merchantRaw: options.merchantRaw ?? 'Test Gym',
    date: calendarDate(date),
    amount: Money.create(amount, options.currency ?? 'EGP'),
    original: options.original ? Money.create(options.original.amount, options.original.currency) : null,
  };
}

function existingSub(
  merchantKey: string,
  status: 'active' | 'paused' | 'cancelled' = 'active',
): Subscription {
  const s = Subscription.create({
    id: `sub-${merchantKey}`,
    userId: newUserId('11111111-1111-1111-1111-111111111111'),
    name: merchantKey,
    merchantKey: newMerchantKey(merchantKey),
    amount: Money.create('500.00', 'EGP'),
    cycle: 'monthly',
    anchorDate: calendarDate('2026-01-01'),
    categoryId: null,
    accountId: null,
    notes: null,
  });
  if (status === 'paused') s.pause();
  if (status === 'cancelled') s.cancel(new Date('2026-05-01T00:00:00Z'));
  return s;
}

describe('suggestSubscriptions', () => {
  it('suggests a monthly subscription with 3 charges and anchorDate = first charge', () => {
    const charges = [
      charge('c1', '2026-06-20'),
      charge('c2', '2026-07-20'),
      charge('c3', '2026-08-20'),
    ];
    const today = calendarDate('2026-09-01');
    const suggestions = suggestSubscriptions(charges, [], new Set(), today);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      merchantKey: 'TEST GYM',
      name: 'Test Gym',
      cycle: 'monthly',
      anchorDate: '2026-06-20',
      lastChargeDate: '2026-08-20',
      chargeCount: 3,
      accountId: CARD_1,
      transactionIds: ['c1', 'c2', 'c3'],
    });
    expect(suggestions[0]?.amount.toString()).toBe('500.00 EGP');
  });

  it('suggests nothing for 2 monthly charges (minimum is 3)', () => {
    const charges = [
      charge('c1', '2026-07-20'),
      charge('c2', '2026-08-20'),
    ];
    const today = calendarDate('2026-09-01');
    expect(suggestSubscriptions(charges, [], new Set(), today)).toEqual([]);
  });

  it('requires at least 4 charges for a weekly cycle', () => {
    const threeCharges = [
      charge('c1', '2026-08-01'),
      charge('c2', '2026-08-08'),
      charge('c3', '2026-08-15'),
    ];
    const today = calendarDate('2026-08-25');
    expect(suggestSubscriptions(threeCharges, [], new Set(), today)).toEqual([]);

    const fourCharges = [...threeCharges, charge('c4', '2026-08-22')];
    const suggestions = suggestSubscriptions(fourCharges, [], new Set(), today);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      cycle: 'weekly',
      chargeCount: 4,
      anchorDate: '2026-08-01',
      lastChargeDate: '2026-08-22',
    });
  });

  it('suggests a yearly cycle with at least 2 charges', () => {
    const charges = [
      charge('c1', '2025-08-20'),
      charge('c2', '2026-08-20'),
    ];
    const today = calendarDate('2026-09-01');
    const suggestions = suggestSubscriptions(charges, [], new Set(), today);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      cycle: 'yearly',
      chargeCount: 2,
      anchorDate: '2025-08-20',
      lastChargeDate: '2026-08-20',
    });
  });

  it('suggests a quarterly cycle with at least 3 charges', () => {
    const charges = [
      charge('c1', '2026-02-15'),
      charge('c2', '2026-05-17'),
      charge('c3', '2026-08-17'),
    ];
    const today = calendarDate('2026-09-01');
    const suggestions = suggestSubscriptions(charges, [], new Set(), today);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      cycle: 'quarterly',
      chargeCount: 3,
      anchorDate: '2026-02-15',
      lastChargeDate: '2026-08-17',
    });
  });

  it('suggests nothing when gap is out of every range', () => {
    // 15 days is between weekly (5..9) and monthly (25..35)
    const charges = [
      charge('c1', '2026-08-01'),
      charge('c2', '2026-08-16'),
      charge('c3', '2026-08-31'),
    ];
    const today = calendarDate('2026-09-05');
    expect(suggestSubscriptions(charges, [], new Set(), today)).toEqual([]);
  });

  it('stops the streak at an older gap that does not fit the cycle', () => {
    // 1 Mar -> 20 Jun is 111 days: not monthly, so the streak starts in June.
    const charges = [
      charge('c0', '2026-03-01'),
      charge('c1', '2026-06-20'),
      charge('c2', '2026-07-20'),
      charge('c3', '2026-08-20'),
    ];
    const [suggestion] = suggestSubscriptions(charges, [], new Set(), calendarDate('2026-09-01'));
    expect(suggestion).toMatchObject({ chargeCount: 3, anchorDate: '2026-06-20', transactionIds: ['c1', 'c2', 'c3'] });
  });

  it('hides a merchant an existing subscription covers under a longer or cut name', () => {
    const charges = [
      charge('c1', '2026-06-20', '500.00', { merchantKey: 'TEST GYM COM' }),
      charge('c2', '2026-07-20', '500.00', { merchantKey: 'TEST GYM COM' }),
      charge('c3', '2026-08-20', '500.00', { merchantKey: 'TEST GYM COM' }),
    ];
    expect(suggestSubscriptions(charges, [existingSub('TEST GYM')], new Set(), calendarDate('2026-09-01'))).toEqual([]);
  });

  it('stops the streak at a price jump over 10% and keeps exactly 10%', () => {
    // Latest is 100.00. 110.00 (+10%) and 90.00 (-10%) are kept; 115.00 (+15%) stops the streak.
    const charges = [
      charge('c0', '2026-05-20', '115.00'),
      charge('c1', '2026-06-20', '90.00'),
      charge('c2', '2026-07-20', '110.00'),
      charge('c3', '2026-08-20', '100.00'),
    ];
    const today = calendarDate('2026-09-01');
    const suggestions = suggestSubscriptions(charges, [], new Set(), today);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      chargeCount: 3,
      anchorDate: '2026-06-20',
      lastChargeDate: '2026-08-20',
      transactionIds: ['c1', 'c2', 'c3'],
    });
    expect(suggestions[0]?.amount.toString()).toBe('100.00 EGP');

    // If an older jump leaves fewer than the minimum count, no suggestion
    const tooFew = [
      charge('c1', '2026-06-20', '150.00'),
      charge('c2', '2026-07-20', '100.00'),
      charge('c3', '2026-08-20', '100.00'),
    ];
    expect(suggestSubscriptions(tooFew, [], new Set(), today)).toEqual([]);
  });

  it('uses USD original as the price while EGP amounts differ', () => {
    // The EGP amounts swing by more than 10%: only the dollars are steady.
    const charges = [
      charge('c1', '2026-06-20', '800.00', { original: { amount: '20.00', currency: 'USD' } }),
      charge('c2', '2026-07-20', '1000.00', { original: { amount: '20.00', currency: 'USD' } }),
      charge('c3', '2026-08-20', '1200.00', { original: { amount: '20.00', currency: 'USD' } }),
    ];
    const today = calendarDate('2026-09-01');
    const suggestions = suggestSubscriptions(charges, [], new Set(), today);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      cycle: 'monthly',
      chargeCount: 3,
      anchorDate: '2026-06-20',
      lastChargeDate: '2026-08-20',
    });
    expect(suggestions[0]?.amount.toString()).toBe('20.00 USD');
  });

  it('stops suggesting when last charge is too old, and suggests when exactly at the limit', () => {
    // For monthly: max gap 35 + CHARGE_WINDOW_DAYS 3 = 38 days.
    const charges = [
      charge('c1', '2026-06-20'),
      charge('c2', '2026-07-20'),
      charge('c3', '2026-08-20'),
    ];

    // Exactly 38 days after 2026-08-20: 2026-09-27.
    const atLimit = calendarDate('2026-09-27');
    expect(suggestSubscriptions(charges, [], new Set(), atLimit)).toHaveLength(1);

    // 39 days after: stopped.
    const pastLimit = calendarDate('2026-09-28');
    expect(suggestSubscriptions(charges, [], new Set(), pastLimit)).toEqual([]);
  });

  it('hides suggestion when an existing subscription of any status matches', () => {
    const charges = [
      charge('c1', '2026-06-20', '500.00', { merchantKey: 'TEST GYM' }),
      charge('c2', '2026-07-20', '500.00', { merchantKey: 'TEST GYM' }),
      charge('c3', '2026-08-20', '500.00', { merchantKey: 'TEST GYM' }),
    ];
    const today = calendarDate('2026-09-01');

    // Active
    expect(suggestSubscriptions(charges, [existingSub('TEST GYM', 'active')], new Set(), today)).toEqual([]);
    // Paused
    expect(suggestSubscriptions(charges, [existingSub('TEST GYM', 'paused')], new Set(), today)).toEqual([]);
    // Cancelled
    expect(suggestSubscriptions(charges, [existingSub('TEST GYM', 'cancelled')], new Set(), today)).toEqual([]);
  });

  it('hides suggestion when merchantKey was dismissed', () => {
    const charges = [
      charge('c1', '2026-06-20'),
      charge('c2', '2026-07-20'),
      charge('c3', '2026-08-20'),
    ];
    const today = calendarDate('2026-09-01');
    const dismissed = new Set(['TEST GYM']);

    expect(suggestSubscriptions(charges, [], dismissed, today)).toEqual([]);
  });

  it('keeps separate groups for the same merchant in different price currencies', () => {
    const charges = [
      charge('c1', '2026-06-20', '500.00', { merchantKey: 'TEST AI', currency: 'EGP' }),
      charge('c2', '2026-07-20', '500.00', { merchantKey: 'TEST AI', currency: 'EGP' }),
      charge('c3', '2026-08-20', '500.00', { merchantKey: 'TEST AI', currency: 'EGP' }),
      charge('u1', '2026-06-20', '20.00', { merchantKey: 'TEST AI', currency: 'USD' }),
      charge('u2', '2026-07-20', '20.00', { merchantKey: 'TEST AI', currency: 'USD' }),
      charge('u3', '2026-08-20', '20.00', { merchantKey: 'TEST AI', currency: 'USD' }),
    ];
    const today = calendarDate('2026-09-01');
    const suggestions = suggestSubscriptions(charges, [], new Set(), today);

    expect(suggestions).toHaveLength(2);
    const currencies = suggestions.map((s) => s.amount.getCurrency()).sort();
    expect(currencies).toEqual(['EGP', 'USD']);
  });

  it('sets accountId to null when streak spans multiple accounts', () => {
    const charges = [
      charge('c1', '2026-06-20', '500.00', { accountId: CARD_1 }),
      charge('c2', '2026-07-20', '500.00', { accountId: CARD_2 }),
      charge('c3', '2026-08-20', '500.00', { accountId: CARD_1 }),
    ];
    const today = calendarDate('2026-09-01');
    const [suggestion] = suggestSubscriptions(charges, [], new Set(), today);

    expect(suggestion?.accountId).toBeNull();
  });

  it('trims name and cuts it to 60 characters', () => {
    const longName = '   ' + 'A'.repeat(80) + '   ';
    const charges = [
      charge('c1', '2026-06-20', '500.00', { merchantRaw: longName }),
      charge('c2', '2026-07-20', '500.00', { merchantRaw: longName }),
      charge('c3', '2026-08-20', '500.00', { merchantRaw: longName }),
    ];
    const today = calendarDate('2026-09-01');
    const [suggestion] = suggestSubscriptions(charges, [], new Set(), today);

    expect(suggestion?.name).toBe('A'.repeat(60));
    expect(suggestion?.name).toHaveLength(60);
  });

  it('orders suggestions by lastChargeDate descending, then merchantKey ascending', () => {
    const charges = [
      // Gym A: last charge 2026-08-20
      charge('a1', '2026-06-20', '500.00', { merchantKey: 'TEST GYM A' }),
      charge('a2', '2026-07-20', '500.00', { merchantKey: 'TEST GYM A' }),
      charge('a3', '2026-08-20', '500.00', { merchantKey: 'TEST GYM A' }),
      // Stream Z: last charge 2026-08-25
      charge('z1', '2026-06-25', '100.00', { merchantKey: 'TEST STREAM Z' }),
      charge('z2', '2026-07-25', '100.00', { merchantKey: 'TEST STREAM Z' }),
      charge('z3', '2026-08-25', '100.00', { merchantKey: 'TEST STREAM Z' }),
      // Stream B: last charge 2026-08-25
      charge('b1', '2026-06-25', '100.00', { merchantKey: 'TEST STREAM B' }),
      charge('b2', '2026-07-25', '100.00', { merchantKey: 'TEST STREAM B' }),
      charge('b3', '2026-08-25', '100.00', { merchantKey: 'TEST STREAM B' }),
    ];
    const today = calendarDate('2026-09-01');
    const suggestions = suggestSubscriptions(charges, [], new Set(), today);

    expect(suggestions.map((s) => s.merchantKey)).toEqual([
      'TEST STREAM B',
      'TEST STREAM Z',
      'TEST GYM A',
    ]);
  });
});
