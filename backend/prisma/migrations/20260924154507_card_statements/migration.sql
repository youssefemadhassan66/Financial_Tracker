-- AlterEnum
ALTER TYPE "TransactionSource" ADD VALUE 'statement';

-- CreateTable
CREATE TABLE "card_statements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "period_year" SMALLINT NOT NULL,
    "period_month" SMALLINT NOT NULL,
    "due_date" DATE NOT NULL,
    "credit_limit" DECIMAL(18,2) NOT NULL,
    "available_credit" DECIMAL(18,2) NOT NULL,
    "total_due" DECIMAL(18,2) NOT NULL,
    "minimum_due" DECIMAL(18,2) NOT NULL,
    "opening_balance" DECIMAL(18,2) NOT NULL,
    "closing_balance" DECIMAL(18,2) NOT NULL,
    "imported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_statement_lines" (
    "id" UUID NOT NULL,
    "statement_id" UUID NOT NULL,
    "line_no" SMALLINT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "posting_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "transaction_id" UUID,

    CONSTRAINT "card_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_statements_user_id_idx" ON "card_statements"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "card_statements_account_id_period_year_period_month_key" ON "card_statements"("account_id", "period_year", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "card_statement_lines_transaction_id_key" ON "card_statement_lines"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "card_statement_lines_statement_id_line_no_key" ON "card_statement_lines"("statement_id", "line_no");

-- AddForeignKey
ALTER TABLE "card_statements" ADD CONSTRAINT "card_statements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_statements" ADD CONSTRAINT "card_statements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_statement_lines" ADD CONSTRAINT "card_statement_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "card_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_statement_lines" ADD CONSTRAINT "card_statement_lines_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rules the database keeps even if application code gets them wrong.
ALTER TABLE "card_statements" ADD CONSTRAINT "card_statements_period_month_check" CHECK ("period_month" BETWEEN 1 AND 12);
ALTER TABLE "card_statements" ADD CONSTRAINT "card_statements_amounts_check" CHECK (
  "credit_limit" >= 0 AND "available_credit" >= 0 AND "total_due" >= 0 AND "minimum_due" >= 0
);
ALTER TABLE "card_statement_lines" ADD CONSTRAINT "card_statement_lines_amount_check" CHECK ("amount" > 0);
