import { randomUUID } from 'node:crypto';
import { Money } from '../../domain/money.js';
import { InstallmentPlan } from '../../domain/installment.js';
import { DEFAULT_TIME_ZONE, localDateOf, type CalendarDate } from '../../domain/calendar-date.js';
import type { Currency } from '../../domain/currency.js';
import { newAccountId, type AccountId, type UserId } from '../../domain/ids.js';
import { NotFoundError } from '../errors.js';
import type { Clock } from '../ports/clock.js';
import type { AccountRepository, InstallmentPlanRepository } from '../ports/finance.js';

export interface InstallmentPlanDto {
  id: string;
  name: string;
  provider: string | null;
  installmentAmount: string;
  currency: Currency;
  totalInstallments: number;
  paidInstallments: number;
  firstDueDate: CalendarDate;
  /** null once completed or cancelled. */
  nextDueDate: CalendarDate | null;
  endDate: CalendarDate;
  totalCost: string;
  remainingAmount: string;
  /** "completed" is derived: every due date has passed. */
  status: 'active' | 'completed' | 'cancelled';
  accountId: string | null;
}

export interface InstallmentsView {
  plans: InstallmentPlanDto[];
  /** Per currency, active plans only. EGP and USD are never summed together. */
  totals: { currency: Currency; monthly: string; remaining: string }[];
}

function toDto(plan: InstallmentPlan, today: CalendarDate): InstallmentPlanDto {
  const status = plan.status === 'cancelled' ? 'cancelled' : plan.isCompleted(today) ? 'completed' : 'active';
  return {
    id: plan.id,
    name: plan.name,
    provider: plan.provider,
    installmentAmount: plan.installmentAmount.toDecimalString(),
    currency: plan.installmentAmount.getCurrency(),
    totalInstallments: plan.totalInstallments,
    paidInstallments: plan.paidCount(today),
    firstDueDate: plan.firstDueDate,
    nextDueDate: plan.nextDueDate(today),
    endDate: plan.endDate(),
    totalCost: plan.totalCost().toDecimalString(),
    remainingAmount: plan.remaining(today).toDecimalString(),
    status,
    accountId: plan.accountId,
  };
}

const STATUS_ORDER = { active: 0, completed: 1, cancelled: 2 } as const;

export class ListInstallments {
  constructor(
    private readonly plans: InstallmentPlanRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId): Promise<InstallmentsView> {
    const today = localDateOf(this.clock.now(), DEFAULT_TIME_ZONE);
    const dtos = (await this.plans.listForUser(userId)).map((p) => toDto(p, today));
    dtos.sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (a.nextDueDate ?? a.endDate).localeCompare(b.nextDueDate ?? b.endDate) ||
        a.name.localeCompare(b.name),
    );

    const totals = new Map<Currency, { monthly: Money; remaining: Money }>();
    for (const dto of dtos.filter((d) => d.status === 'active')) {
      const running = totals.get(dto.currency) ?? { monthly: Money.zero(dto.currency), remaining: Money.zero(dto.currency) };
      totals.set(dto.currency, {
        monthly: running.monthly.add(Money.create(dto.installmentAmount, dto.currency)),
        remaining: running.remaining.add(Money.create(dto.remainingAmount, dto.currency)),
      });
    }
    return {
      plans: dtos,
      totals: [...totals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, t]) => ({ currency, monthly: t.monthly.toDecimalString(), remaining: t.remaining.toDecimalString() })),
    };
  }
}

export interface CreateInstallmentInput {
  name: string;
  provider?: string;
  installmentAmount: string;
  currency: Currency;
  totalInstallments: number;
  firstDueDate: CalendarDate;
  accountId?: string;
}

export class CreateInstallmentPlan {
  constructor(
    private readonly plans: InstallmentPlanRepository,
    private readonly accounts: AccountRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId, input: CreateInstallmentInput): Promise<InstallmentPlanDto> {
    let accountId: AccountId | null = null;
    if (input.accountId !== undefined) {
      const account = await this.accounts.findForUser(input.accountId, userId);
      if (account === null) throw new NotFoundError('Account not found');
      accountId = newAccountId(account.id);
    }
    const plan = InstallmentPlan.create({
      id: randomUUID(),
      userId,
      name: input.name,
      provider: input.provider ?? null,
      installmentAmount: Money.create(input.installmentAmount, input.currency),
      totalInstallments: input.totalInstallments,
      firstDueDate: input.firstDueDate,
      accountId,
    });
    await this.plans.create(plan);
    return toDto(plan, localDateOf(this.clock.now(), DEFAULT_TIME_ZONE));
  }
}

export class CancelInstallmentPlan {
  constructor(
    private readonly plans: InstallmentPlanRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId, id: string): Promise<InstallmentPlanDto> {
    const plan = await this.plans.findForUser(id, userId);
    if (plan === null) throw new NotFoundError('Installment plan not found');
    plan.cancel(this.clock.now());
    await this.plans.save(plan);
    return toDto(plan, localDateOf(this.clock.now(), DEFAULT_TIME_ZONE));
  }
}
