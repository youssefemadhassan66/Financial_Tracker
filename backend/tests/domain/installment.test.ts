import { describe, expect, it } from 'vitest';
import { InstallmentPlan } from '../../src/domain/installment.js';
import { Money } from '../../src/domain/money.js';
import { calendarDate } from '../../src/domain/calendar-date.js';
import { newUserId } from '../../src/domain/ids.js';
import { DomainError } from '../../src/domain/errors.js';

/** FAKE data only. */
function props(over: { name?: string; total?: number; first?: string; amount?: string } = {}) {
  return {
    id: 'p1',
    userId: newUserId('u1'),
    name: over.name ?? ' TEST Phone ',
    provider: ' TEST Pay ',
    installmentAmount: Money.create(over.amount ?? '800.00', 'EGP'),
    totalInstallments: over.total ?? 6,
    firstDueDate: calendarDate(over.first ?? '2026-08-11'),
    accountId: null,
  };
}
const plan = (over: Parameters<typeof props>[0] = {}) => InstallmentPlan.create(props(over));
const d = calendarDate;

describe('InstallmentPlan', () => {
  it('trims the name and provider', () => {
    const p = plan();
    expect(p.name).toBe('TEST Phone');
    expect(p.provider).toBe('TEST Pay');
  });

  it('refuses an empty name, a zero amount and a silly number of payments', () => {
    expect(() => plan({ name: '  ' })).toThrow(DomainError);
    expect(() => plan({ amount: '0' })).toThrow(DomainError);
    expect(() => plan({ total: 0 })).toThrow(DomainError);
    expect(() => plan({ total: 121 })).toThrow(DomainError);
    expect(() => plan({ total: 2.5 })).toThrow(DomainError);
  });

  it('counts a payment as made once its due date has passed', () => {
    const p = plan();
    expect(p.paidCount(d('2026-08-11'))).toBe(0); // due today: not behind you yet
    expect(p.nextDueDate(d('2026-08-11'))).toBe('2026-08-11');
    expect(p.paidCount(d('2026-08-12'))).toBe(1);
    expect(p.paidCount(d('2026-10-19'))).toBe(3); // 11 Aug, 11 Sep, 11 Oct
    expect(p.nextDueDate(d('2026-10-19'))).toBe('2026-11-11');
  });

  it('finishes after the last payment', () => {
    const p = plan();
    expect(p.endDate()).toBe('2027-01-11');
    expect(p.isCompleted(d('2027-01-11'))).toBe(false);
    expect(p.isCompleted(d('2027-01-12'))).toBe(true);
    expect(p.nextDueDate(d('2027-01-12'))).toBeNull();
    expect(p.paidCount(d('2030-01-01'))).toBe(6);
  });

  it('keeps month-end due dates on the last day of short months', () => {
    const p = plan({ first: '2026-01-31', total: 3 });
    expect(p.dueDate(2)).toBe('2026-02-28');
    expect(p.dueDate(3)).toBe('2026-03-31');
  });

  it('totals and remaining are exact money', () => {
    const p = plan({ amount: '750.00' });
    expect(p.totalCost().toDecimalString()).toBe('4500.00');
    expect(p.remaining(d('2026-10-19')).toDecimalString()).toBe('2250.00'); // 3 of 6 left
  });

  it('a cancelled plan has no next payment and nothing remaining, and cannot be cancelled twice', () => {
    const p = plan();
    p.cancel(new Date('2026-10-19T10:00:00Z'));
    expect(p.status).toBe('cancelled');
    expect(p.nextDueDate(d('2026-10-19'))).toBeNull();
    expect(p.remaining(d('2026-10-19')).isZero()).toBe(true);
    expect(() => p.cancel(new Date())).toThrow(DomainError);
  });
});
