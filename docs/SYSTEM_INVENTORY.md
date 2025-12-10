# System Inventory

Comprehensive map of the codebase, runtime architecture, and external services to help spot dead/legacy code and risky areas.

## Top-Level Overview
- Runtime split: **Vercel** (frontend + quick APIs) and **Railway** (long-running/scrape/enrich/verification, queues, Puppeteer/GoLogin). Supabase as DB. Resend/MailTester for email flows. GoLogin (primary) and Dolphin/Local (legacy) scraper modes.
- Build tooling: Next.js App Router with custom webpack fallback (Turbopack disabled), Node 18/20 LTS. Scripts: `next build --webpack`, `next start`.
- Config docs: `docs/ENV_VARIABLES.md`, `docs/VERCEL_RAILWAY_SETUP.md`, `docs/VERCEL_DEPLOYMENT.md`, `docs/MIGRATION.md`, `docs/PRODUCTION_SETUP.md` (legacy VPS/Dolphin).

## App Router (pages/layout/middleware) — `src/app`
- `layout.tsx`: global layout; `globals.css`.
- Public/unauth routes: `/` (landing), `/login`, `/invite`, `/onboarding`, `/auth/callback` (route), `/account-disabled`, `/pending-approval`, `/verify`.
- Authenticated routes: `/dashboard`, `/credits`, `/leads`, `/scrapes/[id]`.
- Admin routes under `/admin`: dashboard plus subpages (`access-requests`, `invites`, `users`, `gologin-profiles`, `credits`, `credit-orders`, `scrapes`, `stats`).
- Middleware `src/middleware.ts`: Supabase auth session refresh; redirects unauthenticated users to `/login`; redirects logged-in users away from `/`/`/login` to `/dashboard`; handles account-disabled/pending-approval; admin gate for `/admin/*`; signup redirect to `/`.

## API Routes — `src/app/api`
- Access/onboarding: `access-requests/route.ts`, `admin/access-requests/route.ts`, `onboarding/complete/route.ts`, `init/route.ts`, `auth/callback/route.ts` (under `/app/auth`).
- Credits/billing: `credit-orders/route.ts`, `credits/balance`, `credits/transactions`, `admin/credit-orders`, `admin/credits/add`.
- Users/admin: `admin/users/route.ts`, `admin/users/[id]/approve|disable`, `admin/users/low-credits`.
- Invites: `admin/invites/route.ts`, `send`, `resend`, `accept`, `validate`.
- GoLogin profiles admin: `admin/gologin-profiles/route.ts`, `assign`, `available`.
- Scrapes core: `scrape/route.ts` (start scrape), `scrape/[id]/status`, `scrape/[id]/cancel`, `scrape/gologin-status`, `scrape/dolphin-status`, `scrapes/[id]/delete`, `admin/scrapes/route.ts`.
- Browser control: `browser/access`, `browser/close`, `browser/heartbeat`, `browser/status`.
- Enrichment and verification: `enrich/route.ts`, `verify-emails/upload|start|status/[jobId]|download/[jobId]`.
- Leads: `leads/delete/route.ts`, `scrapes/[id]/delete`.
- Third-party pushers: `instantly/send-leads`, `smartlead/send-leads`, `plusvibe/send-leads`.
- Health: `health/route.ts`.
- Stats: `admin/stats/route.ts`.

