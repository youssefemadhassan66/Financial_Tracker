-- One account, several numbers.
--
-- A CIB bank account shows up in SMS under two different last-4s: the
-- debit CARD digits on a purchase and the ACCOUNT digits on an InstaPay
-- transfer. A single "last4" column forces one of them to stay unparsed,
-- so it becomes a list.
--
-- Written by hand rather than generated: Prisma would drop "last4" and
-- add "last4s" empty, losing the digits users already entered. This
-- copies them across first.

ALTER TABLE "accounts" ADD COLUMN "last4s" VARCHAR(4)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(4)[];

UPDATE "accounts" SET "last4s" = ARRAY["last4"] WHERE "last4" IS NOT NULL;

DROP INDEX "accounts_user_id_last4_idx";

ALTER TABLE "accounts" DROP COLUMN "last4";

-- The domain already validates this; the database is the last line of
-- defence against a script or a bug writing "12" or "abcd".
-- array_to_string silently skips NULL elements, hence the second check.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_last4s_digits_check" CHECK (
  array_to_string("last4s", ',') ~ '^([0-9]{4}(,[0-9]{4})*)?$'
  AND array_position("last4s", NULL) IS NULL
);
