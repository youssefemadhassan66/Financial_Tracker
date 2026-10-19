# Backend request 002: installment plans from card statements

## Problem

CIB card statements end with an **Installment Summary** table:

| Merchant name | Enrollment date | Principal | Interest | Total | Installment no. | Out of |
|---|---|---|---|---|---|---|
| TEST MERCHANT | 11/08 | 800.00 | .00 | 800.00 | 2 | 6 |

`parseCibCardStatements` reads every transaction line and the summary totals correctly,
but it skips this table. As a result:

- The monthly installment is not shown anywhere in the app.
- Users can't see why "Total amount due" is lower than the closing balance (part of
  the balance is a plan that is billed month by month).
- Users can't see how much is still left on a plan.

## Ask

1. Parse the Installment Summary rows into the statement:
   `installments: [{ merchant, enrolledOn, principal, interest, total, number, of }]`,
   with money as decimal strings like everywhere else.
2. Store them with the statement and return them in `GET /api/accounts/:id/statements`.
3. Optional: a derived `remaining` per plan (`total × (of − number)`).

## Notes

- The enrollment date appears as `DD/MM` with no year. Take the year from the statement
  period, and use the previous year if that would put the date after the statement.
- Tests must use fake merchants and amounts only (see FRONTEND-KICKOFF security rules).
