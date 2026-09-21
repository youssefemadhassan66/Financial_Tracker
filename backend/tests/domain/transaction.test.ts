import { describe, expect, it } from 'vitest';
import { Transaction } from '../../src/domain/transaction.js';
import { User } from '../../src/domain/user.js';
import { Money } from '../../src/domain/money.js';
import { DomainError } from '../../src/domain/errors.js';
import {
  newAccountId,
  newCategoryId,
  newMerchantKey,
  newTransactionId,
  newTransferGroupId,
  newUserId,
} from '../../src/domain/ids.js';

function build(overrides: Partial<Parameters<typeof Transaction.create>[0]> = {}) {
  return {
    id: newTransactionId('txn_1'),
    userId: newUserId('usr_1'),
    accountId: newAccountId('acc_1'),
    amount: Money.create('45.50', 'EGP'),
    direction: 'debit' as const,
    kind: 'expense' as const,
    countsAsSpending: true,
    merchantKey: newMerchantKey('CARREFOUR'),
    merchantRaw: 'كارفور المعادي',
    occurredAt: new Date('2026-09-01T10:00:00Z'),
    source: 'sms' as const,
    ...overrides,
  };
}

describe('Transaction — basics', () => {
  it('creates uncategorized by default', () => {
    const txn = Transaction.create(build());
    expect(txn.isCategorized()).toBe(false);
    expect(txn.getCategoryId()).toBeNull();
  });

  it('preserves Arabic merchant text exactly', () => {
    expect(Transaction.create(build()).merchantRaw).toBe('كارفور المعادي');
  });

  it('rejects an empty merchantRaw', () => {
    expect(() => Transaction.create(build({ merchantRaw: '   ' }))).toThrow(DomainError);
  });

  it('rejects a future occurredAt', () => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    expect(() => Transaction.create(build({ occurredAt: tomorrow }))).toThrow(DomainError);
  });

  it('keeps identity across category changes', () => {
    const txn = Transaction.create(build());
    const originalId = txn.id;
    txn.categorize(newCategoryId('cat_groceries'));
    txn.categorize(newCategoryId('cat_dining'));
    expect(txn.id).toBe(originalId);
    expect(txn.getCategoryId()).toBe(newCategoryId('cat_dining'));
  });
});

describe('Transaction — transfer group rules', () => {
  it('requires a transferGroupId for a transfer', () => {
    expect(() =>
      Transaction.create(build({ kind: 'transfer', countsAsSpending: false })),
    ).toThrow(DomainError);
  });

  it('requires a transferGroupId for a trade', () => {
    expect(() =>
      Transaction.create(build({ kind: 'trade', countsAsSpending: false })),
    ).toThrow(DomainError);
  });

  it('forbids a transferGroupId on an expense', () => {
    expect(() =>
      Transaction.create(build({ transferGroupId: newTransferGroupId('grp_1') })),
    ).toThrow(DomainError);
  });
});

describe('Transaction — the double-counting guards', () => {
  it('refuses to let a transfer count as spending', () => {
    // Paying your credit card bill moves your own money. The original
    // charge was the expense; counting the payment too would double it.
    expect(() =>
      Transaction.create(
        build({
          kind: 'transfer',
          countsAsSpending: true,
          transferGroupId: newTransferGroupId('grp_1'),
        }),
      ),
    ).toThrow(DomainError);
  });

  it('refuses to let a trade count as spending', () => {
    // Buying TMG shares converts cash into an asset. Nothing was spent.
    expect(() =>
      Transaction.create(
        build({
          kind: 'trade',
          countsAsSpending: true,
          transferGroupId: newTransferGroupId('grp_1'),
        }),
      ),
    ).toThrow(DomainError);
  });

  it('refuses to flip a transfer to spending after creation', () => {
    const txn = Transaction.create(
      build({
        kind: 'transfer',
        countsAsSpending: false,
        transferGroupId: newTransferGroupId('grp_1'),
      }),
    );
    expect(() => txn.setCountsAsSpending(true)).toThrow(DomainError);
  });
});

describe('Transaction — categorization rules', () => {
  it('refuses to categorize a transfer', () => {
    const txn = Transaction.create(
      build({
        kind: 'transfer',
        countsAsSpending: false,
        transferGroupId: newTransferGroupId('grp_1'),
      }),
    );
    expect(() => txn.categorize(newCategoryId('cat_x'))).toThrow(DomainError);
  });

  it('allows categorizing income', () => {
    const txn = Transaction.create(
      build({ kind: 'income', direction: 'credit', countsAsSpending: false }),
    );
    txn.categorize(newCategoryId('cat_salary'));
    expect(txn.isCategorized()).toBe(true);
  });

  it('can clear a category', () => {
    const txn = Transaction.create(build());
    txn.categorize(newCategoryId('cat_groceries'));
    txn.clearCategory();
    expect(txn.isCategorized()).toBe(false);
  });
});

