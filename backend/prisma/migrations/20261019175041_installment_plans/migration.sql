-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('active', 'cancelled');

-- CreateTable
CREATE TABLE "installment_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "installment_amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "total_installments" INTEGER NOT NULL,
    "first_due_date" DATE NOT NULL,
    "account_id" UUID,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'active',
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "installment_plans_user_id_status_idx" ON "installment_plans"("user_id", "status");

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
