import type { AppConfig } from './config/env.js';
import type { Clock } from '../application/ports/clock.js';
import { SessionIssuer } from '../application/auth/session-issuer.js';
import { RegisterUser } from '../application/auth/register-user.js';
import { LoginUser } from '../application/auth/login-user.js';
import { RefreshSession } from '../application/auth/refresh-session.js';
import { Logout, LogoutAll } from '../application/auth/logout.js';
import { GetCurrentUser } from '../application/auth/get-current-user.js';
import {
  AuthenticateDevice,
  CreateDeviceKey,
  ListDeviceKeys,
  RevokeDeviceKey,
} from '../application/devices/device-keys.js';
import { StoreRawSms } from '../application/ingest/store-raw-sms.js';
import { ListSmsMessages, ProcessRawSms, ReprocessSms } from '../application/sms/process-sms.js';
import { TransferPairing } from '../application/sms/transfer-pairing.js';
import { TemplateSmsParser } from '../application/sms/template-sms-parser.js';
import { BANK_CATALOG } from '../domain/sms/banks/index.js';
import type { SmsCatalog } from '../domain/sms/sms-template.js';
import {
  CreateAccount,
  CreateCategory,
  ListAccounts,
  ListCategories,
  UpdateAccount,
} from '../application/finance/categories-and-accounts.js';
import { ListTransactions, RecordTransaction, RecordTransfer } from '../application/finance/transactions.js';
import { GetCategoryAnalytics } from '../application/analytics/category-analytics.js';
import {
  ChangeSubscriptionStatus,
  CreateSubscription,
  GetSubscriptionSummary,
  ListSubscriptions,
} from '../application/subscriptions/subscriptions.js';
import {
  DismissSuggestion,
  SuggestSubscriptions,
} from '../application/subscriptions/suggest-subscriptions.js';
import { MatchSubscriptionCharges } from '../application/subscriptions/match-charges.js';
import { CancelInstallmentPlan, CreateInstallmentPlan, ListInstallments } from '../application/plans/installments.js';
import { ListBudgets, SetBudget, StopBudget } from '../application/plans/budgets.js';
import { PrismaBudgetRepository, PrismaInstallmentPlanRepository } from '../infrastructure/persistence/prisma-plan-repositories.js';
import type { AccessTokenService } from '../application/ports/security.js';
import { getPrismaClient } from '../infrastructure/persistence/prisma-client.js';
import { PrismaCardStatementRepository } from '../infrastructure/persistence/prisma-card-statement-repository.js';
import { PdfjsTextReader } from '../infrastructure/pdf/pdfjs-text-reader.js';
import { ImportCardStatements, ListCardStatements } from '../application/statements/import-card-statements.js';
import { DeleteStatementFile, GetStatementFile, ListStatementFiles } from '../application/statements/statement-files.js';
import { PrismaStatementFileRepository } from '../infrastructure/persistence/prisma-statement-file-repository.js';
import { PrismaUserRepository } from '../infrastructure/persistence/prisma-user-repository.js';
import { PrismaRefreshTokenRepository } from '../infrastructure/persistence/prisma-refresh-token-repository.js';
import { PrismaDeviceKeyRepository } from '../infrastructure/persistence/prisma-device-key-repository.js';
import {
  PrismaMerchantCategoryRepository,
  PrismaRawMessageRepository,
} from '../infrastructure/persistence/prisma-raw-message-repository.js';
import {
  PrismaAccountRepository,
  PrismaAvailableBalanceRepository,
  PrismaAnalyticsQueries,
  PrismaCategoryRepository,
  PrismaSubscriptionChargeRepository,
  PrismaSubscriptionRepository,
  PrismaSuggestionDismissalRepository,
  PrismaTransactionRepository,
  PrismaUserSettingsRepository,
} from '../infrastructure/persistence/prisma-finance-repositories.js';
import { Argon2PasswordHasher } from '../infrastructure/security/argon2-password-hasher.js';
import { JoseAccessTokenService } from '../infrastructure/security/jose-access-token-service.js';
import { HmacOpaqueTokenService } from '../infrastructure/security/hmac-opaque-token-service.js';
import { systemClock } from '../infrastructure/system-clock.js';