## Libraries/Utilities — `src/lib`
- API routing: `api-client.ts` routes long-running endpoints to Railway when `NEXT_PUBLIC_RAILWAY_API_URL` is set.
- Scraper managers: `browser-manager*.ts` (generic, local, Dolphin, GoLogin) handling Puppeteer connections; `scraper*.ts` for mode-specific scraping; `scraper-types.ts` shared types; `scraper.ts` orchestrator.
- Browser/service clients: `gologin-client.ts`, `dolphin-anty-client.ts`, `dolphin-monitor.ts`, `gologin-profile-manager.ts`.
- Queue/verification: `scrape-queue.ts`, `verification-queue.ts`, `verifier.ts`.
- Credits: `credits.ts`, `api-key-pool.ts` for key rotation/pooling.
- Email: `resend.ts`; email templates under `emails/` (`invite-email.tsx`, `welcome-email.tsx`, `workspace-ready-email.tsx`); `mailtester.ts` for MailTester API.
- Permutation utils: `permutation-utils.ts`, `permutator.ts`.
- Supabase clients: `supabase-client.ts` (browser), `supabase-server.ts` (server/service role + auth-aware).
- CORS helper: `cors.ts`.
- Shims: `shims/vertx.js` (webpack fallback for gologin deps).

## Scripts — `scripts/`
- **Current - Diagnostics/inspection:** `apollo-dom-inspector.js`, `inspect-apollo-dom.js`, `debug-page-evaluate.js`, `inspect-cell7-links.js`, `test-cell-extraction.js`.
- **Current - Scraper/cloud tests:** `test-cloud-api-scrape.js`, `test-cloud-scrape.js`, `test-cloud-mode.js`, `test-gologin-scrape.js`, `test-gologin-local.js`, `test-scrape-queue.js`.
- **Current - Setup/ops:** `setup-db.js` (env-driven DB setup), `start-chrome-debug.ps1` (local debugging).
- **Legacy (deleted):** `vnc-diagnostic.sh`, `test-dolphin-setup.js`, `vps-setup.sh` (VPS/Dolphin setup - no longer used).

## Config/Build
- `package.json`: scripts (`dev`, `build` using `next build --webpack`, `start`, `lint`), engines `>=18.18 <21`; key deps: `next@16`, `react@19`, `puppeteer`, `gologin`, `@supabase/ssr`, `@supabase/supabase-js`, `resend`.
- `next.config.ts`: enables React Compiler, forces webpack (Turbopack disabled), marks `puppeteer`/`gologin` as external server packages, adds `vertx` fallback for server builds.
- `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs` (Tailwind v4 inline), `globals.css` for base styles.

## Environment Variables (see `docs/ENV_VARIABLES.md`)
- Client-exposed: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_RAILWAY_API_URL`, `NEXT_PUBLIC_APP_URL`, optional `LOG_LEVEL`.
- Server-only (Railway/secure): `SUPABASE_SERVICE_ROLE_KEY`, `SCRAPER_MODE`, `GOLOGIN_API_TOKEN`, `GOLOGIN_PROFILE_ID`, Dolphin vars (`DOLPHIN_ANTY_API_URL`, `DOLPHIN_ANTY_PROFILE_ID`), MailTester keys (`MAILTESTER_API_KEY`, numbered/array forms), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ALLOWED_ORIGINS` for CORS, optional `SCRAPER_API_KEY`, `REDIS_URL` (not currently wired).
- Mode toggles: `SCRAPER_MODE` = `gologin` (recommended), `local`, or `dolphin` (legacy).

## Data Layer — `supabase/`
- Schema files: `schema.sql` (base), incremental adds for credits, invite system, campaign fields, mailtester fields, scraper mode, gologin profiles, duplicate tracking, onboarding/account disabling/approval, error details, credit orders, scrape queue, etc.
- Consolidated migration: `migrate_all.sql` (idempotent) creates/updates `user_profiles`, `credit_transactions`, RLS policies, adds `user_id`, `scraper_mode`, `gologin_profile_id`, duplicate tracking, error details, campaign fields, etc.; safe to run multiple times.
- Tables of interest: `scrapes`, `leads`, `user_profiles`, `credit_transactions`, gologin profile tables, queue tables; RLS for user/ admin access and service-role inserts.

