# Masroof (مصروف)

A personal finance tracker that reads your bank SMS. Each bank message
becomes a transaction, so spending, subscriptions, budgets and installment
plans stay up to date without typing anything.

| Folder | What it is | Stack |
| --- | --- | --- |
| [`backend/`](backend) | REST API, SMS parsing, statement import | Express 5, TypeScript, Prisma 7, Postgres 18 |
| [`web/`](web) | The app you use (desktop and phone browser) | Next.js 16, React 19, Tailwind 4, TanStack Query |
| [`android/`](android) | Phone app: shows the web app and forwards bank SMS | Kotlin, WorkManager, Android Keystore |

## Run it on your computer

You need Node.js 20+, Docker Desktop, and (for the phone app) JDK 21 with the
Android SDK.

```bash
# 1. Database
cd backend
cp .env.example .env        # fill in the secrets, and set PORT=3002
npm install
npm run db:up
npx prisma migrate deploy

# 2. API on port 3002
npm run dev

# 3. Web app on port 3001 (second terminal)
cd ../web
npm install
API_PROXY_TARGET=http://localhost:3002 npm run dev
```

On Windows, `web/scripts/start-local.ps1` does all of this in one go, and
`web/scripts/install-shortcuts.ps1` adds **Start Masroof** / **Stop Masroof**
to the desktop.

Phone app: see [`android/README.md`](android/README.md).

## Tests

```bash
cd backend && npm test      # needs the database running
cd web && npm test
cd android && ./gradlew testDebugUnitTest
```

## Docs

- API reference: [`backend/docs/API.md`](backend/docs/API.md)
- Web app notes: [`web/README.md`](web/README.md)

## Privacy

All test data is made up. Never commit real bank messages, statements,
card numbers or `.env` files.
