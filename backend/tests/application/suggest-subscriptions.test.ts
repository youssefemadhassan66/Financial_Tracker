import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/domain/errors.js';
import { newUserId } from '../../src/domain/ids.js';
import { Money } from '../../src/domain/money.js';
import { Subscription } from '../../src/domain/subscription.js';
import {
  DismissSuggestion,
  SuggestSubscriptions,
} from '../../src/application/subscriptions/suggest-subscriptions.js';
import type {
  LinkedCharge,
  SubscriptionChargeRepository,
  SubscriptionRepository,
  SuggestionDismissalRepository,
  UnlinkedCharge,
} from '../../src/application/ports/finance.js';
import { FakeClock } from './fakes.js';

const USER = newUserId('11111111-1111-1111-1111-111111111111');

describe('SuggestSubscriptions', () => {
  // 15 Sep 2026, 12:00 in Cairo.
  const clock = new FakeClock(new Date('2026-09-15T09:00:00Z'));

  class InMemorySubscriptionRepo implements SubscriptionRepository {
    constructor(private readonly subscriptions: Subscription[] = []) {}
    async create(subscription: Subscription): Promise<void> {
      this.subscriptions.push(subscription);
    }
    async save(): Promise<void> {}
    async findForUser(): Promise<Subscription | null> {
      return null;
    }
    async listForUser(): Promise<Subscription[]> {
      return this.subscriptions;
    }
  }

  class InMemoryChargesRepo implements SubscriptionChargeRepository {
    public lastSinceQueried: Date | null = null;
    constructor(private readonly unlinked: UnlinkedCharge[]) {}
    async listUnlinkedCharges(_u: unknown, since: Date): Promise<UnlinkedCharge[]> {
      this.lastSinceQueried = since;
      return this.unlinked.filter((c) => c.occurredAt >= since);
    }
    async link(): Promise<boolean> {
      return true;
    }
    async linkedCharges(): Promise<Map<string, LinkedCharge[]>> {
      return new Map();
    }
  }

  class InMemoryDismissalsRepo implements SuggestionDismissalRepository {
    readonly dismissed = new Set<string>();
    async listDismissed(): Promise<Set<string>> {
      return new Set(this.dismissed);
    }
    async dismiss(_u: unknown, merchantKey: string): Promise<void> {
      this.dismissed.add(merchantKey);
    }
  }

  const unlinked = (id: string, date: string, merchantKey = 'TEST STREAM'): UnlinkedCharge => ({
    id,
    accountId: 'acc-1',
    merchantKey,
    merchantRaw: merchantKey,
    kind: 'expense',
    direction: 'debit',
    occurredAt: new Date(`${date}T10:00:00Z`),
    amount: Money.create('149.99', 'EGP'),
    original: null,
  });

  it('reads only unlinked charges since lookback and returns suggestion DTOs', async () => {
    const chargesRepo = new InMemoryChargesRepo([
      // Old charge: over 400 days ago (relative to 2026-09-15)
      unlinked('old-1', '2024-01-01'),
      unlinked('c1', '2026-06-15'),
      unlinked('c2', '2026-07-15'),
      unlinked('c3', '2026-08-15'),
    ]);
    const dismissalsRepo = new InMemoryDismissalsRepo();
    const subsRepo = new InMemorySubscriptionRepo();

    const useCase = new SuggestSubscriptions(subsRepo, chargesRepo, dismissalsRepo, clock);
    const suggestions = await useCase.execute(USER);

    // Queries 400 days back
    const expectedSince = new Date(clock.now().getTime() - 400 * 24 * 60 * 60 * 1000);
    expect(chargesRepo.lastSinceQueried?.toISOString()).toBe(expectedSince.toISOString());

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toEqual({
      merchantKey: 'TEST STREAM',
      name: 'TEST STREAM',
      amount: '149.99',
      currency: 'EGP',
      cycle: 'monthly',
      anchorDate: '2026-06-15',
      lastChargeDate: '2026-08-15',
      chargeCount: 3,
      accountId: 'acc-1',
      transactionIds: ['c1', 'c2', 'c3'],
    });
  });

  it('respects dismissals and hides dismissed suggestions', async () => {
    const chargesRepo = new InMemoryChargesRepo([
      unlinked('c1', '2026-06-15', 'TEST STREAM'),
      unlinked('c2', '2026-07-15', 'TEST STREAM'),
      unlinked('c3', '2026-08-15', 'TEST STREAM'),
    ]);
    const dismissalsRepo = new InMemoryDismissalsRepo();
    dismissalsRepo.dismissed.add('TEST STREAM');

    const useCase = new SuggestSubscriptions(new InMemorySubscriptionRepo(), chargesRepo, dismissalsRepo, clock);
    const suggestions = await useCase.execute(USER);
    expect(suggestions).toEqual([]);
  });
});

describe('DismissSuggestion', () => {
  class InMemoryDismissalsRepo implements SuggestionDismissalRepository {
    readonly dismissed: string[] = [];
    async listDismissed(): Promise<Set<string>> {
      return new Set(this.dismissed);
    }
    async dismiss(_u: unknown, merchantKey: string): Promise<void> {
      this.dismissed.push(merchantKey);
    }
  }

  it('normalizes the merchant key before storing', async () => {
    const repo = new InMemoryDismissalsRepo();
    const useCase = new DismissSuggestion(repo);

    await useCase.execute(USER, '  test  gym   #1234  ');
    // Branch numbers (1234) stripped, trimmed, uppercased
    expect(repo.dismissed).toEqual(['TEST GYM']);
  });

  it('throws DomainError when normalized merchant key is empty', async () => {
    const repo = new InMemoryDismissalsRepo();
    const useCase = new DismissSuggestion(repo);

    await expect(useCase.execute(USER, '   ')).rejects.toThrow(DomainError);
    await expect(useCase.execute(USER, '---')).rejects.toThrow(DomainError);
    await expect(useCase.execute(USER, '12345')).rejects.toThrow(DomainError);
    expect(repo.dismissed).toHaveLength(0);
  });
});
