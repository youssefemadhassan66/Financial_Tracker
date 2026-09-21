-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('checking', 'savings', 'cash', 'wallet', 'credit_card', 'brokerage');

-- CreateEnum
CREATE TYPE "TransactionKind" AS ENUM ('expense', 'income', 'transfer', 'trade', 'dividend', 'fee', 'interest', 'adjustment');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('sms', 'manual');

-- CreateEnum
CREATE TYPE "RawMessageStatus" AS ENUM ('pending', 'parsed', 'unparsed', 'ignored');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('EGP', 'USD');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "default_currency" "Currency" NOT NULL DEFAULT 'EGP',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "count_fees_as_spending" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "ip_address" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" "Currency" NOT NULL,
    "last4" VARCHAR(4),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_card_details" (
    "account_id" UUID NOT NULL,
    "credit_limit" DECIMAL(18,2),
    "statement_day" SMALLINT,
    "due_day" SMALLINT,
    "apr" DECIMAL(7,4),

    CONSTRAINT "credit_card_details_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "parent_id" UUID,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_category_map" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "merchant_key" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'llm',
    "confidence" DECIMAL(4,3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchant_category_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "kind" "TransactionKind" NOT NULL,
    "counts_as_spending" BOOLEAN NOT NULL,
    "category_id" UUID,
    "merchant_key" TEXT NOT NULL,
    "merchant_raw" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "source" "TransactionSource" NOT NULL,
    "transfer_group_id" UUID,
    "raw_message_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_messages" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_key_id" UUID,
    "sender" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "RawMessageStatus" NOT NULL DEFAULT 'pending',
    "parsed_payload" JSONB,
    "parse_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parse_templates" (
    "id" UUID NOT NULL,
    "sender" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "field_map" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parse_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "limit_amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holdings" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'EGX',
    "quantity" DECIMAL(18,8) NOT NULL,
    "avg_cost_amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "holding_id" UUID NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "price_per_unit" DECIMAL(18,4) NOT NULL,
    "fees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_snapshots" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'EGX',
    "as_of" TIMESTAMPTZ(3) NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "currency" "Currency" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_keys_key_hash_key" ON "device_keys"("key_hash");

-- CreateIndex
CREATE INDEX "device_keys_user_id_idx" ON "device_keys"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_last4_idx" ON "accounts"("user_id", "last4");

-- CreateIndex
CREATE INDEX "categories_user_id_idx" ON "categories"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_name_parent_id_key" ON "categories"("user_id", "name", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_category_map_user_id_merchant_key_key" ON "merchant_category_map"("user_id", "merchant_key");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_raw_message_id_key" ON "transactions"("raw_message_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_occurred_at_idx" ON "transactions"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "transactions_user_id_counts_as_spending_occurred_at_idx" ON "transactions"("user_id", "counts_as_spending", "occurred_at");

-- CreateIndex
CREATE INDEX "transactions_user_id_category_id_occurred_at_idx" ON "transactions"("user_id", "category_id", "occurred_at");

-- CreateIndex
CREATE INDEX "transactions_user_id_merchant_key_idx" ON "transactions"("user_id", "merchant_key");

-- CreateIndex
CREATE INDEX "transactions_account_id_occurred_at_idx" ON "transactions"("account_id", "occurred_at");

-- CreateIndex
CREATE INDEX "transactions_transfer_group_id_idx" ON "transactions"("transfer_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_messages_sha256_key" ON "raw_messages"("sha256");

-- CreateIndex
CREATE INDEX "raw_messages_user_id_received_at_idx" ON "raw_messages"("user_id", "received_at");

-- CreateIndex
CREATE INDEX "raw_messages_status_idx" ON "raw_messages"("status");

-- CreateIndex
CREATE INDEX "parse_templates_sender_priority_idx" ON "parse_templates"("sender", "priority");

-- CreateIndex
CREATE INDEX "budgets_user_id_month_idx" ON "budgets"("user_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_user_id_category_id_month_key" ON "budgets"("user_id", "category_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "holdings_account_id_symbol_exchange_key" ON "holdings"("account_id", "symbol", "exchange");

-- CreateIndex
CREATE UNIQUE INDEX "trades_transaction_id_key" ON "trades"("transaction_id");

-- CreateIndex
CREATE INDEX "trades_holding_id_idx" ON "trades"("holding_id");

-- CreateIndex
CREATE INDEX "price_snapshots_symbol_as_of_idx" ON "price_snapshots"("symbol", "as_of");

-- CreateIndex
CREATE UNIQUE INDEX "price_snapshots_symbol_exchange_as_of_key" ON "price_snapshots"("symbol", "exchange", "as_of");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_keys" ADD CONSTRAINT "device_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_details" ADD CONSTRAINT "credit_card_details_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_category_map" ADD CONSTRAINT "merchant_category_map_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_category_map" ADD CONSTRAINT "merchant_category_map_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_raw_message_id_fkey" FOREIGN KEY ("raw_message_id") REFERENCES "raw_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_messages" ADD CONSTRAINT "raw_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_messages" ADD CONSTRAINT "raw_messages_device_key_id_fkey" FOREIGN KEY ("device_key_id") REFERENCES "device_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
