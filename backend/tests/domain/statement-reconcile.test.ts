import { describe, expect, it } from 'vitest';
import { calendarDate } from '../../src/domain/calendar-date.js';
import { kindOfNewLine, reconcile, type LinkCandidate } from '../../src/domain/statements/reconcile.js';
import type { StatementLine } from '../../src/domain/statements/card-statement.js';

const line = (date: string, amount: string, description = 'TEST CAFE', direction: 'debit' | 'credit' = 'debit'): StatementLine => ({
  transactionDate: calendarDate(date),
  postingDate: calendarDate(date),
  description,
  amount,
  direction,
  notes: [],
});

const tx = (id: string, date: string, amount: string, extra: Partial<LinkCandidate> = {}): LinkCandidate => ({
  id,
  date: calendarDate(date),
  amount,
  direction: 'debit',
  kind: 'expense',
  ...extra,
});

const payment = (date: string, amount: string) => line(date, amount, 'PAYMENT RECEIVED INTERNET', 'credit');

describe('reconcile', () => {
  it('confirms the transaction with the same amount a few days before the booking', () => {
    expect(reconcile([line('2026-07-05', '450.00')], [tx('a', '2026-07-02', '450.00')])).toEqual([
      { kind: 'link', transactionId: 'a' },
    ]);
  });

  it('creates the line when nothing is within 3 days, or the amount differs', () => {
    const lines = [line('2026-07-10', '450.00'), line('2026-07-02', '451.00')];
    expect(reconcile(lines, [tx('a', '2026-07-02', '450.00')])).toEqual([{ kind: 'create' }, { kind: 'create' }]);
  });

  it('never confirms a transaction going the other way', () => {
    expect(reconcile([line('2026-07-02', '50.00')], [tx('a', '2026-07-02', '50.00', { direction: 'credit' })])).toEqual([
      { kind: 'create' },
    ]);
  });

  it('picks the closest date, and uses each transaction once', () => {
    const lines = [line('2026-07-05', '99.99'), line('2026-07-05', '99.99'), line('2026-07-05', '99.99')];
    const candidates = [tx('far', '2026-07-02', '99.99'), tx('near', '2026-07-05', '99.99')];
    expect(reconcile(lines, candidates)).toEqual([
      { kind: 'link', transactionId: 'near' },
      { kind: 'link', transactionId: 'far' },
      { kind: 'create' },
    ]);
  });

  it('breaks a tie by id, whatever order the candidates came in', () => {
    const a = tx('a', '2026-07-04', '10.00');
    const b = tx('b', '2026-07-06', '10.00');
    expect(reconcile([line('2026-07-05', '10.00')], [b, a])).toEqual([{ kind: 'link', transactionId: 'a' }]);
  });

  it('matches a card payment only to a transfer, and leaves an unmatched one waiting', () => {
    const transfer = tx('t', '2026-07-07', '275.00', { direction: 'credit', kind: 'transfer' });
    const refund = tx('r', '2026-07-08', '100.00', { direction: 'credit', kind: 'expense' });
    expect(reconcile([payment('2026-07-07', '275.00'), payment('2026-07-08', '100.00')], [transfer, refund])).toEqual([
      { kind: 'link', transactionId: 't' },
      { kind: 'unmatched-payment' },
    ]);
  });

  it('never lets an ordinary line confirm a transfer', () => {
    const transfer = tx('t', '2026-07-07', '50.00', { direction: 'credit', kind: 'transfer' });
    expect(reconcile([line('2026-07-07', '50.00', 'Reverse Annual fee', 'credit')], [transfer])).toEqual([{ kind: 'create' }]);
  });
});

describe('kindOfNewLine', () => {
  it.each(['Annual fee', 'Reverse Annual fee', 'FOREIGN EXCHANGE FEES', 'Stamp Duty', 'INSURANCE FEE -SOLIDARITY', 'INTEREST CHARGES'])(
    '%s is a fee',
    (description) => expect(kindOfNewLine(line('2026-07-01', '1.00', description))).toBe('fee'),
  );

  it.each(['TEST CAFE CAIRO', 'TEST CASHBACK', 'COFFEE HOUSE'])('%s is an expense (or money back on one)', (description) =>
    expect(kindOfNewLine(line('2026-07-01', '1.00', description))).toBe('expense'),
  );
});
