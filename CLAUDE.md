# CLAUDE.md

Guidance for AI assistants working in this repository.

RR Metrics is an open-source, self-hosted trading journal: a Node.js/Hono server with a local SQLite database and a React 19 client bundled by webpack. No Docker, no cloud services.

## Commands

```bash
npm start                # run the server (tsx server/src/node.ts) → http://localhost:8459
npm run dev              # server with auto-restart (tsx watch)
npm run build            # webpack build of the client → public/assets
npm run build:watch      # webpack watch mode (run alongside `npm run dev`)
npm run seed-demo        # seed demo user demo@example.com / demo1234
npm run reset-password -- <email> <new-password>
cd server && npx tsc --noEmit   # type-check the server (strict, noEmit)
```

There is no test suite (`npm test` is a no-op). ESLint uses airbnb base (`.eslintrc`).

## Architecture

- **Entry:** `server/src/node.ts` — loads dotenv, ensures `data/` dirs + secret key, runs `schema.sql`, starts `@hono/node-server` on `PORT` (default 8459), and kicks off an hourly broker-token-refresh interval (`server/src/scheduled/broker-refresh.ts`).
- **App:** `server/src/index.ts` — Hono app; global `securityHeaders` + `authMiddleware`, then all API route modules, then static `public/` serving, then HTML page routes (`/login`, `/trades`, `/changePass`).
- **Config:** `server/src/config.ts` — all paths derive from `DATA_DIR` (default `./data`): `rrmetrics.db`, `screenshots/`, `secret.key` (auto-generated 64-hex, used for JWT signing and as default `ENCRYPTION_KEY`). `getEnv()` builds the `Env` object routes receive as `c.env` (typed in `server/src/bindings.d.ts`).
- **DB:** `server/src/db/connection.ts` — singleton better-sqlite3 handle, WAL mode, foreign keys on; `schema.sql` runs on every boot with `CREATE TABLE IF NOT EXISTS` semantics (idempotent — schema changes must be additive or handled with migrations in code).
- **Routes:** `server/src/routes/` — one file per area (trade, tag, daily-note, premarket, strategy, backtesting, uploads, account, auth, syncer + one per broker). Route files are mounted in `index.ts`.
- **DB modules:** `server/src/db/` — one module per table group; routes never write SQL inline, they call these modules.
- **Broker services:** `server/src/services/` — pure HTTP clients (TradovateAPI, ProjectXAPI, WebullAPI, RobinhoodAPI), no DB access.
- **Client:** `client/` — three webpack entries (`trades.jsx` main app, `login.jsx`, `changepass.jsx`) output to `public/assets/*Bundle.js`. Pages live in `client/components/pages/`, shared widgets in `components/shared/`, modals in `components/modals/`. Tailwind for styling.

## Key Patterns

- **Auth contract:** `authMiddleware` (server/src/middleware/auth.ts) parses `Authorization: Bearer <JWT>` (HS256, signed with the server secret), loads the profile, and sets `user`, `accessToken`, `profile`, and `db` on the Hono context — then *always* calls `next()`. Protection comes from `requiresLogin` on each route (401 for JSON requests, redirect to `/` for browsers). OAuth callback endpoints (`/api/tradovate/callback`, `/api/webull/callback`) are intentionally public and validate a CSRF nonce in `state` instead.
- **Owner scoping:** every query in `server/src/db/` filters by `user_id` (or by a `broker_connection_id` that was itself looked up under the user). Never add a query that returns another user's rows; always thread `user.id` from `c.get('user')`.
- **id → `_id` mapping:** DB rows use snake_case and `id`; API responses use camelCase and `_id` (a legacy of the original MongoDB-shaped client). Each db module has a `rowToAPI()` doing this mapping — follow it for new endpoints (see `server/src/db/trades.ts`).
- **JSON-in-TEXT columns:** arrays/objects are stored as JSON strings in TEXT columns (e.g. `trades.image_attachments`, `trade_syncer_configs.follower_accounts`) and parsed defensively with helpers like `parseJsonArray()`. No SQLite JSON functions are relied on.
- **Encrypted credentials:** broker tokens/keys are encrypted with `encrypt()`/`decrypt()` from `server/src/utils/crypto.ts` using `ENCRYPTION_KEY` (defaults to the auto-generated server secret). Never store or log broker credentials in plaintext.
- **Broker integration shape:** parent `broker_connections` row + per-broker child table (`*_connections`) + service + route + hourly refresh. Routes proactively refresh tokens expiring within 30 minutes via an `ensureFreshToken` helper. Details in CONTRIBUTING.md.
- **Client API shim:** `client/supabase.js` is a zero-dependency shim that mimics supabase-js return shapes (`{ data, error }`) but talks to the local `/api/*` endpoints; JWT lives in localStorage (`rr_token`). It is *not* Supabase — there is no Supabase, Cloudflare, or Workers code in the current stack.

## Gotchas

- Server TypeScript runs directly via `tsx` — there is no server build step; `tsc` is type-check only.
- The client build is required before the app renders (`public/assets` bundles); after client changes, rebuild or keep `npm run build:watch` running.
- `data/` is runtime state (DB, screenshots, secret key) — never commit it, and be careful with destructive operations there.
- `APP_URL` matters for broker OAuth: redirect URIs are built as `${APP_URL}/api/<broker>/callback`.
