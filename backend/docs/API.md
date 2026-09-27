# Financial App API Reference

The contract the frontend builds against. Written from the code on `develop`
(routes in `src/api/routes`, request schemas in `src/api/validation`, response
shapes in `src/application`). When code and this file disagree, the code wins:
fix this file in the same change.

All examples use FAKE data.

---

## 1. Basics

| Item | Value |
|---|---|
| Base URL (local) | `http://localhost:3000` |
| Allowed browser origin (local) | `http://localhost:3001` (env `CORS_ORIGIN`, comma-separated) — so run the frontend on port **3001** |
| Content type | `application/json` (except the statement upload: `application/pdf`) |
| Max JSON body | 64 KB |
| Health check | `GET /health` → `{ "status": "ok", "uptime": 12.3 }` (no auth) |

### Data conventions

- **Money is a decimal STRING**, never a number: `"450.75"`. Request amounts must match
  `^(0|[1-9]\d{0,15})(\.\d{1,2})?$`. Never do arithmetic on money with JS numbers in the
  frontend; format it for display only.
- **Currency**: `"EGP" | "USD"`. Amounts of different currencies are never added
  together anywhere in the API; the frontend must not add them either.
- **Instants** (a moment): ISO 8601 with offset, e.g. `"2026-09-20T14:30:00.000Z"`. Response
  `Date` fields arrive as ISO strings.
- **Calendar dates** (a day): `"YYYY-MM-DD"`, validated as a real date (`2026-02-30` is rejected).
  Days are in the **Africa/Cairo** time zone. Display instants in Cairo time too.
- **Ids** are UUIDs.
- **Strict bodies**: an unknown key in a request body or query is a `400`, not ignored.
- **Text fields** are trimmed, may not contain control characters, and have max lengths
  (listed per endpoint).
- **Another user's resource** always behaves as **not found (404)**, never 403.

### Enums

| Name | Values |
|---|---|
| Account type | `checking`, `savings`, `cash`, `wallet`, `credit_card`, `brokerage` |
| Transaction kind | `expense`, `income`, `transfer`, `trade`, `dividend`, `fee`, `interest`, `adjustment` |
| Direction | `debit` (money out), `credit` (money in) |
| Transaction source | `sms`, `manual`, `statement` (how it was recorded) |
| Billing cycle | `weekly`, `monthly`, `quarterly`, `yearly` |
| Subscription status | `active`, `paused`, `cancelled` |
| SMS status | `pending`, `parsed`, `unparsed`, `ignored`, `awaiting_pair`, `awaiting_statement` |
| Category kind | `spending`, `income` |

---

## 2. Errors

