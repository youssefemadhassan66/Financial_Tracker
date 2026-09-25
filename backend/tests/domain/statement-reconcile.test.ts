import { describe, expect, it } from 'vitest';
import { calendarDate } from '../../src/domain/calendar-date.js';
import {
  kindOfNewLine,
  priceForeignCharges,
  reconcile,
  type ForeignCharge,
  type LineDecision,
  type LinkCandidate,
} from '../../src/domain/statements/reconcile.js';
import type { StatementLine } from '../../src/domain/statements/card-statement.js';

const line = (date: string, amount: string, description = 'TEST CAFE', direction: 'debit' | 'credit' = 'debit'): StatementLine => ({
  transactionDate: calendarDate(date),
  postingDate: calendarDate(date),
  description,
  amount,
  direction,
  notes: [],
  original: null,
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

describe('priceForeignCharges', () => {
  const usdLine = (date: string, egp: string, usd: string, direction: 'debit' | 'credit' = 'debit'): StatementLine => ({
    ...line(date, egp, 'TEST SOFTWARE', direction),
    original: { amount: usd, currency: 'USD' },
  });
  const sms = (id: string, date: string, usd: string, extra: Partial<ForeignCharge> = {}): ForeignCharge => ({
    rawMessageId: id,
    amount: usd,
    currency: 'USD',
    direction: 'debit',
    date: calendarDate(date),
    ...extra,
  });
  const create: LineDecision = { kind: 'create' };

  it('prices the waiting SMS with the same dollars a few days before the booking', () => {
    expect(priceForeignCharges([usdLine('2026-08-06', '1036.44', '21.60')], [create], [sms('m', '2026-08-04', '21.60')])).toEqual([
      { kind: 'price-sms', rawMessageId: 'm' },
    ]);
  });

  it('leaves the line to be created when the dollars, the direction or the dates differ', () => {
    const lines = [usdLine('2026-08-06', '1036.44', '21.60'), usdLine('2026-08-06', '100.00', '2.00', 'credit'), usdLine('2026-08-20', '50.00', '1.00')];
    const charges = [sms('a', '2026-08-06', '22.81'), sms('b', '2026-08-06', '2.00'), sms('c', '2026-08-10', '1.00')];
    expect(priceForeignCharges(lines, [create, create, create], charges)).toEqual([create, create, create]);
  });

  it('only prices lines that are still to be created, each SMS once, the closest first', () => {
    const lines = [usdLine('2026-08-06', '1036.44', '21.60'), usdLine('2026-08-06', '1036.44', '21.60'), usdLine('2026-08-06', '1036.44', '21.60')];
    const confirmed: LineDecision = { kind: 'link', transactionId: 't' };
    const charges = [sms('far', '2026-08-03', '21.60'), sms('near', '2026-08-06', '21.60')];
    expect(priceForeignCharges(lines, [confirmed, create, create], charges)).toEqual([
      confirmed,
      { kind: 'price-sms', rawMessageId: 'near' },
      { kind: 'price-sms', rawMessageId: 'far' },
    ]);
  });

  it('never prices a line with no foreign amount', () => {
    expect(priceForeignCharges([line('2026-08-06', '21.60')], [create], [sms('m', '2026-08-06', '21.60')])).toEqual([create]);
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
