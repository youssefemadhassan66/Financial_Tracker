/**
 * Demo seed: creates a FAKE user with fake accounts, ~3 months of transactions,
 * transfers and subscriptions, through the running backend's public API.
 *
 *   npm run seed:demo              demo@example.com (skips if it already has data)
 *   npm run seed:demo -- --fresh   a brand-new demo+<timestamp>@example.com user
 *
 * Env overrides: API_URL, DEMO_EMAIL, DEMO_PASSWORD. The password and tokens
 * are never printed.
 *
 * Everything here is fake on purpose: card digits 1111/2222/3333/4444 only,
 * TEST merchants, @example.com emails.
 */
import type {
  AccountDto,
  AccountType,
  CategoryRecord,
  CreateSubscriptionRequest,
  CreateTransactionRequest,
  Currency,
} from '../src/lib/api/types';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const FRESH = process.argv.includes('--fresh');
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-password-1234';

function timestamp(): string {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? (FRESH ? `demo+${timestamp()}@example.com` : 'demo@example.com');

interface ApiErrorResponse {
  error?: { code?: string; message?: string };
}

let bearerToken: string | null = null;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    fail(`Cannot reach the backend at ${API_URL}. Is it running (npm run dev in the backend repo)?`);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  if (!res.ok) {
    const err = (json as ApiErrorResponse | null)?.error;
    fail(`${options.method ?? 'GET'} ${path} failed: [${res.status}] ${err?.code ?? 'UNKNOWN'}: ${err?.message ?? text}`);
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// Dates. Midday UTC is afternoon in Cairo, so the Cairo calendar day always
// matches the date string.

const now = new Date();
const todayStr = now.toISOString().slice(0, 10);

/** Day `day` of the month `monthsAgo` months before this one, or null if it is still in the future. */
function dayInMonth(monthsAgo: number, day: number): { iso: string; dateStr: string } | null {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day, 12));
  const dateStr = d.toISOString().slice(0, 10);
  if (dateStr > todayStr) return null;
  return { iso: d.toISOString(), dateStr };
}

// ---------------------------------------------------------------------------
// The fake world.

type AccountKey = 'visa' | 'checking' | 'usdCard' | 'cash';

const ACCOUNTS: Record<AccountKey, { name: string; type: AccountType; currency: Currency; last4s: string[] }> = {
  visa: { name: 'Test Visa', type: 'credit_card', currency: 'EGP', last4s: ['1111'] },
  checking: { name: 'Test Checking', type: 'checking', currency: 'EGP', last4s: ['2222', '4444'] },
  usdCard: { name: 'Test USD Card', type: 'credit_card', currency: 'USD', last4s: ['3333'] },
  cash: { name: 'Test Cash', type: 'cash', currency: 'EGP', last4s: [] },
};

const CATEGORY_NAMES = [
  'Groceries',
  'Food & Dining',
  'Transport',
  'Subscriptions',
  'Bills & Utilities',
  'Shopping',
  'Entertainment',
  'Health',
  'Salary',
] as const;
type CategoryName = (typeof CATEGORY_NAMES)[number];

interface MonthlyEntry {
  day: number;
  account: AccountKey;
  /** One amount per month: [2 months ago, last month, this month]. Strings, never numbers. */
  amounts: [string, string, string];
  category: CategoryName;
  merchant: string;
  kind?: 'expense' | 'income';
  direction?: 'debit' | 'credit';
  /** Only in these months (0 = this month). Default: every month. */
  onlyMonths?: number[];
}

