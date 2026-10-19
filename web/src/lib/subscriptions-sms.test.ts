import { describe, expect, it, vi } from 'vitest';
import type { RawMessageView, ReprocessResult, SubscriptionDto } from './api/types';
import { countByFilter, matchesFilter, reprocessAll } from './sms';
import { daysUntil, dueSoonLabel, groupSubscriptions, perCycle } from './subscriptions';

const sub = (over: Partial<SubscriptionDto>): SubscriptionDto => ({
  id: over.name ?? 'x',
  name: 'TEST',
  amount: '10.00',
  currency: 'EGP',
  cycle: 'monthly',
  anchorDate: '2026-08-10',
  status: 'active',
  nextChargeDate: '2026-10-10',
  monthlyEquivalent: '10.00',
  yearlyCost: '120.00',
  categoryId: null,
  accountId: null,
  notes: null,
  lastCharge: null,
  priceChanged: false,
  missedCharge: null,
  ...over,
});

describe('subscriptions helpers', () => {
  it('groups by status, active ones soonest first', () => {
    const g = groupSubscriptions([
      sub({ name: 'Test Gym', nextChargeDate: '2026-11-12' }),
      sub({ name: 'Test Stream', nextChargeDate: '2026-11-05' }),
      sub({ name: 'Test Old', status: 'cancelled', nextChargeDate: null }),
      sub({ name: 'Test B', status: 'paused', nextChargeDate: null }),
      sub({ name: 'Test A', status: 'paused', nextChargeDate: null }),
    ]);
    expect(g.active.map((s) => s.name)).toEqual(['Test Stream', 'Test Gym']);
    expect(g.paused.map((s) => s.name)).toEqual(['Test A', 'Test B']);
    expect(g.cancelled.map((s) => s.name)).toEqual(['Test Old']);
  });

  it('counts calendar days and says when a charge is close', () => {
    expect(daysUntil('2026-11-01', '2026-10-31')).toBe(1);
    expect(daysUntil('2026-03-30', '2026-03-28')).toBe(2); // across a DST change
    expect(dueSoonLabel('2026-10-19', '2026-10-19')).toBe('today');
    expect(dueSoonLabel('2026-10-20', '2026-10-19')).toBe('tomorrow');
    expect(dueSoonLabel('2026-10-24', '2026-10-19')).toBe('in 5 days');
    expect(dueSoonLabel('2026-10-26', '2026-10-19')).toBeNull();
    expect(dueSoonLabel('2026-10-18', '2026-10-19')).toBeNull();
  });

  it('describes each cycle', () => {
    expect(perCycle('monthly')).toBe('a month');
    expect(perCycle('quarterly')).toBe('every 3 months');
  });
});

describe('sms helpers', () => {
  const msg = (status: RawMessageView['status']): RawMessageView => ({
    id: status,
    userId: 'u',
    sender: 'TESTBANK',
    body: 'TEST',
    receivedAt: '2026-09-10T10:00:00.000Z',
    status,
    parsedPayload: null,
    parseError: null,
    transactionId: null,
  });

  it('needs attention = not read or half a transfer', () => {
    expect(matchesFilter('unparsed', 'attention')).toBe(true);
    expect(matchesFilter('awaiting_pair', 'attention')).toBe(true);
    expect(matchesFilter('awaiting_statement', 'attention')).toBe(false);
    expect(matchesFilter('parsed', 'attention')).toBe(false);
  });

  it('counts each filter', () => {
    const counts = countByFilter(['parsed', 'parsed', 'unparsed', 'ignored', 'awaiting_statement', 'pending'].map((s) => msg(s as RawMessageView['status'])));
    expect(counts).toEqual({ attention: 1, all: 6, parsed: 2, waiting: 2, ignored: 1 });
  });

  it('re-reads page by page until the server says it is done, adding up the totals', async () => {
    const page = (next: string | null, parsed: number): ReprocessResult => ({
      processed: 200, parsed, unparsed: 1, ignored: 0, awaitingPair: 0, awaitingStatement: 0, next,
    });
    const call = vi
      .fn<(after: string | undefined) => Promise<ReprocessResult>>()
      .mockResolvedValueOnce(page('m200', 150))
      .mockResolvedValueOnce(page(null, 40));
    const progress = vi.fn();
    const totals = await reprocessAll(call, progress);
    expect(call).toHaveBeenNthCalledWith(1, undefined);
    expect(call).toHaveBeenNthCalledWith(2, 'm200');
    expect(totals).toMatchObject({ processed: 400, parsed: 190, unparsed: 2 });
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it('stops when a round processes nothing, even if next is set', async () => {
    const call = vi.fn(async () => ({ processed: 0, parsed: 0, unparsed: 0, ignored: 0, awaitingPair: 0, awaitingStatement: 0, next: 'x' }));
    await reprocessAll(call);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
