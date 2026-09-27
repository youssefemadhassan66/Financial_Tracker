# Financial App Web

A modern personal-finance web frontend built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui (`base-nova` style built on `@base-ui/react`), TanStack Query, and decimal.js.

## Security Architecture

- **In-Memory Access Token**: The JWT access token lives strictly in browser module memory. It is never stored in `localStorage`, `sessionStorage`, `IndexedDB`, or client-accessible cookies, and is never logged to the console or stored in the React Query cache.
- **HTTP-Only Refresh Token**: The refresh token is stored exclusively in an `httpOnly` cookie (`Path=/api/auth`) handled by the browser.
- **Single-Flight Token Rotation**: Concurrent refresh operations share a single in-flight promise to prevent race conditions and invalid session revocation caused by token rotation.

## Prerequisites

- **Backend API**: The backend server must be running on `http://localhost:3000` (see the backend repository for setup instructions). Note that the backend CORS configuration allows requests from `http://localhost:3001` with credentials.
- **Node.js**: Node.js 20+ and npm.

## Setup & Running

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server** (runs on port 3001):
   ```bash
   npm run dev
   ```
   Open [http://localhost:3001](http://localhost:3001) in your browser.

## Verification & Quality Gates

Run the verification commands to check type safety, code styling, test suites, and production build:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Demo Seed Script

Fills the running backend with a FAKE user: 4 accounts (EGP and USD), about 3 months of
transactions across 9 categories (including a refund and monthly card payments), 2 tracked
subscriptions, and one repeating charge left untracked so it shows up as a suggestion.

```bash
npm run seed:demo              # demo@example.com; does nothing if it already has data
npm run seed:demo -- --fresh   # a brand-new demo+<timestamp>@example.com user every run
```

The script prints the email to log in with. It never prints the password: set `DEMO_PASSWORD`
yourself, or read the default in `scripts/seed-demo.ts`. Each run makes about 80 API calls,
and the backend allows 300 per 15 minutes per IP, so avoid running it many times in a row.

### Environment Overrides

You can configure custom values via environment variables:
- `API_URL`: Backend API URL (default: `http://localhost:3000`)
- `DEMO_EMAIL`: User email for demo registration/login (default: `demo@example.com`)
- `DEMO_PASSWORD`: User password for demo registration/login
