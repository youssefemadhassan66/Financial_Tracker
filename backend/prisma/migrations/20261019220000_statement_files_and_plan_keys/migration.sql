-- Keeps uploaded statement PDFs (statement_files) and links each
-- imported month to its file. external_key stops a plan read from a
-- statement from being added again by next month's statement.

-- AlterTable
ALTER TABLE "card_statements" ADD COLUMN     "file_id" UUID;

-- AlterTable
ALTER TABLE "installment_plans" ADD COLUMN     "external_key" TEXT;

-- CreateTable
CREATE TABLE "statement_files" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "content" BYTEA NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statement_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "statement_files_account_id_idx" ON "statement_files"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "statement_files_user_id_sha256_key" ON "statement_files"("user_id", "sha256");

-- CreateIndex
CREATE INDEX "card_statements_file_id_idx" ON "card_statements"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "installment_plans_user_id_external_key_key" ON "installment_plans"("user_id", "external_key");

-- AddForeignKey
ALTER TABLE "card_statements" ADD CONSTRAINT "card_statements_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "statement_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_files" ADD CONSTRAINT "statement_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_files" ADD CONSTRAINT "statement_files_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