/**
 * The COMPOSITION ROOT.
 *
 * The only place that knows which concrete class fulfils each interface.
 * Use cases ask for "a PasswordHasher"; this file decides it is argon2.
 * Swapping argon2 for something else is a one-line change here, and no
 * use case notices.
 *
 * Plain constructor calls rather than a DI framework: at this size a
 * framework would add magic without adding value, and this way every
 * dependency is visible by reading one file.
 */
export interface Container {
  accessTokens: AccessTokenService;
  registerUser: RegisterUser;
  loginUser: LoginUser;
  refreshSession: RefreshSession;
  logout: Logout;
  logoutAll: LogoutAll;
  getCurrentUser: GetCurrentUser;
  createDeviceKey: CreateDeviceKey;
  listDeviceKeys: ListDeviceKeys;
  revokeDeviceKey: RevokeDeviceKey;
  authenticateDevice: AuthenticateDevice;
  storeRawSms: StoreRawSms;
  processRawSms: ProcessRawSms;
  transferPairing: TransferPairing;
  reprocessSms: ReprocessSms;
  listSmsMessages: ListSmsMessages;
  listCategories: ListCategories;
  createCategory: CreateCategory;
  listAccounts: ListAccounts;
  importCardStatements: ImportCardStatements;
  listCardStatements: ListCardStatements;
  listStatementFiles: ListStatementFiles;
  getStatementFile: GetStatementFile;
  deleteStatementFile: DeleteStatementFile;
  createAccount: CreateAccount;
  updateAccount: UpdateAccount;
  recordTransaction: RecordTransaction;
  recordTransfer: RecordTransfer;
  listTransactions: ListTransactions;
  getCategoryAnalytics: GetCategoryAnalytics;
  createSubscription: CreateSubscription;
  listSubscriptions: ListSubscriptions;
  changeSubscriptionStatus: ChangeSubscriptionStatus;
  getSubscriptionSummary: GetSubscriptionSummary;
  matchSubscriptionCharges: MatchSubscriptionCharges;
  suggestSubscriptions: SuggestSubscriptions;
  dismissSuggestion: DismissSuggestion;
  listBudgets: ListBudgets;
  setBudget: SetBudget;
  stopBudget: StopBudget;
  listInstallments: ListInstallments;
  createInstallmentPlan: CreateInstallmentPlan;
  cancelInstallmentPlan: CancelInstallmentPlan;
}

