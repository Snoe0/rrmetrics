# Contributing to RR Metrics

Thanks for your interest in contributing! This is a young project and all contributions are welcome — bug reports, documentation fixes, new features, and especially new broker integrations. If you're unsure whether an idea fits, open an issue first and let's talk.

## Development Setup

Prerequisites: Node.js 20+ and npm.

```bash
git clone https://github.com/Snoe0/rrmetrics.git
cd rrmetrics
npm install
npm run build        # build the client once
npm run dev          # start the server with auto-restart on changes
```

For client work, run the webpack watcher in a second terminal so the bundles rebuild as you edit:

```bash
npm run build:watch
```

Open http://localhost:8459. To get realistic data to work with:

```bash
npm run seed-demo    # then log in as demo@example.com / demo1234
```

The first run creates `data/` (SQLite database, screenshots dir, secret key) automatically. Delete `data/` any time to start fresh.

## Project Layout

```
rrmetrics/
├── client/                  # React 19 client (JSX, no TypeScript)
│   ├── trades.jsx           # main app entry (webpack "app" bundle)
│   ├── login.jsx            # login/signup page entry
│   ├── changepass.jsx       # password change page entry
│   ├── supabase.js          # zero-dependency API/auth shim (talks to /api/*)
│   ├── components/
│   │   ├── pages/           # one component per page (Dashboard, Analytics, ...)
│   │   ├── modals/          # trade form, CSV import, sync popup
│   │   ├── shared/          # reusable widgets (StatCard, Toast, Icons, ...)
│   │   └── ui/              # low-level UI primitives
│   ├── hooks/               # e.g. useBrokerConnection
│   ├── services/            # e.g. TradovateWebSocket
│   ├── styles/              # Tailwind globals
│   └── utils/               # analytics math, date/period helpers
├── server/
│   ├── src/
│   │   ├── node.ts          # entry point: boot, HTTP server, hourly cron
│   │   ├── index.ts         # Hono app: middleware + route mounting
│   │   ├── config.ts        # paths, port, secret key, env
│   │   ├── routes/          # one file per API area (trade, tag, tradovate, ...)
│   │   ├── db/              # schema.sql + one module per table group
│   │   ├── middleware/      # auth (JWT) and security headers
│   │   ├── services/        # broker API clients (TradovateAPI, ProjectXAPI, ...)
│   │   ├── scheduled/       # hourly broker token refresh
│   │   └── utils/           # crypto, id generation, round-trip builder
│   └── scripts/             # reset-password, seed-demo
├── public/                  # static HTML shells + webpack output in assets/
└── install.sh               # one-command installer
```

## Checks and Builds

There is no test suite yet (contributions welcome there too). Before opening a PR, please make sure these pass:

```bash
# Type-check the server (strict TypeScript, no emit)
cd server && npx tsc --noEmit

# Build the client (from the repo root)
npm run build
```

And click through the parts of the app your change touches — with demo data seeded, most flows are easy to exercise manually.

## Code Style

- ESLint with the **airbnb base** config (see [.eslintrc](.eslintrc)); `no-underscore-dangle`, `no-plusplus`, and `import/extensions` are relaxed.
- Server code is strict TypeScript; client code is plain JSX.
- Match the style of the surrounding file. Keep changes focused — avoid drive-by reformatting.

## Adding a Broker Integration

Broker integrations follow a consistent four-part pattern. The Webull integration is a good, compact reference; ProjectX is the simplest (API-key based, no OAuth).

1. **Service** — `server/src/services/YourBrokerAPI.ts`
   A thin client for the broker's HTTP API: authentication, token refresh, fetching accounts and fills. No database access here.

2. **DB module** — `server/src/db/yourbroker-connections.ts` plus a `yourbroker_connections` table in `server/src/db/schema.sql`
   Each broker gets a child table keyed by `broker_connection_id` referencing the shared `broker_connections` parent table (which tracks broker type, environment, and label per user). Store tokens/credentials **encrypted** with `encrypt()` from `server/src/utils/crypto.ts` — never in plaintext.

3. **Route** — `server/src/routes/yourbroker.ts`, mounted in `server/src/index.ts`
   Typical endpoints: `POST /api/yourbroker/connect`, `GET /api/yourbroker/status`, `POST /api/yourbroker/sync`, `DELETE /api/yourbroker/connections/:connectionId`. Guard everything with `requiresLogin` (OAuth callback endpoints are the exception — they validate a CSRF nonce instead). If the broker returns raw fills rather than round trips, run them through `buildRoundTrips()` in `server/src/utils/round-trip-builder.ts` before inserting trades.

4. **Token refresh** — hook expiring tokens into `server/src/scheduled/broker-refresh.ts` so the hourly cron keeps connections alive, and/or add an `ensureFreshToken` helper in your route (see `routes/webull.ts` for the pattern: refresh proactively when a token expires within 30 minutes).

On the client, add the connect/sync UI to the Settings page (`client/components/pages/SettingsPage.jsx`) — the `useBrokerConnection` hook covers most of the plumbing.

If the broker needs server-level credentials (OAuth client ID/secret), add them to `Env` in `server/src/bindings.d.ts`, `getEnv()` in `server/src/config.ts`, and document them in `.env.example` and the README.

## Pull Request Guidelines

- **Open an issue first** for larger changes so we can agree on the approach before you invest time.
- Keep PRs focused: one feature or fix per PR.
- Describe **what** the change does and **why**; include screenshots for UI changes.
- Make sure `cd server && npx tsc --noEmit` and `npm run build` pass.
- Don't commit `data/`, `.env`, or built bundles in `public/assets` — they're gitignored for a reason.
- Be kind in reviews and discussions — this project is meant to be a friendly place to contribute.

Thanks again — every contribution, however small, makes the project better.