describe('Transaction — per-row spending override', () => {
  it('excludes a reimbursed expense without touching user settings', () => {
    const lunch = Transaction.create(build());
    expect(lunch.getCountsAsSpending()).toBe(true);

    lunch.setCountsAsSpending(false); // work reimbursed it

    expect(lunch.getCountsAsSpending()).toBe(false);
    expect(lunch.kind).toBe('expense'); // the FACT is unchanged
  });

  it('can include a single fee even when fees are globally off', () => {
    const commission = Transaction.create(build({ kind: 'fee', countsAsSpending: false }));
    commission.setCountsAsSpending(true);
    expect(commission.getCountsAsSpending()).toBe(true);
  });
});

describe('Transaction — real scenarios', () => {
  it('models a credit card charge and its later payment without double-counting', () => {
    const charge = Transaction.create(
      build({
        id: newTransactionId('txn_charge'),
        accountId: newAccountId('acc_card'),
        amount: Money.create('500', 'EGP'),
        kind: 'expense',
        countsAsSpending: true,
      }),
    );

    const groupId = newTransferGroupId('grp_card_payment');
    const paymentOut = Transaction.create(
      build({
        id: newTransactionId('txn_pay_out'),
        accountId: newAccountId('acc_bank'),
        amount: Money.create('3000', 'EGP'),
        direction: 'debit',
        kind: 'transfer',
        countsAsSpending: false,
        transferGroupId: groupId,
      }),
    );
    const paymentIn = Transaction.create(
      build({
        id: newTransactionId('txn_pay_in'),
        accountId: newAccountId('acc_card'),
        amount: Money.create('3000', 'EGP'),
        direction: 'credit',
        kind: 'transfer',
        countsAsSpending: false,
        transferGroupId: groupId,
      }),
    );

    const spending = [charge, paymentOut, paymentIn].filter((t) => t.getCountsAsSpending());

    // Spent 500, not 3,500.
    expect(spending).toHaveLength(1);
    expect(spending[0]?.amount.toDecimalString()).toBe('500.00');
    expect(paymentOut.transferGroupId).toBe(paymentIn.transferGroupId);
  });

  it('models buying EGX shares as a trade, with the commission as a fee', () => {
    const groupId = newTransferGroupId('grp_tmg_buy');

    const buy = Transaction.create(
      build({
        id: newTransactionId('txn_buy'),
        accountId: newAccountId('acc_brokerage'),
        amount: Money.create('10000', 'EGP'),
        kind: 'trade',
        countsAsSpending: false,
        merchantKey: newMerchantKey('TMG'),
        merchantRaw: 'TMG',
        transferGroupId: groupId,
      }),
    );

    const commission = Transaction.create(
      build({
        id: newTransactionId('txn_fee'),
        accountId: newAccountId('acc_brokerage'),
        amount: Money.create('25', 'EGP'),
        kind: 'fee',
        countsAsSpending: true, // policy has fees on
        merchantKey: newMerchantKey('BROKER'),
        merchantRaw: 'Broker commission',
      }),
    );

    const spending = [buy, commission].filter((t) => t.getCountsAsSpending());

    // The 10,000 was invested, not spent. Only the 25 commission is a cost.
    expect(spending).toHaveLength(1);
    expect(spending[0]?.amount.toDecimalString()).toBe('25.00');
    expect(buy.transferGroupId).toBe(groupId);
  });
});

describe('Transaction — tenancy', () => {
  const HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aBcDeFgHiJkLmNoPqRsTuV';

  it("refuses to hand one user another user's transaction", () => {
    const owner = User.create({
      id: newUserId('usr_1'),
      email: 'youssef@example.com',
      passwordHash: HASH,
      defaultCurrency: 'EGP',
    });
    const intruder = User.create({
      id: newUserId('usr_2'),
      email: 'someone@example.com',
      passwordHash: HASH,
      defaultCurrency: 'EGP',
    });

    const txn = Transaction.create(build({ userId: newUserId('usr_1') }));

    expect(() => owner.assertOwns(txn.userId)).not.toThrow();
    expect(() => intruder.assertOwns(txn.userId)).toThrow(DomainError);
  });
});
