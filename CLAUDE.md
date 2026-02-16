# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- **Install dependencies:** `npm install`
- **Build client bundles:** `npm run webpack` (production webpack build → `hosted/`)
- **Watch mode (client):** `npm run webpackWatch`
- **Run server:** `npm start` (or `node ./server/app.js`)
- **Dev server with auto-reload:** `npm run nodemon` (watches `./server` and `./hosted`)
- **Lint:** `npx eslint ./server --fix` (runs automatically as `pretest`)
- **Test:** `npm test` (currently runs eslint pretest only, no test suite)
- **Full dev workflow:** Run `npm run webpackWatch` in one terminal and `npm run nodemon` in another

## Architecture

This is **RR Metrics**, a trading journal web app. It uses an MVC architecture with a Node.js/Express 5 backend, MongoDB via Mongoose, and React client-side rendering.

### Server (`server/`)

- **`app.js`** — Express entry point. Configures middleware (helmet CSP, sessions, compression), connects to MongoDB, mounts the router.
- **`router.js`** — All route definitions in one file. Maps URL paths to controller methods with middleware guards.
- **`controllers/`** — Request handlers organized by domain: `Account` (auth, settings), `Trade` (CRUD + bulk import), `Tag` (trade tagging), `Tradovate` (broker sync), `Stripe` (subscription billing).
- **`models/`** — Mongoose schemas: `Account` (users, auth, subscription state, Tradovate config), `Trade` (trade entries with tags, images, P&L), `Tag` (user-defined color-coded labels).
- **`middleware/index.js`** — Auth guards (`requiresLogin`, `requiresLogout`), HTTPS redirect (production only via `requiresSecure`/`bypassSecure`), and subscription status checker (7-day trial logic).
- **`services/TradovateAPI.js`** — Tradovate broker API client (demo/live environments) for syncing trades.
- **`utils/crypto.js`** — AES-256-GCM encryption for storing Tradovate credentials. Requires `ENCRYPTION_KEY` env var (64-char hex).

### Client (`client/`)

Each page is a **separate webpack entry point** that renders a standalone React app into its Handlebars template:

- `trades.jsx` → main journal dashboard (the bulk of the app — trade table, analytics, import, tags, settings)
- `login.jsx` → login/signup with Google OAuth
- `landing.jsx` → public landing page
- `changepass.jsx` → password change form
- `upgrade.jsx` → Stripe subscription upgrade page
- `helper.js` — Shared utilities (`sendPost`, `handleError`) used across client pages

Bundles output to `hosted/` as `[name]Bundle.js` and `[name].css`.

### Views (`views/`)

Handlebars templates (no shared layout). Each renders a minimal HTML shell that loads the corresponding React bundle from `/assets/`.

### Styling

Tailwind CSS 3 with PostCSS. Theme colors use CSS custom properties (`--bg-page`, `--text-primary`, etc.) enabling dark/light mode toggle. Custom colors defined in `tailwind.config.js` map to these variables. Fonts: Inter (sans) and JetBrains Mono (mono).

## Key Patterns

- **Session-based auth:** `express-session` stores `Account.toAPI(doc)` on `req.session.account`. No JWT.
- **Owner scoping:** All trade/tag queries filter by `owner: req.session.account._id` to isolate user data.
- **Stripe webhook:** The `/api/stripe/webhook` route skips JSON body parsing (receives raw body). The express.json() middleware has a conditional bypass for this path in `app.js`.
- **No shared React router:** Each page is a fully independent React app with its own entry point. Navigation between pages is full page loads.
- **ESLint:** Airbnb base config with `no-underscore-dangle` and `no-plusplus` disabled.

## Environment Variables

Required: `MONGODB_URI`, `ENCRYPTION_KEY` (64-char hex)

Optional: `PORT`/`NODE_PORT` (default 3000), `GOOGLE_CLIENT_ID` (enables Google OAuth), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ELITE`, `NODE_ENV` (set `production` for HTTPS redirect enforcement)