// Repeats every month with slightly different amounts, so month-over-month
// comparisons and category shares look real.
const MONTHLY: MonthlyEntry[] = [
  { day: 1, account: 'checking', amounts: ['25000.00', '25000.00', '25000.00'], category: 'Salary', merchant: 'TEST EMPLOYER', kind: 'income', direction: 'credit' },
  { day: 2, account: 'usdCard', amounts: ['2.99', '2.99', '2.99'], category: 'Subscriptions', merchant: 'TEST CLOUD' },
  { day: 3, account: 'visa', amounts: ['1180.40', '1265.75', '1320.10'], category: 'Groceries', merchant: 'TEST GROCER' },
  { day: 5, account: 'visa', amounts: ['149.99', '149.99', '149.99'], category: 'Subscriptions', merchant: 'TEST STREAM' },
  { day: 6, account: 'checking', amounts: ['95.00', '120.00', '110.00'], category: 'Food & Dining', merchant: 'TEST CAFE' },
  { day: 8, account: 'checking', amounts: ['450.00', '480.00', '520.00'], category: 'Transport', merchant: 'TEST FUEL' },
  { day: 9, account: 'cash', amounts: ['60.00', '75.00', '55.00'], category: 'Food & Dining', merchant: 'TEST BAKERY' },
  { day: 10, account: 'checking', amounts: ['410.00', '385.00', '455.00'], category: 'Bills & Utilities', merchant: 'TEST ELECTRIC' },
  { day: 12, account: 'visa', amounts: ['500.00', '500.00', '500.00'], category: 'Subscriptions', merchant: 'TEST GYM' },
  { day: 13, account: 'visa', amounts: ['899.00', '1450.00', '640.00'], category: 'Shopping', merchant: 'TEST STORE' },
  { day: 14, account: 'usdCard', amounts: ['19.99', '9.99', '14.99'], category: 'Entertainment', merchant: 'TEST GAMES' },
  { day: 15, account: 'checking', amounts: ['250.00', '250.00', '250.00'], category: 'Bills & Utilities', merchant: 'TEST MOBILE' },
  { day: 17, account: 'visa', amounts: ['230.50', '185.00', '310.25'], category: 'Health', merchant: 'TEST PHARMACY' },
  { day: 18, account: 'visa', amounts: ['640.00', '720.30', '580.90'], category: 'Groceries', merchant: 'TEST MARKET' },
  { day: 21, account: 'visa', amounts: ['540.00', '385.00', '460.00'], category: 'Food & Dining', merchant: 'TEST RESTAURANT' },
  { day: 22, account: 'cash', amounts: ['85.00', '120.00', '95.00'], category: 'Transport', merchant: 'TEST TAXI' },
  { day: 24, account: 'usdCard', amounts: ['45.00', '89.99', '32.50'], category: 'Shopping', merchant: 'TEST ONLINE' },
  { day: 25, account: 'visa', amounts: ['320.00', '280.00', '350.00'], category: 'Entertainment', merchant: 'TEST CINEMA' },
  { day: 27, account: 'checking', amounts: ['410.00', '390.00', '455.00'], category: 'Groceries', merchant: 'TEST GROCER' },
  // A refund: money back on a purchase. It still counts as spending, so it lowers the month's total.
  { day: 26, account: 'visa', amounts: ['0', '150.00', '0'], category: 'Shopping', merchant: 'TEST STORE', direction: 'credit', onlyMonths: [1] },
];

const MONTHS = [2, 1, 0]; // oldest first
const TRANSFER_DAY = 20;
const TRANSFER_AMOUNT = '3000.00';

// ---------------------------------------------------------------------------

async function signIn(): Promise<void> {
  const body = { email: DEMO_EMAIL, password: DEMO_PASSWORD };
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...body, defaultCurrency: 'EGP' }),
  }).catch(() => fail(`Cannot reach the backend at ${API_URL}. Is it running (npm run dev in the backend repo)?`));

  if (res.status === 201) {
    bearerToken = ((await res.json()) as { accessToken: string }).accessToken;
    console.log(`Created demo user ${DEMO_EMAIL}`);
    return;
  }
  if (res.status !== 409) {
    const err = ((await res.json().catch(() => null)) as ApiErrorResponse | null)?.error;
    fail(`Registration failed: [${res.status}] ${err?.code ?? 'UNKNOWN'}: ${err?.message ?? ''}`);
  }
  const login = await request<{ accessToken: string }>('/api/auth/login', { method: 'POST', body });
  bearerToken = login.accessToken;
  console.log(`Signed in as existing demo user ${DEMO_EMAIL}`);
}

