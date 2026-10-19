import type { InstallmentPlan as InstallmentPlanRow, PrismaClient } from '@prisma/client';
import { Money } from '../../domain/money.js';
import { InstallmentPlan } from '../../domain/installment.js';
import { calendarDate, type CalendarDate } from '../../domain/calendar-date.js';
import { newAccountId, newCategoryId, newUserId, type CategoryId, type UserId } from '../../domain/ids.js';
import type { BudgetRepository, BudgetRow, InstallmentPlanRepository } from '../../application/ports/finance.js';

function toCalendarDate(value: Date): CalendarDate {
  return calendarDate(value.toISOString().slice(0, 10));
}

function fromCalendarDate(value: CalendarDate): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toPlan(row: InstallmentPlanRow): InstallmentPlan {
  return InstallmentPlan.restore({
    id: row.id,
    userId: newUserId(row.userId),
    name: row.name,
    provider: row.provider,
    installmentAmount: Money.create(row.installmentAmount.toFixed(2), row.currency),
    totalInstallments: row.totalInstallments,
    firstDueDate: toCalendarDate(row.firstDueDate),
    accountId: row.accountId === null ? null : newAccountId(row.accountId),
    status: row.status,
    cancelledAt: row.cancelledAt,
  });
}

export class PrismaInstallmentPlanRepository implements InstallmentPlanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(plan: InstallmentPlan): Promise<void> {
    await this.prisma.installmentPlan.create({
      data: {
        id: plan.id,
        userId: plan.userId,
        name: plan.name,
        provider: plan.provider,
        installmentAmount: plan.installmentAmount.toDecimalString(),
        currency: plan.installmentAmount.getCurrency(),
        totalInstallments: plan.totalInstallments,
        firstDueDate: fromCalendarDate(plan.firstDueDate),
        accountId: plan.accountId,
        status: plan.status,
        cancelledAt: plan.cancelledAt,
      },
    });
  }

  async save(plan: InstallmentPlan): Promise<void> {
    // Only what the entity lets change.
    await this.prisma.installmentPlan.updateMany({
      where: { id: plan.id, userId: plan.userId },
      data: { status: plan.status, cancelledAt: plan.cancelledAt },
    });
  }

  async findForUser(id: string, userId: UserId): Promise<InstallmentPlan | null> {
    const row = await this.prisma.installmentPlan.findFirst({ where: { id, userId } });
    return row === null ? null : toPlan(row);
  }

  async listForUser(userId: UserId): Promise<InstallmentPlan[]> {
    const rows = await this.prisma.installmentPlan.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toPlan);
  }
}

export class PrismaBudgetRepository implements BudgetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async setFrom(userId: UserId, categoryId: CategoryId, month: CalendarDate, limit: Money): Promise<void> {
    const key = { userId, categoryId, month: fromCalendarDate(month) };
    const values = { limitAmount: limit.toDecimalString(), currency: limit.getCurrency() };
    await this.prisma.budget.upsert({
      where: { userId_categoryId_month: key },
      create: { ...key, ...values },
      update: values,
    });
  }

  async effectiveOn(userId: UserId, month: CalendarDate): Promise<BudgetRow[]> {
    const rows = await this.prisma.budget.findMany({
      where: { userId, month: { lte: fromCalendarDate(month) } },
      orderBy: { month: 'desc' },
    });
    // Newest first, so the first row seen per category is the one in force.
    const latest = new Map<string, BudgetRow>();
    for (const row of rows) {
      if (latest.has(row.categoryId)) continue;
      latest.set(row.categoryId, {
        categoryId: newCategoryId(row.categoryId),
        month: toCalendarDate(row.month),
        limit: Money.create(row.limitAmount.toFixed(2), row.currency),
      });
    }
    return [...latest.values()];
  }
}
