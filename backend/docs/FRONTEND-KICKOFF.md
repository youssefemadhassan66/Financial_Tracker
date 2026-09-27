# Frontend Kickoff (for a new Claude session)

You are starting the **frontend** of a personal finance app. The backend is finished
enough to build against. Read this whole file, then `docs/API.md` in the same folder,
before doing anything.

## Where things are

| What | Path |
|---|---|
| Backend repo (read-only for you) | `F:/Study_OLD/Web-Development-projects/46-financial_app` (branch `develop`) |
| API contract | `F:/Study_OLD/Web-Development-projects/46-financial_app/docs/API.md` |
| Frontend repo (yours) | `F:/Study_OLD/Web-Development-projects/46-financial_app-web` (new, separate git repo) |

Do not edit the backend. If the frontend needs an endpoint that does not exist
(`API.md` section 12), stop and tell the user; backend work happens in the backend session.

## Running the backend locally

1. Docker Desktop must be running. In the backend folder: `docker compose up -d`
   (Postgres container `financial_app_db`).
2. `npm run dev` in the backend folder → API on `http://localhost:3000`.
3. The API only accepts browser calls from `http://localhost:3001`, so the frontend
   dev server runs on **port 3001** (`next dev -p 3001`).

## Stack (already decided)

Next.js 15 App Router + TypeScript (strict), Tailwind CSS + shadcn/ui, TanStack Query
for server data, Recharts for charts. No other state library unless justified.

## How the user works

- **Mentoring**: the user is learning. Explain in plain English why each piece exists
  (auth refresh flow, data fetching, forms) as you review it. Do not just dump code.
- **Git**: GitFlow. `main`, `develop`; features on `feature/<name>` branched from
  `develop`, merged back with `git merge --no-ff`. Commit only after the gates pass.
  Commit messages end with the attribution line the harness gives you.
- **Orchestration**: Claude orchestrates and reviews. **agy** (Antigravity CLI, via the
  `agy-delegate` skill) writes the code, one slice per run. **codex** only for
  super-complex work, and tell the user before every codex dispatch.
- **agy rules** (learned the hard way on the backend):
  - agy headless mode denies commands unless run with `--dangerously-skip-permissions`.
    That flag needs the user's explicit approval **for each run**. Ask every time.
  - Before each agy run, snapshot `git status --short` and the diff of any uncommitted
    user files. After the run, compare. agy once silently reverted the user's
    `.gitignore` edit despite a do-not-touch rule. Report anything lost; do not restore
    user files yourself without asking.
  - Review **every line** agy writes. Re-run the gates yourself; never trust its report.
    Check that its tests would actually fail if the code were wrong (break the code on
    purpose, run the test, restore).
  - agy's final report may start with unrelated personal reminders from its own
    settings. Ignore them.

## Security rules (non-negotiable)

- Access token **in memory only**. Never `localStorage`/`sessionStorage`. The refresh
  token is an httpOnly cookie the frontend never touches (see `API.md` section 3).
- **Never put real personal data anywhere in the repo**: no real card or account digits,
  real names, addresses, bank reference codes, or real SMS text. Use fake data only:
  card digits `1111` (credit card), `2222` (account), `4444` (debit card), `3333`;
  merchants like `TEST STREAM`, `TEST GYM`; emails `@example.com`.
- The user's real statement PDF and real SMS never go into the repo, tests, fixtures,
  screenshots or briefs.
- Never commit `.env*` files or print secret values.
- Before every commit, scan the staged diff for real-looking personal data (see the
  user's private memory for the exact list; if you do not have it, ask the user).
- A device key (section 11) is shown once; never store or log it.

## The plan: slices

One slice per agy run. Each slice is reviewed, run in the browser, merged to `develop`,
then the next starts.

| Slice | Content |
|---|---|
| **F1** | Scaffold (Next.js, Tailwind, shadcn/ui, TanStack Query, port 3001), typed API client, auth: register/login/logout, silent refresh on load, single-flight refresh on 401, protected app layout with nav. Plus a demo seed script (`scripts/seed-demo.ts`) that creates a FAKE user with fake accounts, transactions and subscriptions through the API. |
| F2 | Accounts page (list, create, edit name/digits, available balance) and transactions list (filters, cursor pagination, original currency shown). |
| F3 | SMS inbox: filter by status, details, reprocess with progress (`next` loop), manual pairing of `awaiting_pair` messages. |
| F4 | Statement PDF upload per credit card account, import result, statement history. |
| F5 | Subscriptions: list with warnings (price changed, missed charge), create, pause/resume/cancel, summary, suggestions with accept/dismiss. |
| F6 | Dashboard: category analytics per currency (Recharts), period picker, comparison with previous period. Settings: device keys. |

After F5 the user tries it with their real data (reprocess SMS, import the real PDF).

## Gates (set them up in F1)

`npm run typecheck`, `npm run lint`, `npm run build`, and tests
(Vitest + Testing Library for units; at least the auth refresh logic is unit-tested).
All must pass before any commit.

## First steps for you

1. Confirm with the user the frontend repo path above.
2. Create the empty folder and `git init` it with `main` and `develop` branches. The
   scaffold itself (`create-next-app`) is part of the F1 agy run.
3. Write the F1 brief for agy (with the real gate commands and the rules above), ask the
   user to approve the bypass flag for that run, dispatch, review, gate, merge.