Every error has one shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "issues": [{ "path": "amount", "message": "Amount must be a decimal string like \"450.75\"" }]
  }
}
```

`issues` appears only on validation errors. Show `issues[].message` next to the field
named by `issues[].path`.

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Body/query/params failed the schema |
| 400 | `MALFORMED_JSON` | Body is not JSON |
| 400 | `DOMAIN_RULE_VIOLATION` | A business rule refused it (message says why) |
| 400 | `INVALID_PDF` | The statement upload is not a readable PDF |
| 401 | `UNAUTHENTICATED` | Missing/expired/invalid token, bad login. Has `WWW-Authenticate: Bearer` |
| 403 | `FORBIDDEN` | Not allowed |
| 404 | `NOT_FOUND` | Unknown route, or a resource that is not yours |
| 409 | `CONFLICT` | Duplicate or clash (email taken, category name used, a pairing already taken) |
| 413 | `PAYLOAD_TOO_LARGE` | Body too big |
| 429 | `RATE_LIMITED` | Too many requests. `RateLimit` headers (IETF draft-8) say when to retry |
| 500 | `INTERNAL_ERROR` | Bug. No details are ever sent |

Rate limits per IP, per 15 minutes: global 300, login 10, register 5, refresh 60.

---

## 3. Authentication

Two credentials exist:

- **User access token (JWT)** — for everything the frontend does. Send as
  `Authorization: Bearer <accessToken>`. Lives **15 minutes**.
- **Refresh token** — an **httpOnly cookie** named `refresh_token`
  (`SameSite=Strict`, `Path=/api/auth`, `Secure` in production). JavaScript can never
  read it; the browser sends it automatically to `/api/auth/*` **if the request uses
  credentials** (`fetch(..., { credentials: 'include' })`). Lives 30 days and **rotates**
  on every refresh.
- (Device keys are only for the phone's SMS forwarder. The frontend only manages them.)

### Rules the frontend MUST follow

1. Keep the access token **in memory only** (a variable / React state). Never
   `localStorage`, never `sessionStorage`, never a non-httpOnly cookie.
2. Call every `/api/auth/*` endpoint with `credentials: 'include'`, or the cookie is not
   sent or saved.
3. On app start (page load), call `POST /api/auth/refresh` to get an access token
   silently. `401` means "not logged in" → show login.
4. On any `401` from another endpoint: call refresh **once**, retry the request once with
   the new token; if refresh fails, go to login. Several requests failing at the same
   time must share **one** refresh call (refresh tokens rotate; two parallel refreshes
   with the same cookie look like token theft and the server revokes the whole session).
5. Refresh a little before `accessTokenExpiresAt` if you like; still handle the 401 path.

### `POST /api/auth/register`
Body:
```json
{ "email": "test@example.com", "password": "at-least-12-chars", "defaultCurrency": "EGP" }
```
- `email` max 254; `password` 12–128 characters; `defaultCurrency` optional, default `EGP`.

`201`, sets the refresh cookie:
```json
{
  "user": { "id": "uuid", "email": "test@example.com", "defaultCurrency": "EGP" },
  "accessToken": "eyJ...",
  "accessTokenExpiresAt": "2026-09-27T12:15:00.000Z"
}
```
`409` if the email is taken.

### `POST /api/auth/login`
Body `{ "email", "password" }` → `200`, same shape as register. `401` on wrong credentials.

### `POST /api/auth/refresh`
No body. Uses the cookie. `200`:
```json
{ "accessToken": "eyJ...", "accessTokenExpiresAt": "2026-09-27T12:15:00.000Z" }
```
`401` (and the cookie is cleared) if missing/expired/revoked.

### `POST /api/auth/logout`
No body, no auth header needed. Revokes this session's refresh token, clears the cookie.
`204`.

### `POST /api/auth/logout-all` (auth)
Signs out every device of this user. `204`.

### `GET /api/auth/me` (auth)
`200` → `{ "user": { "id", "email", "defaultCurrency" } }`

---

## 4. Accounts

`AccountDto`:
```json
{
  "id": "uuid",
  "name": "Test Visa",
  "type": "credit_card",
  "currency": "EGP",
  "last4s": ["1111"],
  "isLiability": true,
  "archived": false,
  "available": { "amount": "12500.00", "reportedAt": "2026-09-20T10:00:00.000Z" }
}
```
- `last4s`: last 4 digits of the card/account numbers this account owns. SMS are
  matched to accounts through these, so an account without them never receives SMS.
- `isLiability`: true for credit cards (money you owe).
- `available`: what the bank's latest SMS said is available; `null` until one does.

### `GET /api/accounts` (auth)
`200` → `{ "accounts": AccountDto[] }` (oldest first).

### `POST /api/accounts` (auth)
Body: `{ "name": "Test Visa", "type": "credit_card", "currency": "EGP", "last4s": ["1111"] }`
- `name` max 60; `last4s` optional, each exactly 4 digits, at most 10.

`201` → `{ "account": AccountDto }`

### `PATCH /api/accounts/:id` (auth)
Body: at least one of `{ "name"?: string, "last4s"?: string[] }` (replaces the whole list).
`200` → `{ "account": AccountDto }`. After adding digits, suggest running SMS reprocess.

---

## 5. Categories

`CategoryRecord`: `{ "id", "name", "kind": "spending"|"income", "icon": string|null, "color": "#1A2B3C"|null, "isSystem": boolean }`

- `GET /api/categories` (auth) → `{ "categories": CategoryRecord[] }` (by kind, then name).
- `POST /api/categories` (auth) body
  `{ "name": "Test Food", "kind"?: "spending", "icon"?: "🍔"|null, "color"?: "#FF8800"|null }`
  (`name` max 40, `icon` max 16) → `201 { "category": CategoryRecord }`; `409` if the name exists.

---

## 6. Transactions

`TransactionView`:
```json
{
  "id": "uuid",
  "accountId": "uuid",
  "accountName": "Test Visa",
  "amount": "1036.44",
  "currency": "EGP",
  "direction": "debit",
  "kind": "expense",
  "countsAsSpending": true,
  "category": { "id": "uuid", "name": "Subscriptions", "icon": null },
  "merchant": "TEST AI",
  "occurredAt": "2026-09-10T10:00:00.000Z",
  "source": "sms",
  "transferGroupId": null,
  "original": { "amount": "21.60", "currency": "USD" }
}
```
- `amount` is always what the account was charged; `original` is the foreign price when
  the merchant charged another currency (else `null`). Show both when `original` is set.
- `transferGroupId` links the two sides of a transfer.
- `countsAsSpending`: whether it counts in spending reports.

### `GET /api/transactions` (auth)
Query (all optional):

| Param | Type | Meaning |
|---|---|---|
| `from`, `to` | `YYYY-MM-DD` | Cairo days, inclusive |
| `accountId`, `categoryId` | uuid | Filters |
| `before` | ISO instant | **Cursor**: only transactions strictly older than this |
| `limit` | 1–200, default 50 | Page size |

`200` → `{ "transactions": TransactionView[] }`, newest first.
**Pagination**: for the next page, pass `before` = the last item's `occurredAt`. A page
shorter than `limit` is the last page.

### `POST /api/transactions` (auth)
Body:
```json
{
  "accountId": "uuid",
  "amount": "149.99",
  "direction": "debit",
  "kind": "expense",
  "categoryId": "uuid",
  "merchant": "TEST STREAM",
  "occurredAt": "2026-09-10T10:00:00Z",
  "countsAsSpending": true
}
```
`categoryId` and `countsAsSpending` optional; `merchant` max 120. `201` → `{ "id": "uuid" }`.

### `POST /api/transfers` (auth)
Body: `{ "fromAccountId", "toAccountId", "amount", "occurredAt" }` →
`201 { "transferGroupId": "uuid" }`. Moving money between your own accounts is not spending.

---

## 7. Analytics

### `GET /api/analytics/categories` (auth)
Query: `from`, `to` (`YYYY-MM-DD`, optional). Default: the current Cairo month. At most
366 days. `to` before `from` → 400.

`200`:
```json
{
  "period": { "from": "2026-09-01", "to": "2026-09-30" },
  "previousPeriod": { "from": "2026-08-02", "to": "2026-08-31" },
  "timeZone": "Africa/Cairo",
  "currencies": [
    {
      "currency": "EGP",
      "spending": {
        "total": "8450.00",
        "previousTotal": "7900.00",
        "changePercent": 7,
        "categories": [
          {
            "categoryId": "uuid",
            "name": "Groceries",
            "icon": null,
            "total": "3200.00",
            "share": 37.9,
            "count": 12,
            "previousTotal": "2800.00",
            "changePercent": 14.3
          }
        ]
      },
      "investing": { "invested": "0.00", "withdrawn": "0.00", "net": "0.00", "count": 0 },
      "income": { "total": "20000.00", "count": 1 }
    }
  ]
}
```
- One block **per currency** — show EGP and USD separately, never summed.
- `previousPeriod` is the same number of days just before `period`.
- `changePercent` is `null` when the previous total was zero.
- `categoryId: null` with `name: "Uncategorized"` for uncategorized spending.
- `total` is net: refunds subtract. Investing is separate from spending on purpose.

---

## 8. Subscriptions

`SubscriptionDto`:
```json
{
  "id": "uuid",
  "name": "Test Stream",
  "amount": "149.99",
  "currency": "EGP",
  "cycle": "monthly",
  "anchorDate": "2026-08-10",
  "status": "active",
  "nextChargeDate": "2026-10-10",
  "monthlyEquivalent": "149.99",
  "yearlyCost": "1799.88",
  "categoryId": "uuid",
  "accountId": null,
  "notes": null,
  "lastCharge": {
    "transactionId": "uuid",
    "occurredAt": "2026-09-10T10:00:00.000Z",
    "amount": "149.99",
    "currency": "EGP",
    "original": null
  },
  "priceChanged": false,
  "missedCharge": null
}
```
- `nextChargeDate`: `null` unless active.
- `lastCharge`: newest transaction linked to it (`null` if none yet).
- `priceChanged`: the last charge was not the subscription's price — show a warning.
- `missedCharge`: latest billing date that passed (plus 3 days grace) with no charge —
  show a warning. `null` if none.

| Endpoint | Body / query | Response |
|---|---|---|
| `GET /api/subscriptions` | `?status=active\|paused\|cancelled` optional | `{ "subscriptions": SubscriptionDto[] }` |
| `POST /api/subscriptions` | see below | `201 { "subscription": SubscriptionDto }` |
| `POST /api/subscriptions/:id/pause` | — | `{ "subscription" }` |
| `POST /api/subscriptions/:id/resume` | — | `{ "subscription" }` |
| `POST /api/subscriptions/:id/cancel` | — | `{ "subscription" }` (final, cannot be undone) |
| `POST /api/subscriptions/match` | — | `{ "linked": 2 }` links unlinked charges to subscriptions |
| `GET /api/subscriptions/summary` | `?days=30` (1–366) | see below |
| `GET /api/subscriptions/suggestions` | — | `{ "suggestions": Suggestion[] }` |
| `POST /api/subscriptions/suggestions/dismiss` | `{ "merchantKey": "TEST GYM" }` | `204` |

Wrong status transitions (e.g. resume an active one) → `400 DOMAIN_RULE_VIOLATION`.

### Create body
```json
{
  "name": "Test Stream",
  "amount": "149.99",
  "currency": "EGP",
  "cycle": "monthly",
  "anchorDate": "2026-08-10",
  "categoryId": "uuid",
  "accountId": "uuid",
  "merchant": "TEST STREAM",
  "notes": "family plan"
}
```
- `name` max 60, `merchant` max 120 (optional; used to match charges, defaults from
  the name), `notes` max 500 multiline. `categoryId`, `accountId` optional — **omit them,
  do not send `null`**.
- `anchorDate` = the first billing date; later dates are computed from it.
- After creating, the server links matching past charges automatically.

### Summary
```json
{
  "asOf": "2026-09-27",
  "activeCount": 3,
  "totals": [{ "currency": "EGP", "monthly": "449.97", "yearly": "5399.64" }],
  "upcoming": [
    { "subscriptionId": "uuid", "name": "Test Stream", "date": "2026-10-10", "amount": "149.99", "currency": "EGP" }
  ]
}
```

### Suggestions
Charges that repeat (same merchant, steady price, regular interval) and are not tracked:
```json
{
  "merchantKey": "TEST GYM",
  "name": "Test Gym",
  "amount": "500.00",
  "currency": "EGP",
  "cycle": "monthly",
  "anchorDate": "2026-06-20",
  "lastChargeDate": "2026-08-20",
  "chargeCount": 3,
  "accountId": "uuid",
  "transactionIds": ["uuid", "uuid", "uuid"]
}
```
- **Accept** = `POST /api/subscriptions` with `name`, `amount`, `currency`, `cycle`,
  `anchorDate`, `merchant: merchantKey`, and `accountId` **only when not null**. Let the
  user edit the name first. Its past charges get linked, and the suggestion disappears.
- **Dismiss** = `POST /api/subscriptions/suggestions/dismiss` with its `merchantKey`.
  Never suggested again.

---

## 9. SMS inbox

The phone forwards bank SMS; the server parses them into transactions. The frontend
shows what happened and lets the user fix what the server could not.

`RawMessageView`:
```json
{
  "id": "uuid",
  "userId": "uuid",
  "sender": "TESTBANK",
  "body": "Your card ending 1111 was charged EGP 149.99 at TEST STREAM ...",
  "receivedAt": "2026-09-10T10:00:00.000Z",
  "status": "parsed",
  "parsedPayload": { "template": "purchase", "amount": "149.99" },
  "parseError": null,
  "transactionId": "uuid"
}
```
- `parsedPayload`: free-form string map of what the parser read; show it as key/value
  details, do not depend on its keys.
- `parseError`: why it is `unparsed` / `ignored` / awaiting.

| Status | Meaning for the user |
|---|---|
| `parsed` | Became a transaction (`transactionId` set) |
| `unparsed` | Could not be read. Nothing to do yet (future: AI fallback) |
| `ignored` | Not a transaction (OTP, ad, …) |
| `awaiting_pair` | Half of a transfer, waiting for its other half. User can pair manually |
| `awaiting_statement` | Foreign-currency card charge; the EGP amount comes with the card statement |
| `pending` | Not processed yet |

| Endpoint | Body / query | Response |
|---|---|---|
| `GET /api/sms` | `?status=...&limit=50` (1–200) | `{ "messages": RawMessageView[] }` |
| `POST /api/sms/reprocess` | `{ "after"?: "uuid" }` | see below |
| `POST /api/sms/pair` | `{ "debitMessageId", "paymentMessageId" }` | `201 { "transferGroupId": "uuid", "transactionIds": ["uuid", "uuid"] }` |

### Reprocess
Re-runs every stored message that is not yet a transaction, at most 200 per call:
```json
{ "processed": 200, "parsed": 150, "unparsed": 20, "ignored": 25, "awaitingPair": 3, "awaitingStatement": 2, "next": "uuid" }
```
While `next` is not `null`, call again with `{ "after": next }`. Show a progress count.
Run it after adding card digits to an account.

### Manual pair
For two `awaiting_pair` messages the user says belong together (the debit SMS and the
payment SMS). Errors come back as 400/404/409 with a message; show it.

---

## 10. Credit card statements

### `POST /api/accounts/:id/statements` (auth)
Upload the bank's statement PDF for a **credit card** account. The body is the raw file:
```
Content-Type: application/pdf
<the PDF bytes>
```
(e.g. `fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/pdf', Authorization }, body: file })`
with the `File` from an `<input type="file" accept="application/pdf">`). Max 5 MB. A
non-PDF → 400.

One PDF may hold several months. `201`:
```json
{
  "statements": [
    { "period": "2026-07", "status": "imported", "confirmed": 25, "created": 4, "unmatchedPayments": 1, "pricedSms": 2 },
    { "period": "2026-06", "status": "already-imported", "confirmed": 0, "created": 0, "unmatchedPayments": 0, "pricedSms": 0 }
  ]
}
```
- `confirmed`: lines that matched transactions already known from SMS.
- `created`: new transactions (fees, cashback, purchases with no SMS).
- `unmatchedPayments`: card payments with no SMS; they wait for the user.
- `pricedSms`: foreign charges whose EGP amount this statement supplied.
- Importing the same month again is safe: `already-imported`.

### `GET /api/accounts/:id/statements` (auth)
`200` → `{ "statements": CardStatementView[] }`:
```json
{
  "id": "uuid", "period": "2026-07", "dueDate": "2026-08-15",
  "creditLimit": "50000.00", "availableCredit": "41000.00",
  "totalDue": "9000.00", "minimumDue": "450.00",
  "openingBalance": "7000.00", "closingBalance": "9000.00",
  "lineCount": 31, "unmatchedPayments": 1, "importedAt": "2026-09-24T12:00:00.000Z"
}
```

---

## 11. Device keys (SMS forwarder setup)

For a settings page that connects the user's phone.

| Endpoint | Body | Response |
|---|---|---|
| `GET /api/devices` | — | `{ "devices": [{ "id", "name", "createdAt", "lastUsedAt": string\|null, "revoked": boolean }] }` |
| `POST /api/devices` | `{ "name": "My phone" }` (max 64) | `201 { "device": {...}, "key": "..." }` |
| `DELETE /api/devices/:id` | — | `204` (revokes) |

**The `key` is shown in this one response and never again.** Show it once with a copy
button and a clear warning; never store it, never log it.

The phone then sends `POST /api/ingest/sms` with the device key. That endpoint is not
for the frontend.

---

## 12. Not available yet

No endpoints exist for: editing or deleting a transaction, changing a transaction's
category, editing or deleting a subscription (only pause/resume/cancel), deleting an
account or category, budgets, password change. Do not build UI that needs them; ask for
the endpoint first.