export function buildContainer(
  config: AppConfig,
  // Typed via the factory's return type, so the API layer never imports
  // @prisma/client itself — it only knows the infrastructure function.
  prisma: ReturnType<typeof getPrismaClient> = getPrismaClient(),
  clock: Clock = systemClock,
  // Injectable so tests can run the whole pipeline with a known catalog.
  smsCatalog: SmsCatalog = BANK_CATALOG,
): Container {
  const users = new PrismaUserRepository(prisma);
  const refreshTokens = new PrismaRefreshTokenRepository(prisma);
  const deviceKeys = new PrismaDeviceKeyRepository(prisma);
  const rawMessages = new PrismaRawMessageRepository(prisma);
  const categories = new PrismaCategoryRepository(prisma);
  const accounts = new PrismaAccountRepository(prisma);
  const availableBalances = new PrismaAvailableBalanceRepository(prisma);
  const cardStatements = new PrismaCardStatementRepository(prisma);
  const statementFiles = new PrismaStatementFileRepository(prisma);
  const transactions = new PrismaTransactionRepository(prisma);
  const settings = new PrismaUserSettingsRepository(prisma);
  const subscriptions = new PrismaSubscriptionRepository(prisma);
  const subscriptionCharges = new PrismaSubscriptionChargeRepository(prisma);
  const suggestionDismissals = new PrismaSuggestionDismissalRepository(prisma);
  const analytics = new PrismaAnalyticsQueries(prisma);
  const budgets = new PrismaBudgetRepository(prisma);
  const installmentPlans = new PrismaInstallmentPlanRepository(prisma);
  const merchantCategories = new PrismaMerchantCategoryRepository(prisma);

  const processRawSms = new ProcessRawSms(
    rawMessages,
    new TemplateSmsParser(smsCatalog),
    accounts,
    categories,
    merchantCategories,
    settings,
    availableBalances,
    clock,
  );

  const passwords = new Argon2PasswordHasher();
  const accessTokens = new JoseAccessTokenService(config.jwtAccessSecret, config.accessTokenTtlSeconds, clock);
  const opaqueTokens = new HmacOpaqueTokenService(config.tokenHashPepper);

  const sessions = new SessionIssuer(accessTokens, opaqueTokens, refreshTokens, clock, config.refreshTokenTtlSeconds);

  return {
    accessTokens,
    registerUser: new RegisterUser(users, passwords, sessions),
    loginUser: new LoginUser(users, passwords, sessions),
    refreshSession: new RefreshSession(refreshTokens, users, opaqueTokens, sessions, clock),
    logout: new Logout(refreshTokens, opaqueTokens, clock),
    logoutAll: new LogoutAll(refreshTokens, clock),
    getCurrentUser: new GetCurrentUser(users),
    createDeviceKey: new CreateDeviceKey(deviceKeys, opaqueTokens),
    listDeviceKeys: new ListDeviceKeys(deviceKeys),
    revokeDeviceKey: new RevokeDeviceKey(deviceKeys, clock),
    authenticateDevice: new AuthenticateDevice(deviceKeys, opaqueTokens, clock),
    storeRawSms: new StoreRawSms(rawMessages, clock),
    processRawSms,
    transferPairing: new TransferPairing(rawMessages, accounts, clock),
    reprocessSms: new ReprocessSms(rawMessages, processRawSms),
    listSmsMessages: new ListSmsMessages(rawMessages),
    listCategories: new ListCategories(categories),
    createCategory: new CreateCategory(categories),
    listAccounts: new ListAccounts(accounts, availableBalances),
    importCardStatements: new ImportCardStatements(
      accounts,
      cardStatements,
      new PdfjsTextReader(),
      settings,
      statementFiles,
      installmentPlans,
    ),
    listCardStatements: new ListCardStatements(accounts, cardStatements),
    listStatementFiles: new ListStatementFiles(accounts, statementFiles),
    getStatementFile: new GetStatementFile(statementFiles),
    deleteStatementFile: new DeleteStatementFile(statementFiles),
    createAccount: new CreateAccount(accounts),
    updateAccount: new UpdateAccount(accounts, availableBalances),
    recordTransaction: new RecordTransaction(accounts, categories, transactions, settings),
    recordTransfer: new RecordTransfer(accounts, transactions),
    listTransactions: new ListTransactions(transactions),
    getCategoryAnalytics: new GetCategoryAnalytics(analytics, categories, clock),
    createSubscription: new CreateSubscription(subscriptions, categories, accounts, clock),
    listSubscriptions: new ListSubscriptions(subscriptions, subscriptionCharges, clock),
    changeSubscriptionStatus: new ChangeSubscriptionStatus(subscriptions, subscriptionCharges, clock),
    getSubscriptionSummary: new GetSubscriptionSummary(subscriptions, clock),
    matchSubscriptionCharges: new MatchSubscriptionCharges(subscriptions, subscriptionCharges, clock),
    suggestSubscriptions: new SuggestSubscriptions(subscriptions, subscriptionCharges, suggestionDismissals, clock),
    dismissSuggestion: new DismissSuggestion(suggestionDismissals),
    listBudgets: new ListBudgets(budgets, categories, analytics, clock),
    setBudget: new SetBudget(budgets, categories, clock),
    stopBudget: new StopBudget(budgets, clock),
    listInstallments: new ListInstallments(installmentPlans, clock),
    createInstallmentPlan: new CreateInstallmentPlan(installmentPlans, accounts, clock),
    cancelInstallmentPlan: new CancelInstallmentPlan(installmentPlans, clock),
  };
}