## Runtime Architecture
- Frontend/quick APIs on **Vercel**: UI pages, auth flows, lightweight DB queries, credits/admin endpoints. Uses `api-client.ts` to stay same-origin unless long-running.
- Long-running/worker APIs on **Railway**: `/api/scrape*`, `/api/enrich`, `/api/verify-emails*`, browser control endpoints, heartbeat/close/access, queue processing; Puppeteer/GoLogin/Dolphin dependencies reside here.
- Routing: `api-client.ts` directs long-running paths to `NEXT_PUBLIC_RAILWAY_API_URL`; falls back to same-origin if unset (single-platform mode).
- CORS: `ALLOWED_ORIGINS` expected on Railway to include Vercel domain; `NEXT_PUBLIC_RAILWAY_API_URL` required on Vercel to avoid invoking long tasks on Vercel functions (time limits).

## External Services
- **Supabase**: auth, DB, RLS; anon key client-side, service role server-side.
- **GoLogin**: primary anti-detect browser for scraping (API token + profile ID).
- **Dolphin Anty**: legacy alternative; requires local/VPS setup.
- **Puppeteer**: used across scraper managers.
- **MailTester**: email verification API keys; supports pooling/rotation.
- **Resend**: transactional emails (invite/welcome/workspace-ready).
- **Instantly/Smartlead/Plusvibe**: outbound lead sending endpoints.
- **Vercel Analytics**: `@vercel/analytics` dependency present.

## Legacy / Cleanup Candidates
- ✅ **Cleaned:** Dolphin/VPS scripts deleted (`test-dolphin-setup.js`, `vps-setup.sh`, `vnc-diagnostic.sh`). `start-chrome-debug.ps1` kept (useful for local debugging).
- Unused public assets already removed; review remaining scripts for one-off diagnostics not used in CI/CD.
- Confirm Redis-related env (`REDIS_URL`) and `SCRAPER_API_KEY` are either implemented or removed from docs.

## Notes for Further Analysis
- Ensure Vercel envs exclude server secrets (`SUPABASE_SERVICE_ROLE_KEY`, GoLogin tokens, MailTester keys).
- Consider adding a bundle analyzer and dependency graph to catch accidental client imports of server-only libs (puppeteer/gologin).
- Validate RLS and migrations by running `supabase/migrate_all.sql` on prod before releases.

## Review Checklist (Multi-Agent)

Use this to split review work and track removals/risk fixes. Record findings per item (bug/risk/dead-code/removal candidate), with file/route references and proposed action.

Assignments
- A: App router + middleware + UI/auth flow.
- B: API access/onboarding/credits/users/invites + health/stats.
- C: Scrapes/enrich/verify + browser control + `api-client.ts` routing/CORS.
- D: Libs (scraper managers, queues, credits/key pool, Supabase clients, email/MailTester).
- E: Data/migrations + env/secrets + config/build + external services sanity.
- F: Scripts/ops + legacy cleanup sweep.

Checklist by area
- App/middleware: auth redirects, disabled/pending handling, admin gate, public vs protected routes, orphan pages.
- APIs: authz on every mutation/read; input validation; long-running endpoints kept off Vercel; CORS where cross-origin; secrets not leaked in responses; rate/abuse controls for invites/access requests.
- Scrapes stack: mode routing correct; timeouts/retries; resource cleanup; delete/cancel semantics; status endpoints accuracy.
- Browser control: ownership/admin checks; no open proxy behavior; heartbeat/close correctness.
- Enrich/verify: file handling; job idempotency; quotas/rate limits; download authz.
- Credits/billing: balance/transaction invariants; admin adjustments guarded; orders correctness.
- Users/admin: approve/disable flows audited; low-credits logic; logging hygiene.
- Invites: send/resend/accept/validate correctness; idempotency; abuse controls.
- Libs: Puppeteer/GoLogin only server-side; key rotation behavior; queue idempotency; email templates correctness; Supabase clients not leaking service key to client.
- Scripts: mark current vs legacy; delete unused (especially Dolphin/local, VPS); ensure no secrets baked.
- Config/build: Node version alignment; unused deps; webpack externals/fallbacks still needed; bundle analyzer pending.
- Env/secrets: server-only vars not on Vercel; Railway has service role and GoLogin/MailTester; `NEXT_PUBLIC_RAILWAY_API_URL` on Vercel; `ALLOWED_ORIGINS` on Railway; prune unused envs (Redis/SCRAPER_API_KEY if unused).
- Data/migrations: `migrate_all.sql` coverage; RLS matches expectations; unused tables/columns to drop.
- External services: GoLogin token/profile handling; MailTester limits; Resend from-domain verified; Instantly/Smartlead/Plusvibe payload/authz; Supabase RLS enforced.

