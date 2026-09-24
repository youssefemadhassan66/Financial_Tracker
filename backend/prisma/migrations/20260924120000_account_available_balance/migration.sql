-- What the bank last SAID is still available on an account: the balance
-- of a debit account, the remaining limit of a credit card, read from the
-- end of transaction SMS ("الرصيد المتاح EGP 1000.00"). One row per
-- account; the application replaces it only with a NEWER report.

-- CreateTable
CREATE TABLE "account_available_balances" (
    "account_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reported_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "account_available_balances_pkey" PRIMARY KEY ("account_id")
);

-- AddForeignKey
ALTER TABLE "account_available_balances" ADD CONSTRAINT "account_available_balances_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A balance can be zero, never negative: the SMS formats we read cannot
-- express a negative one, so a negative value here is a bug.
ALTER TABLE "account_available_balances" ADD CONSTRAINT "account_available_balances_amount_check" CHECK ("amount" >= 0);
