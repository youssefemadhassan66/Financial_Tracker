-- A charge made in another currency on an EGP card. The SMS gives only
-- the foreign figure ("charged for USD 22.80"); the EGP amount the bank
-- billed appears on the card statement. The SMS waits in this status
-- until a statement line with the same foreign amount turns it into a
-- transaction.
ALTER TYPE "RawMessageStatus" ADD VALUE 'awaiting_statement';

-- What the merchant charged, when that was another currency. The row's
-- amount/currency stay the billed figure: the money that left the account.
ALTER TABLE "transactions" ADD COLUMN     "original_amount" DECIMAL(18,2),
ADD COLUMN     "original_currency" "Currency";

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_original_both_or_neither"
  CHECK (("original_amount" IS NULL) = ("original_currency" IS NULL));
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_original_amount_positive"
  CHECK ("original_amount" > 0);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_original_currency_differs"
  CHECK ("original_currency" <> "currency");
