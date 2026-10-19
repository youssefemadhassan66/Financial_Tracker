import { DomainError } from './errors.js';
import type { Money } from './money.js';
import { addMonthsClamped, type CalendarDate } from './calendar-date.js';
import type { AccountId, UserId } from './ids.js';

export type InstallmentStatus = 'active' | 'cancelled';

/** Most plans in Egypt run 6-60 months; 120 leaves room without allowing nonsense. */
export const MAX_INSTALLMENTS = 120;

export interface InstallmentPlanProps {
  id: string;
  userId: UserId;
  name: string;
  /** Who you pay: valU, Halan, Souhoola, the bank... */
  provider: string | null;
  /** What each monthly payment costs. */
  installmentAmount: Money;
  totalInstallments: number;
  /** The first payment's date. Every later one is derived from it. */
  firstDueDate: CalendarDate;
  accountId: AccountId | null;
  status: InstallmentStatus;
  cancelledAt: Date | null;
}

/**
 * A purchase paid in equal monthly installments (valU, a bank plan...).
 *
 * Like a subscription's billing dates, how many installments are paid and
 * when the next one is due are COMPUTED from the first due date, never
 * stored: a stored counter has to be advanced every month, and the month
 * that update is missed it is wrong forever. A payment counts as made once
 * its due date has passed.
 */
export class InstallmentPlan {
  private constructor(private props: InstallmentPlanProps) {}

  static create(props: Omit<InstallmentPlanProps, 'status' | 'cancelledAt'>): InstallmentPlan {
    InstallmentPlan.validate(props);
    return new InstallmentPlan({
      ...props,
      name: props.name.trim(),
      provider: props.provider?.trim() || null,
      status: 'active',
      cancelledAt: null,
    });
  }

  static restore(props: InstallmentPlanProps): InstallmentPlan {
    InstallmentPlan.validate(props);
    return new InstallmentPlan({ ...props });
  }

  private static validate(props: Pick<InstallmentPlanProps, 'name' | 'installmentAmount' | 'totalInstallments'>): void {
    if (props.name.trim().length === 0) throw new DomainError('Installment plan name cannot be empty');
    if (props.installmentAmount.isZero()) throw new DomainError('Installment amount must be greater than zero');
    if (
      !Number.isInteger(props.totalInstallments) ||
      props.totalInstallments < 1 ||
      props.totalInstallments > MAX_INSTALLMENTS
    ) {
      throw new DomainError(`Number of installments must be between 1 and ${MAX_INSTALLMENTS}`);
    }
  }

  get id(): string { return this.props.id; }
  get userId(): UserId { return this.props.userId; }
  get name(): string { return this.props.name; }
  get provider(): string | null { return this.props.provider; }
  get installmentAmount(): Money { return this.props.installmentAmount; }
  get totalInstallments(): number { return this.props.totalInstallments; }
  get firstDueDate(): CalendarDate { return this.props.firstDueDate; }
  get accountId(): AccountId | null { return this.props.accountId; }
  get status(): InstallmentStatus { return this.props.status; }
  get cancelledAt(): Date | null { return this.props.cancelledAt; }

  /** Final, like a subscription: the plan stays for history. */
  cancel(at: Date): void {
    if (this.props.status === 'cancelled') throw new DomainError('Installment plan is already cancelled');
    this.props.status = 'cancelled';
    this.props.cancelledAt = at;
  }

  /** The n-th payment's date, 1-based. The 31st becomes the month's last day. */
  dueDate(n: number): CalendarDate {
    return addMonthsClamped(this.props.firstDueDate, n - 1);
  }

  /** The last payment's date. */
  endDate(): CalendarDate {
    return this.dueDate(this.props.totalInstallments);
  }

  /** Payments whose due date is before `today`. */
  paidCount(today: CalendarDate): number {
    let paid = 0;
    while (paid < this.props.totalInstallments && this.dueDate(paid + 1) < today) paid++;
    return paid;
  }

  /** Today or later; null once every payment is behind you, or when cancelled. */
  nextDueDate(today: CalendarDate): CalendarDate | null {
    if (this.props.status === 'cancelled') return null;
    const paid = this.paidCount(today);
    return paid >= this.props.totalInstallments ? null : this.dueDate(paid + 1);
  }

  isCompleted(today: CalendarDate): boolean {
    return this.paidCount(today) >= this.props.totalInstallments;
  }

  totalCost(): Money {
    return this.props.installmentAmount.scale(this.props.totalInstallments, 1);
  }

  /** What is still to pay. Zero once completed; a cancelled plan owes nothing here. */
  remaining(today: CalendarDate): Money {
    if (this.props.status === 'cancelled') return this.props.installmentAmount.scale(0, 1);
    return this.props.installmentAmount.scale(this.props.totalInstallments - this.paidCount(today), 1);
  }
}
