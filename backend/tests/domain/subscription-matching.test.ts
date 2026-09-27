import { describe, expect, it } from 'vitest';
import { calendarDate } from '../../src/domain/calendar-date.js';
import { newAccountId, newMerchantKey, newUserId } from '../../src/domain/ids.js';
import { Money } from '../../src/domain/money.js';
import { Subscription } from '../../src/domain/subscription.js';
import {
  matchCharge,
  merchantMatches,
  missedCharge,
  type ChargeToMatch,
} from '../../src/domain/subscription-matching.js';

// FAKE merchants and amounts only.
const CARD = 'a0000000-0000-0000-0000-000000001111';

function sub(
  id: string,
  merchant: string,
  amount: Money,
  options: { anchor?: string; accountId?: string; cycle?: 'monthly' | 'weekly' | 'yearly' } = {},
): Subscription {
  return Subscription.create({
    id,
    userId: newUserId('u1'),
    name: merchant,
    merchantKey: newMerchantKey(merchant),
    amount,
    cycle: options.cycle ?? 'monthly',
    anchorDate: calendarDate(options.anchor ?? '2026-01-15'),
    categoryId: null,
    accountId: options.accountId === undefined ? null : newAccountId(options.accountId),
    notes: null,
  });
}

function charge(overrides: Partial<ChargeToMatch> = {}): ChargeToMatch {
  return {
    id: 't1',
    accountId: CARD,
    merchantKey: 'TEST STREAM COM',
    kind: 'expense',
    direction: 'debit',
    date: calendarDate('2026-09-15'),
    amount: Money.create('149.99', 'EGP'),
    original: null,
    ...overrides,
  };
}

const egp = (v: string) => Money.create(v, 'EGP');
const usd = (v: string) => Money.create(v, 'USD');

describe('merchantMatches', () => {
  it.each([
    ['TEST STREAM', 'TEST STREAM', true],
    ['NETFLIX', 'NETFLIX COM', true],
    ['TEST SOFTWARE PLAN', 'TEST SOFTWARE PL', true], // the bank cut the name short
    ['UBER', 'UBEREATS', false], // a word must end where the key ends
    ['NETFLIX', 'NET', false], // too short to be a cut name
    ['NETFLIX', 'SPOTIFY', false],
  ])('%s vs %s -> %s', (subscriptionKey, chargeKey, expected) => {
    expect(merchantMatches(subscriptionKey, chargeKey)).toBe(expected);
  });
});

describe('matchCharge', () => {
  const stream = sub('s1', 'TEST STREAM', egp('149.99'));

  it('links a charge at the price on a billing date', () => {
    expect(matchCharge([stream], charge())).toEqual({ subscriptionId: 's1', priceChanged: false });
  });

  it('allows 3 days either side of the billing date, not 4', () => {
    expect(matchCharge([stream], charge({ date: calendarDate('2026-09-18') }))).not.toBeNull();
    expect(matchCharge([stream], charge({ date: calendarDate('2026-09-12') }))).not.toBeNull();
    expect(matchCharge([stream], charge({ date: calendarDate('2026-09-19') }))).toBeNull();
    expect(matchCharge([stream], charge({ date: calendarDate('2026-09-11') }))).toBeNull();
  });

  it('matches a USD subscription through the dollars an EGP charge carries', () => {
    const claude = sub('s2', 'TEST AI', usd('21.60'));
    const billed = charge({ merchantKey: 'TEST AI', amount: egp('1036.44'), original: usd('21.60') });
    expect(matchCharge([claude], billed)).toEqual({ subscriptionId: 's2', priceChanged: false });
    // No dollars on the charge: nothing to compare, no link.
    expect(matchCharge([claude], charge({ merchantKey: 'TEST AI', amount: egp('1036.44') }))).toBeNull();
  });

  it('only matches on the account the subscription names', () => {
    const onCard = sub('s3', 'TEST STREAM', egp('149.99'), { accountId: CARD });
    expect(matchCharge([onCard], charge())).not.toBeNull();
    expect(matchCharge([onCard], charge({ accountId: 'a0000000-0000-0000-0000-000000002222' }))).toBeNull();
  });

  it('never matches a paused or cancelled subscription', () => {
    const paused = sub('s4', 'TEST STREAM', egp('149.99'));
    paused.pause();
    const cancelled = sub('s5', 'TEST STREAM', egp('149.99'));
    cancelled.cancel(new Date('2026-09-01T00:00:00Z'));
    expect(matchCharge([paused, cancelled], charge())).toBeNull();
  });

  it('links a charge at another price when it is the only candidate, as a price change', () => {
    expect(matchCharge([stream], charge({ amount: egp('169.99') }))).toEqual({ subscriptionId: 's1', priceChanged: true });
  });

  it('prefers the subscription whose price the charge equals', () => {
    const other = sub('s6', 'TEST STREAM', egp('99.99'));
    expect(matchCharge([other, stream], charge())).toEqual({ subscriptionId: 's1', priceChanged: false });
  });

  it('refuses to guess between two equally good subscriptions', () => {
    const twin = sub('s7', 'TEST STREAM', egp('149.99'));
    expect(matchCharge([stream, twin], charge())).toBeNull();
    // Neither at the price: still two candidates.
    expect(matchCharge([sub('a', 'TEST STREAM', egp('1.00')), sub('b', 'TEST STREAM', egp('2.00'))], charge())).toBeNull();
  });

  it('never matches money coming in or a transfer', () => {
    expect(matchCharge([stream], charge({ direction: 'credit' }))).toBeNull();
    expect(matchCharge([stream], charge({ kind: 'transfer' }))).toBeNull();
  });
});

describe('missedCharge', () => {
  const stream = sub('s1', 'TEST STREAM', egp('149.99'));
  const d = calendarDate;

  it('is null before the first charge we saw: those months were before tracking began', () => {
    expect(missedCharge(stream, [], d('2026-09-27'))).toBeNull();
  });

  it('names the latest billing date that went by with no charge near it', () => {
    // Charged 15 Jul and 16 Aug; 15 Sep passed with nothing.
    expect(missedCharge(stream, [d('2026-07-15'), d('2026-08-16')], d('2026-09-27'))).toBe('2026-09-15');
  });

  it('waits out the 3-day window before calling a date missed', () => {
    expect(missedCharge(stream, [d('2026-08-15')], d('2026-09-17'))).toBeNull();
    expect(missedCharge(stream, [d('2026-08-15')], d('2026-09-18'))).toBe('2026-09-15');
  });

  it('is null when every billing date since the first charge was paid', () => {
    expect(missedCharge(stream, [d('2026-07-15'), d('2026-08-14'), d('2026-09-17')], d('2026-09-27'))).toBeNull();
  });

  it('is null for a subscription that is not active', () => {
    const paused = sub('s2', 'TEST STREAM', egp('149.99'));
    paused.pause();
    expect(missedCharge(paused, [d('2026-07-15')], d('2026-09-27'))).toBeNull();
  });
});
