-- An internal transfer (account -> credit card) arrives as TWO SMS: the
-- debit on the account and the payment on the card. Each waits in this
-- status until its other half arrives, then both become one transfer
-- pair. Neither is ever recorded alone as spending or income.
ALTER TYPE "RawMessageStatus" ADD VALUE 'awaiting_pair';
