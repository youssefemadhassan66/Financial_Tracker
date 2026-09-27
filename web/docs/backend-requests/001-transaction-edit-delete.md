# Backend request 001: edit and delete transactions

**From:** frontend slice F2 (accounts + transactions + manual entry)
**Status:** requested, 2026-09-27
**Blocks:** editing/deleting in the Transactions page. F2 ships "add" first; edit/delete UI waits for this.

## Why

F2 lets the user add transactions by hand (cash, missed SMS). Without edit or delete, one typo
(1500 instead of 150) stays in every total forever, and a manual entry that duplicates an SMS
can't be removed. `API.md` section 12 lists both as missing; this also covers "changing a
transaction's category", which is listed there too.

## 1. `PATCH /api/transactions/:id` (auth)

Body: at least one key; strict (unknown keys 400), like every other endpoint.

| Field | Type | Editable when |
|---|---|---|
| `categoryId` | uuid or `null` (uncategorize) | always |
| `countsAsSpending` | boolean | always |
| `merchant` | string, max 120 | always (recompute `merchantKey`) |
| `amount` | decimal string | `source = manual` only |
| `occurredAt` | ISO instant | `source = manual` only |
| `direction` | `debit` / `credit` | `source = manual` only |

- `categoryId`, `countsAsSpending`, `merchant` are the user's interpretation, so they are editable
  on any row, including SMS and statement rows.
- `amount`, `occurredAt`, `direction` are facts owned by the bank on `sms` / `statement` rows:
  changing them there is `400 DOMAIN_RULE_VIOLATION` ("This amount comes from your bank; it can't
  be edited").
- `kind`, `accountId`, `currency` stay immutable for every source (schema comment: kind is "an
  immutable fact"). To fix those on a manual row: delete and add again.
- A row with `transferGroupId` set: `categoryId`/`merchant` fine; `amount`/`occurredAt` →
  400 (the two sides must stay equal; see 3).
- `categoryId` must be one of the user's categories, else 404 (same rule as elsewhere).
- Another user's transaction → 404.

`200` → `{ "transaction": TransactionView }` (same shape as the list).

## 2. `DELETE /api/transactions/:id` (auth)

- Only `source = manual` and no `transferGroupId`. Otherwise `400 DOMAIN_RULE_VIOLATION`
  (SMS/statement rows are backed by a message or statement line; deleting them would let a
  reprocess recreate them).
- Hard delete is fine for manual rows (nothing external points at them). A `subscriptionId` link
  is simply gone with the row.
- `204`. Another user's → 404.

## 3. `DELETE /api/transfers/:transferGroupId` (auth)

- Deletes both sides of a transfer created with `POST /api/transfers` (both rows `source = manual`).
- If either side came from SMS/statement → 400.
- `204`. Unknown or another user's group → 404.

## 4. Pagination cursor can skip rows (bug-level, please include)

`GET /api/transactions?before=<occurredAt>` returns rows *strictly older* than the last row's
`occurredAt`. Rows that share that exact instant and fall across a page boundary are never
shown. This is common: both sides of a transfer share one `occurredAt`, and statement lines
often carry a date with no time. Suggested fix: a compound cursor, e.g. an opaque
`nextCursor` in the response (encoding `occurredAt` + `id`, ordered by `occurredAt DESC, id DESC`),
while keeping `before` working for now.

## 5. Nice to have (not blocking)

- `source` filter on `GET /api/transactions` (`?source=manual`), so the UI can show "Added by you".

## Acceptance

- Tests: tenancy (other user's id → 404 for all three), strict bodies, each source rule above,
  `categoryId: null` uncategorizes, merchant edit updates `merchantKey`, analytics totals change
  after edit/delete.
- `docs/API.md` updated in the same change (sections 6 and 12).
