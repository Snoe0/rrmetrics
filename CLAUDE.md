# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Memory Vault

This project has an Obsidian vault at `.claude/RR-Metrics/`. **Read it at the start of every session and write to it as you work.**

### Vault structure
```
.claude/RR-Metrics/
├── Index.md              ← Start here — project overview and all links
├── Architecture.md       ← System design, component map, data flow
├── Database.md           ← All tables, columns, RLS, query patterns
├── Auth.md               ← Supabase JWT flow, middleware chain
├── Infrastructure.md     ← Build scripts, env vars, secrets reference
├── Decisions.md          ← Architectural decisions with rationale
├── Progress.md           ← Session log — append here after every session
├── Features/             ← One file per feature (Trades, TradovateSync, etc.)
├── API/                  ← One file per route group with endpoint reference
└── Client/               ← Client architecture and component breakdowns
```

### When to read
- **Start of session:** Read `Index.md` first, then any files relevant to the task.
- **Before touching a feature:** Read the corresponding `Features/*.md` and `API/*.md`.
- **Before touching auth/DB/middleware:** Read `Auth.md` and `Database.md`.

### When to write
| Trigger | Action |
|---------|--------|
| Architectural choice made | Append to `Decisions.md` |
| Feature added or significantly changed | Update the relevant `Features/*.md` |
| New API endpoint added | Update `API/Routes.md` and the relevant `API/*.md` |
| Schema change | Update `Database.md` |
| Bug or non-obvious gotcha found | Note in `Progress.md` with `#bug` |
| End of session | Append a session entry to `Progress.md` |

### Vault notes format
- Use `[[WikiLinks]]` to link related notes
- Use YAML frontmatter on every note (`tags:`, `last-updated:`)
- Keep `last-updated` accurate when editing a file
- `Progress.md` entries: `## Session: YYYY-MM-DD` with "What was done", "Bugs & Gotchas", "Next Steps"

## Build & Development Commands

### Express/MongoDB (legacy - `server/`)
- **Install dependencies:** `npm install`
- **Build client bundles:** `npm run webpack` (production webpack build → `public/assets/`)
- **Watch mode (client):** `npm run webpackWatch`
- **Run server:** `npm start` (or `node ./server/app.js`)
- **Dev server with auto-reload:** `npm run nodemon` (watches `./server` and `./hosted`)
- **Lint:** `npx eslint ./server --fix` (runs automatically as `pretest`)
- **Test:** `npm test` (currently runs eslint pretest only, no test suite)
- **Full dev workflow:** Run `npm run webpackWatch` in one terminal and `npm run nodemon` in another

### Cloudflare Workers (new - `workers/`)
- **Install worker deps:** `cd workers && npm install`
- **Dev worker server:** `npm run dev:worker` (runs `wrangler dev`)
- **Deploy:** `npm run deploy` (builds webpack + deploys worker)
- **D1 migrate (remote):** `npm run d1:migrate`
- **D1 migrate (local):** `npm run d1:migrate:local`
- **Full dev workflow:** Run `npm run webpackWatch` in one terminal and `npm run dev:worker` in another

## Architecture

This is **RR Metrics**, a trading journal web app. It has two backends:

### Legacy: Express/MongoDB (`server/`)
Preserved for rollback capability. Uses MVC architecture with Node.js/Express 5, MongoDB/Mongoose, Handlebars views.

### New: Cloudflare Workers (`workers/`)
Cloudflare-native stack using Hono framework, D1 (SQLite) database, Durable Objects for sessions.

- **`src/index.ts`** — Hono entry point. Mounts all route modules, global middleware (security headers, session).
- **`src/routes/`** — Route handlers: `account.ts` (auth/settings), `trade.ts` (CRUD + bulk import), `tag.ts`, `daily-note.ts`, `tradovate.ts` (broker sync), `stripe.ts` (billing), `pages.ts` (HTML serving with auth guards).
- **`src/db/`** — D1 database access layer: `accounts.ts`, `trades.ts`, `tags.ts`, `trade-tags.ts` (junction), `daily-notes.ts`. All map `id` → `_id` in responses for client compat.
- **`src/middleware/`** — `session.ts` (Durable Object sessions), `auth.ts` (requiresLogin/requiresLogout), `subscription.ts` (7-day trial), `security.ts` (CSP headers).
- **`src/session-do.ts`** — Durable Object for server-side sessions with 24h sliding expiry via alarm().
- **`src/services/TradovateAPI.ts`** — Tradovate broker API client (TypeScript port, uses fetch).
- **`src/utils/`** — `crypto.ts` (Web Crypto AES-256-GCM, format-compatible with Node.js), `password.ts` (bcryptjs), `email.ts` (Resend API), `id.ts` (UUID gen).
- **`schema.sql`** — D1 schema: 5 tables (accounts, trades, tags, trade_tags, daily_notes).

### Client (`client/`)

Each page is a **separate webpack entry point** that renders a standalone React app into its HTML page:

- `trades.jsx` → main journal dashboard (the bulk of the app — trade table, analytics, import, tags, settings)
- `login.jsx` → login/signup with Google OAuth
- `landing.jsx` → public landing page
- `changepass.jsx` → password change form
- `upgrade.jsx` → Stripe subscription upgrade page
- `helper.js` — Shared utilities (`sendPost`, `handleError`) used across client pages

Bundles output to `public/assets/` as `[name]Bundle.js` and `[name].css`.

### Static Pages (`public/`)

5 HTML files replace Handlebars templates. Identical structure (mount points, errorDiv elements). Served by Cloudflare Pages with auth guards in `routes/pages.ts`.

### Styling

Tailwind CSS 3 with PostCSS. Theme colors use CSS custom properties (`--bg-page`, `--text-primary`, etc.) enabling dark/light mode toggle. Custom colors defined in `tailwind.config.js` map to these variables. Fonts: Inter (sans) and JetBrains Mono (mono).

## Key Patterns

- **Session-based auth:** Durable Objects store session data (same `toAPI` shape as Express). Cookie: `sessionid`. 24h sliding expiry.
- **Owner scoping:** All trade/tag/note queries filter by `owner` to isolate user data.
- **D1 → client compat:** Database layer maps `id` → `_id` in all JSON responses (client uses `_id` everywhere).
- **Stripe webhook:** The `/api/stripe/webhook` route uses `c.req.text()` for raw body (no JSON parsing).
- **No shared React router:** Each page is a fully independent React app with its own entry point. Navigation between pages is full page loads.
- **ESLint:** Airbnb base config with `no-underscore-dangle` and `no-plusplus` disabled.

## Environment Variables

### Cloudflare Workers (set via `wrangler secret put`)
Required: `ENCRYPTION_KEY` (64-char hex)

Secrets: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ELITE`

Vars (in wrangler.toml): `APP_URL`

Optional: `GOOGLE_CLIENT_ID`

### Legacy Express
Required: `MONGODB_URI`, `ENCRYPTION_KEY` (64-char hex)

Optional: `PORT`/`NODE_PORT` (default 3000), `GOOGLE_CLIENT_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ELITE`, `NODE_ENV`