async function main() {
  await signIn();

  const existing = await request<{ accounts: AccountDto[] }>('/api/accounts');
  if (existing.accounts.length > 0) {
    console.log('Demo data already present. Use `npm run seed:demo -- --fresh` for a new user with fresh data.');
    return;
  }

  // Accounts
  const accounts = {} as Record<AccountKey, AccountDto>;
  for (const [key, def] of Object.entries(ACCOUNTS) as [AccountKey, (typeof ACCOUNTS)[AccountKey]][]) {
    accounts[key] = (await request<{ account: AccountDto }>('/api/accounts', { method: 'POST', body: def })).account;
  }

  // Categories (created for every user at registration)
  const { categories } = await request<{ categories: CategoryRecord[] }>('/api/categories');
  const categoryId = {} as Record<CategoryName, string>;
  for (const name of CATEGORY_NAMES) {
    const found = categories.find((c) => c.name === name);
    if (!found) fail(`System category "${name}" not found. Available: ${categories.map((c) => c.name).join(', ')}`);
    categoryId[name] = found.id;
  }

  // Transactions, month by month
  let transactions = 0;
  for (const [monthIndex, monthsAgo] of MONTHS.entries()) {
    for (const e of MONTHLY) {
      if (e.onlyMonths && !e.onlyMonths.includes(monthsAgo)) continue;
      const when = dayInMonth(monthsAgo, e.day);
      if (!when) continue;
      const body: CreateTransactionRequest = {
        accountId: accounts[e.account].id,
        amount: e.amounts[monthIndex],
        direction: e.direction ?? 'debit',
        kind: e.kind ?? 'expense',
        categoryId: categoryId[e.category],
        merchant: e.merchant,
        occurredAt: when.iso,
        countsAsSpending: (e.kind ?? 'expense') === 'expense',
      };
      await request<{ id: string }>('/api/transactions', { method: 'POST', body });
      transactions++;
    }
  }

  // Monthly card payment: checking -> visa. A transfer, so never spending.
  let transfers = 0;
  for (const monthsAgo of MONTHS) {
    const when = dayInMonth(monthsAgo, TRANSFER_DAY);
    if (!when) continue;
    await request('/api/transfers', {
      method: 'POST',
      body: {
        fromAccountId: accounts.checking.id,
        toAccountId: accounts.visa.id,
        amount: TRANSFER_AMOUNT,
        occurredAt: when.iso,
      },
    });
    transfers++;
  }

  // Two tracked subscriptions, anchored on their first charge. TEST CLOUD is
  // left untracked on purpose: it shows up as a subscription suggestion.
  const firstMonth = MONTHS[0];
  const subscriptions: CreateSubscriptionRequest[] = [
    { name: 'Test Stream', amount: '149.99', currency: 'EGP', cycle: 'monthly', anchorDate: dayInMonth(firstMonth, 5)!.dateStr, categoryId: categoryId.Subscriptions, accountId: accounts.visa.id, merchant: 'TEST STREAM' },
    { name: 'Test Gym', amount: '500.00', currency: 'EGP', cycle: 'monthly', anchorDate: dayInMonth(firstMonth, 12)!.dateStr, categoryId: categoryId.Subscriptions, accountId: accounts.visa.id, merchant: 'TEST GYM' },
  ];
  for (const s of subscriptions) await request('/api/subscriptions', { method: 'POST', body: s });

  console.log('\nDone:');
  console.log(`  Accounts        ${Object.keys(accounts).length}`);
  console.log(`  Transactions    ${transactions}`);
  console.log(`  Transfers       ${transfers}`);
  console.log(`  Subscriptions   ${subscriptions.length} (+ TEST CLOUD waiting as a suggestion)`);
  console.log(`\nLog in at http://localhost:3001/login as ${DEMO_EMAIL}`);
  console.log('Password: the DEMO_PASSWORD you set, or the default in scripts/seed-demo.ts.');
}

void main();
