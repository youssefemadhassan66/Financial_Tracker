import { z } from 'zod';
import { isCalendarDate, type CalendarDate } from '../../domain/calendar-date.js';
import { TRANSACTION_KINDS } from '../../domain/transaction-kind.js';
import { ACCOUNT_TYPES } from '../../domain/account-type.js';
import { MAX_LAST4S } from '../../domain/account.js';
import {
  currencyField,
  instantField,
  moneyAmountField,
  safeText,
  uuidParam,
} from './fields.js';

/** "2026-09-21" — validated as a real date, so 2026-02-30 is rejected. */
export const calendarDateField = z
  .string()
  .refine(isCalendarDate, 'Must be a real date in YYYY-MM-DD form')
  .transform((value) => value as CalendarDate);

export const createCategoryBody = z.strictObject({
  name: safeText({ max: 40 }),
  kind: z.enum(['spending', 'income']).default('spending'),
  icon: safeText({ max: 16 }).nullable().default(null),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Colour must look like #1A2B3C')
    .nullable()
    .default(null),
});

/** Last 4 digits of each card/account number; the domain de-duplicates. */
const last4sField = z
  .array(z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'))
  .max(MAX_LAST4S, `At most ${MAX_LAST4S} card or account numbers`);

export const createAccountBody = z.strictObject({
  name: safeText({ max: 60 }),
  type: z.enum(ACCOUNT_TYPES as unknown as [string, ...string[]]).transform((v) => v as (typeof ACCOUNT_TYPES)[number]),
  currency: currencyField,
  last4s: last4sField.optional(),
});

export const accountIdParams = z.object({ id: uuidParam });

export const statementFileParams = z.strictObject({ id: uuidParam });
export const statementFileListQuery = z.strictObject({ accountId: uuidParam.optional() });

export const updateAccountBody = z
  .strictObject({
    name: safeText({ max: 60 }).optional(),
    last4s: last4sField.optional(),
  })
  .refine((body) => body.name !== undefined || body.last4s !== undefined, 'Nothing to update');

export const recordTransactionBody = z.strictObject({
  accountId: uuidParam,
  amount: moneyAmountField,
  direction: z.enum(['debit', 'credit']),
  kind: z.enum(TRANSACTION_KINDS as unknown as [string, ...string[]]).transform((v) => v as (typeof TRANSACTION_KINDS)[number]),
  categoryId: uuidParam.optional(),
  merchant: safeText({ max: 120 }),
  occurredAt: instantField,
  countsAsSpending: z.boolean().optional(),
});

export const recordTransferBody = z.strictObject({
  fromAccountId: uuidParam,
  toAccountId: uuidParam,
  amount: moneyAmountField,
  occurredAt: instantField,
});

export const listTransactionsQuery = z.strictObject({
  from: calendarDateField.optional(),
  to: calendarDateField.optional(),
  accountId: uuidParam.optional(),
  categoryId: uuidParam.optional(),
  before: instantField.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const analyticsQuery = z.strictObject({
  from: calendarDateField.optional(),
  to: calendarDateField.optional(),
});

export const createSubscriptionBody = z.strictObject({
  name: safeText({ max: 60 }),
  amount: moneyAmountField,
  currency: currencyField,
  cycle: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  anchorDate: calendarDateField,
  categoryId: uuidParam.optional(),
  accountId: uuidParam.optional(),
  merchant: safeText({ max: 120 }).optional(),
  notes: safeText({ max: 500, multiline: true }).optional(),
});

export const subscriptionSummaryQuery = z.strictObject({
  days: z.coerce.number().int().min(1).max(366).default(30),
});

export const subscriptionListQuery = z.strictObject({
  status: z.enum(['active', 'paused', 'cancelled']).optional(),
});

export const subscriptionActionParams = z.strictObject({
  id: uuidParam,
  action: z.enum(['pause', 'resume', 'cancel']),
});

export const dismissSubscriptionSuggestionBody = z.strictObject({
  merchantKey: safeText({ max: 120 }),
});

// --- budgets -------------------------------------------------------------

export const budgetListQuery = z.strictObject({
  /** "2026-10"; the current month when absent. */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be a month in YYYY-MM form').optional(),
});

export const budgetCategoryParams = z.strictObject({ categoryId: uuidParam });

export const setBudgetBody = z.strictObject({
  currency: currencyField,
  limit: moneyAmountField,
});

// --- installments --------------------------------------------------------

export const createInstallmentBody = z.strictObject({
  name: safeText({ max: 60 }),
  provider: safeText({ max: 60 }).optional(),
  installmentAmount: moneyAmountField,
  currency: currencyField,
  totalInstallments: z.number().int().min(1).max(120),
  firstDueDate: calendarDateField,
  accountId: uuidParam.optional(),
});

export const installmentIdParams = z.strictObject({ id: uuidParam });

// --- stored SMS ----------------------------------------------------------

/** Two waiting halves of one transfer, chosen by the user. */
export const smsPairBody = z.strictObject({
  debitMessageId: uuidParam,
  paymentMessageId: uuidParam,
});

export const smsListQuery = z.strictObject({
  status: z.enum(['pending', 'parsed', 'unparsed', 'ignored', 'awaiting_pair', 'awaiting_statement']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const smsReprocessBody = z.strictObject({
  /** The `next` value from the previous reprocess response. */
  after: uuidParam.optional(),
});
