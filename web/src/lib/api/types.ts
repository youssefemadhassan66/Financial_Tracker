// TypeScript types from API.md contract

export type AccountType =
  | 'checking'
  | 'savings'
  | 'cash'
  | 'wallet'
  | 'credit_card'
  | 'brokerage';

export type TransactionKind =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'trade'
  | 'dividend'
  | 'fee'
  | 'interest'
  | 'adjustment';

export type Direction = 'debit' | 'credit';

export type Currency = 'EGP' | 'USD';

export type TransactionSource = 'sms' | 'manual' | 'statement';

export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';

export type SmsStatus =
  | 'pending'
  | 'parsed'
  | 'unparsed'
  | 'ignored'
  | 'awaiting_pair'
  | 'awaiting_statement';

export type CategoryKind = 'spending' | 'income';

export interface User {
  id: string;
  email: string;
  defaultCurrency: Currency;
}

/** A phone that may send bank SMS (API.md section 11). The key itself is never part of this. */
export interface DeviceDto {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface RefreshResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface ApiErrorIssue {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    issues?: ApiErrorIssue[];
  };
}

export interface AccountDto {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  last4s: string[];
  isLiability: boolean;
  archived: boolean;
  available: {
    amount: string;
    reportedAt: string;
  } | null;
}

export interface CategoryRecord {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
}

export interface TransactionView {
  id: string;
  accountId: string;
  accountName: string;
  amount: string;
  currency: Currency;
  direction: Direction;
  kind: TransactionKind;
  countsAsSpending: boolean;
  category: {
    id: string;
    name: string;
    icon: string | null;
  } | null;
  merchant: string | null;
  occurredAt: string;
  source: TransactionSource;
  transferGroupId: string | null;
  original: {
    amount: string;
    currency: Currency;
  } | null;
}

export interface SubscriptionDto {
  id: string;
  name: string;
  amount: string;
  currency: Currency;
  cycle: BillingCycle;
  anchorDate: string;
  status: SubscriptionStatus;
  nextChargeDate: string | null;
  monthlyEquivalent: string;
  yearlyCost: string;
  categoryId: string | null;
  accountId: string | null;
  notes: string | null;
  lastCharge: {
    transactionId: string;
    occurredAt: string;
    amount: string;
    currency: Currency;
    original: {
      amount: string;
      currency: Currency;
    } | null;
  } | null;
  priceChanged: boolean;
  missedCharge: string | null;
}

// Request Bodies

export interface RegisterRequest {
  email: string;
  password: string;
  defaultCurrency?: Currency;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateAccountRequest {
  name: string;
  type: AccountType;
  currency: Currency;
  last4s?: string[];
}

export interface UpdateAccountRequest {
  name?: string;
  last4s?: string[];
}

export interface CreateCategoryRequest {
  name: string;
  kind?: CategoryKind;
  icon?: string | null;
  color?: string | null;
}

export interface CreateTransactionRequest {
  accountId: string;
  amount: string;
  direction: Direction;
  kind: TransactionKind;
  categoryId?: string;
  merchant?: string;
  occurredAt: string;
  countsAsSpending?: boolean;
}

export interface CreateTransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  occurredAt: string;
}

export interface CreateSubscriptionRequest {
  name: string;
  amount: string;
  currency: Currency;
  cycle: BillingCycle;
  anchorDate: string;
  categoryId?: string;
  accountId?: string;
  merchant?: string;
  notes?: string;
}

// Analytics (GET /api/analytics/categories)

export interface CategorySpending {
  categoryId: string | null;
  name: string;
  icon: string | null;
  total: string;
  /** Percent of this currency's spending total, e.g. 37.9. */
  share: number;
  count: number;
  previousTotal: string;
  /** Null when the previous total was zero. */
  changePercent: number | null;
}

export interface CurrencyAnalytics {
  currency: Currency;
  spending: {
    total: string;
    previousTotal: string;
    changePercent: number | null;
    categories: CategorySpending[];
  };
  investing: { invested: string; withdrawn: string; net: string; count: number };
  income: { total: string; count: number };
}

export interface CategoryAnalytics {
  period: { from: string; to: string };
  previousPeriod: { from: string; to: string };
  timeZone: string;
  currencies: CurrencyAnalytics[];
}

// Subscriptions summary (GET /api/subscriptions/summary)

export interface SubscriptionSummary {
  asOf: string;
  activeCount: number;
  totals: { currency: Currency; monthly: string; yearly: string }[];
  upcoming: { subscriptionId: string; name: string; date: string; amount: string; currency: Currency }[];
}

// Credit card statements (API.md section 10)

export interface StatementImportResult {
  period: string; // "2026-09"
  status: 'imported' | 'already-imported';
  confirmed: number;
  created: number;
  unmatchedPayments: number;
  pricedSms: number;
}

export interface CardStatementView {
  id: string;
  period: string;
  dueDate: string;
  creditLimit: string;
  availableCredit: string;
  totalDue: string;
  minimumDue: string;
  openingBalance: string;
  closingBalance: string;
  lineCount: number;
  unmatchedPayments: number;
  importedAt: string;
  /** The kept PDF this month was read from; null when there is none. */
  fileId: string | null;
}

/** POST /api/accounts/:id/statements */
export interface StatementImportOutcome {
  statements: StatementImportResult[];
  installmentPlans: { added: number; alreadyKnown: number };
  fileId: string;
}

/** GET /api/statement-files: a kept statement PDF, without its bytes. */
export interface StatementFileDto {
  id: string;
  accountId: string;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
  /** "2026-09", newest first. */
  periods: string[];
}

// Subscription suggestions (GET /api/subscriptions/suggestions)

export interface SubscriptionSuggestion {
  merchantKey: string;
  name: string;
  amount: string;
  currency: Currency;
  cycle: BillingCycle;
  anchorDate: string;
  lastChargeDate: string;
  chargeCount: number;
  accountId: string | null;
  transactionIds: string[];
}

// SMS inbox (API.md section 9)

export interface RawMessageView {
  id: string;
  userId: string;
  sender: string;
  body: string;
  receivedAt: string;
  status: SmsStatus;
  /** Free-form: show as key/value details, never depend on its keys. */
  parsedPayload: Record<string, string> | null;
  parseError: string | null;
  transactionId: string | null;
}

export interface ReprocessResult {
  processed: number;
  parsed: number;
  unparsed: number;
  ignored: number;
  awaitingPair: number;
  awaitingStatement: number;
  next: string | null;
}

// Budgets (API.md section 12)

export type BudgetState = 'ok' | 'near' | 'over';

export interface BudgetDto {
  categoryId: string;
  categoryName: string;
  currency: Currency;
  limit: string;
  spent: string;
  /** Negative once over the limit. */
  remaining: string;
  /** For drawing only; show the strings. */
  percentUsed: number;
  state: BudgetState;
}

export interface BudgetsView {
  month: string;
  period: { from: string; to: string };
  daysLeft: number;
  budgets: BudgetDto[];
}

// Installment plans (API.md section 13)

export interface InstallmentPlanDto {
  id: string;
  name: string;
  provider: string | null;
  installmentAmount: string;
  currency: Currency;
  totalInstallments: number;
  paidInstallments: number;
  firstDueDate: string;
  nextDueDate: string | null;
  endDate: string;
  totalCost: string;
  remainingAmount: string;
  status: 'active' | 'completed' | 'cancelled';
  accountId: string | null;
}

export interface InstallmentsView {
  plans: InstallmentPlanDto[];
  totals: { currency: Currency; monthly: string; remaining: string }[];
}