Outputs expected
- Per agent: short findings list with severity and path references; cleanup candidates enumerated; missing env/config items; suggested fixes/owners.
- Roll-up: prioritized remediation list (security/authz > data loss > availability > perf > cleanup).

## What Each Area Does

App router (`src/app`)
- `layout.tsx`/`globals.css`: base shell and global styles.
- Public routes: landing, login, invite, onboarding, auth callback, account-disabled/pending-approval, verify.
- Authenticated: dashboard, credits, leads, scrapes detail.
- Admin: access-requests, invites, users, gologin-profiles, credits/orders, scrapes, stats.
- Middleware: enforces auth, redirects login/landing, handles disabled/pending, admin gate, blocks signup.

API routes (`src/app/api`)
- Access/onboarding/init/auth callback flows.
- Credits/billing: balances, transactions, orders, admin credit adjustments.
- Users/admin: list/manage users, approve/disable, low-credits report.
- Invites: send/resend/accept/validate.
- GoLogin profiles admin: assign/list/available.
- Scrapes: start, status, cancel, delete; GoLogin/Dolphin status; admin listing.
- Browser control: access/close/heartbeat/status for Puppeteer/GoLogin sessions.
- Enrichment/verification: enrich; verify-emails upload/start/status/download.
- Leads cleanup: delete endpoints.
- Third-party pushers: Instantly/Smartlead/Plusvibe export.
- Health and admin stats.

Libraries (`src/lib`)
- API routing to Railway: `api-client.ts`.
- Scraper managers and orchestrators: `browser-manager*`, `scraper*`, `scraper.ts`, shared types.
- External browser clients: GoLogin/Dolphin clients and monitors.
- Queues/verification: scrape queue, verification queue, verifier.
- Credits/key pool: credits helpers, API key rotation.
- Email: Resend sender + templates; MailTester client.
- Utilities: permutations, CORS helper, vertx shim.
- Supabase: browser client and server/service-role client.

Scripts (`scripts/`)
- **Current:** Diagnostics/inspection and DOM probes (browser console scripts). Scraper/cloud test harnesses (GoLogin/local modes, queue tests). Ops/setup: DB setup, local Chrome debug.
- **Legacy (deleted):** VPS setup scripts, Dolphin Anty tests, VNC diagnostics (no longer used).

Config/Build
- `package.json` scripts/engines; Next/React with Puppeteer/GoLogin and Supabase/Resend deps.
- `next.config.ts`: webpack enforced, externals, vertx fallback, React Compiler on.

Environment
- Client vars: Supabase URL/anon, Railway API URL, app URL, optional log level.
- Server vars: service role, scraper mode/creds, MailTester, Resend, ALLOWED_ORIGINS, optional scraper API key/Redis.
- Mode toggle: `SCRAPER_MODE` picks GoLogin (primary), local, or Dolphin (legacy).

Data layer (Supabase)
- Incremental SQL plus idempotent `migrate_all.sql`; key tables scrapes/leads/user_profiles/credit_transactions/gologin profiles; RLS for user/admin, service-role inserts.

Runtime architecture
- Vercel: UI + quick APIs; avoid long-running.
- Railway: long-running scrape/enrich/verify/browser control with Puppeteer/GoLogin; needs CORS allow list and Railway URL set in client.

External services
- Supabase auth/DB, GoLogin primary browser, Dolphin legacy, Puppeteer, MailTester, Resend, Instantly/Smartlead/Plusvibe exports, Vercel Analytics.

