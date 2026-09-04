# Deployment

Deployed on Vercel with its default Next.js (App Router) build. Framework
detection, build command, and output are all correct on defaults, so
`vercel.json` stayed out of this repo until P9.1 needed one — account
deletion's 7-day grace window needs *something* to fire on a timer, and
Vercel Cron is that "real requirement" (custom headers, redirects, a cron
job, etc.) rather than a preemptive addition. Its one entry drives
`/api/account/process-deletions` daily (see "Account deletion" below);
don't add a second entry for anything else without an equally real reason.

## Environment variables

Set these in Vercel → Project → Settings → Environment Variables.

| Variable                        | Value                               | Public or secret                                                                                                                                     |
| ------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://<project-ref>.supabase.co` | Public                                                                                                                                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/publishable key                | Public                                                                                                                                               |
| `SUPABASE_SERVICE_ROLE_KEY`     | service role/secret key             | **Secret**                                                                                                                                           |
| `EXCHANGE_RATE_API_KEY`         | key from exchangerate-api.com       | **Secret**                                                                                                                                           |
| `FX_REFRESH_CRON_SECRET`        | any random string you generate      | **Secret** (optional — only needed if an external scheduler calls `/api/fx/refresh`; the in-app "Refresh rates" button works without it)             |
| `CRON_SECRET`                   | any random string you generate      | **Secret** (P9.1 — required. Vercel's own reserved name: when set, Vercel automatically sends it as `Authorization: Bearer $CRON_SECRET` to every `vercel.json` cron endpoint, which is the only way `/api/account/process-deletions` authenticates — see "Account deletion" below) |
| `UNSPLASH_ACCESS_KEY`           | Access Key from an Unsplash app     | **Secret** (P6.0 — `<PhotoPicker>`'s search/download proxy; Demo apps are capped at 50 requests/hour until Unsplash approves the app for production) |
| `NEXT_PUBLIC_MAPBOX_TOKEN`      | Public token from Mapbox            | Public (P6.2 — `<PlaceMap>`'s map rendering; **restrict by URL** in the Mapbox dashboard, see below)                                                 |
| `MAPBOX_SECRET_TOKEN`           | Secret-scoped token from Mapbox     | **Secret** (P6.2 — `/api/geocode`'s search proxy)                                                                                                    |
| `NEXT_PUBLIC_SENTRY_DSN`        | DSN from a Sentry project           | Public (P9.2 — DSNs are meant to be client-embedded; every `Sentry.init()` call is inert with none set, see "Error monitoring" below)                |
| `SENTRY_ORG`                    | your Sentry org slug                | **Secret**-ish, build-only (P9.2 — source map upload; optional, skips with a warning if unset)                                                       |
| `SENTRY_PROJECT`                | your Sentry project slug            | **Secret**-ish, build-only (P9.2 — source map upload; optional, skips with a warning if unset)                                                       |
| `SENTRY_AUTH_TOKEN`             | auth token, `project:releases` scope| **Secret**, build-only (P9.2 — source map upload; optional, skips with a warning if unset)                                                           |
| `HEALTH_CHECK_SECRET`           | any random string you generate      | **Secret** (P9.2 — required. Gates `/api/health`; give this to your uptime monitor, see "Uptime monitoring" below)                                   |

Set these for the Production and Preview environments (Preview so PR
deployments work end to end, not just production).

`SUPABASE_PROJECT_ID` does **not** go in Vercel. It's only read by
`npm run db:types`, a local dev command — it's never invoked during the
Vercel build, so it has no reason to exist there.

### `SUPABASE_SERVICE_ROLE_KEY` must stay server-only

This key bypasses Row Level Security entirely. Next.js inlines any variable
prefixed `NEXT_PUBLIC_` straight into the browser bundle at build time —
there is no server-side gate on that, it's a straight text substitution. So:

- Never rename this variable to start with `NEXT_PUBLIC_`.
- Never pass its value into a Client Component's props, into `NEXT_PUBLIC_*`,
  or into anything that ends up in a `"use client"` file.
- It's only read from `src/lib/supabase/server.ts`-style server code — route
  handlers, server actions, server components.
- In Vercel, mark it **Sensitive** (Vercel hides the value after save; it
  can be overwritten but never viewed again through the dashboard).

This isn't hypothetical — an earlier pass at this project's `.env.local`
put the equivalent secret key under a `NEXT_PUBLIC_`-prefixed name by
mistake. Caught locally before anything shipped, but it's exactly the
failure mode this section exists to prevent happening in a place that
actually ships to users.

## Mapbox

Two tokens, deliberately (P6.2), created at
https://account.mapbox.com/access-tokens/:

- `NEXT_PUBLIC_MAPBOX_TOKEN` — a **public** token. Restrict it by URL in the
  dashboard (production domain, every Vercel preview pattern the way
  DEPLOYMENT.md's Supabase redirect-URL section already does for auth
  callbacks, and `http://localhost:3000`) — not because a public token is a
  secret, but because an unrestricted one lets anyone who copies it out of
  the page source spend usage against your account from their own site.
- `MAPBOX_SECRET_TOKEN` — a **secret-scoped** token, read only by
  `/api/geocode`. Left _without_ a URL restriction on purpose: server-side
  requests carry no browser `Origin` header for Mapbox to match against one.

**Mapbox has no hard spending cap** — the free tier (50,000 map loads,
100,000 directions requests, 50,000 static images per month) is nowhere
close to what two users will ever hit, but an abused or leaked token bills
past it rather than getting throttled. Set a billing alert in the Mapbox
dashboard (**Account → Billing**) now, not after it's needed.

## Supabase Auth redirect URLs

Supabase rejects any auth redirect (email confirmation, magic link, OAuth)
whose target URL isn't on its allow-list. Configure this in the Supabase
dashboard → **Authentication → URL Configuration**, for the same project
`NEXT_PUBLIC_SUPABASE_URL` points at:

- **Site URL**: `https://my-life-be-like.vercel.app` (or a custom domain,
  once one is attached — update this if so).
- **Redirect URLs** (allow-list, supports `*` wildcards) — currently set to:
  - `https://my-life-be-like.vercel.app/auth/callback` — production.
  - `https://my-life-be-like-*-tokos1.vercel.app/auth/callback` — Vercel
    preview deployments; every PR/CLI deploy gets a fresh URL like
    `https://my-life-be-like-<hash>-tokos1.vercel.app`, and the wildcard
    covers all of them without per-deploy reconfiguration.
  - `http://localhost:3000/auth/callback` and `http://localhost:3003/auth/callback`
    — local dev (the second is the port this repo's own testing has used;
    add another entry here if you routinely run `next dev` on a different one).
  - The same four, with `/reset-password` instead of `/auth/callback` (P9.3)
    — `resetPasswordForEmail`'s own `redirectTo` points there directly
    rather than through the shared callback route (`src/app/(auth)/reset-password/reset-password-form.tsx`'s
    own header explains why: the code exchange has to happen client-side,
    where it can write the session cookie). Verified live against
    production — `resetPasswordForEmail` with this `redirectTo` returns no
    error once the entry exists; it did before, rejecting the redirect.

Set via the Management API (`PATCH /v1/projects/{ref}/config/auth`) rather
than by hand in this instance — the dashboard page is
**Authentication → URL Configuration** if you need to change it again.

## Migrations

There's no migration runner wired into deployment — schema changes are a
manual, deliberate step, not something that happens as a build side effect:

1. Write a new file in `supabase/migrations/`, numbered after the last one
   (following the `000N_description.sql` convention) — check the live
   schema or `src/types/database.ts`, not the highest filename in this
   directory, to find the real next number (CLAUDE.md's Database section
   explains why the numbering isn't gapless).
2. Apply it to the real project — `supabase db push` if linked, or via the
   SQL editor in the Supabase dashboard.
3. Regenerate types from the now-updated schema:
   `SUPABASE_PROJECT_ID=<project-ref> npm run db:types`. Commit the
   regenerated `src/types/database.ts` in the same PR as the migration —
   never hand-edit that file (see `src/lib/supabase/README.md`).
4. Before applying anywhere real, sanity-check the migration locally
   against a throwaway Postgres per `Schema.MD`'s "Running it locally"
   section, especially if it touches RLS.

## Account deletion

P9.1's `/settings/account` only ever sets `profiles.deletion_requested_at`
and signs the requesting session out — nothing is actually destroyed until
`/api/account/process-deletions` runs, which only happens on a timer (the
`vercel.json` cron above, daily at 03:00 UTC) or by hitting the route
directly with the right bearer token. If `CRON_SECRET` is unset in an
environment, the route refuses every request outright rather than falling
back to some looser check — an environment without that secret configured
simply never processes deletions, which is the safe failure direction for
something this destructive.

The route itself finds every account whose grace window (7 days) has
elapsed, wipes their Storage objects (verified by relisting the prefix
afterward), clears the two foreign-key edge cases that would otherwise
block the cascade (`app.prepare_user_deletion`, migration 0041), then
calls `auth.admin.deleteUser()` — whose own `ON DELETE CASCADE` chain is
what actually removes `profiles` and everything hanging off it. See that
migration's own comments for the full reasoning, including a documented
wrong turn (an early version had the DB function delete `profiles`
directly, which turned out to have a real orphaned-`auth.users` failure
mode — fixed before it shipped, kept in the comments as the reasoning
for the order the final version uses).

## Error monitoring

`@sentry/nextjs` (P9.2), wired into all three runtimes this app has —
`src/instrumentation-client.ts` (browser), `src/sentry.server.config.ts`
(Node — Server Components, Server Actions, `/api/*` routes),
`src/sentry.edge.config.ts` (Edge — `proxy.ts` itself). DSN-optional
throughout: every `Sentry.init()` call is a no-op with
`NEXT_PUBLIC_SENTRY_DSN` unset, so this app runs identically whether or
not Sentry is configured — set the env var above when ready, nothing
else to flip.

**Scrubbing is not optional** — `src/lib/sentry-scrub.ts`'s `beforeSend`
runs on every event, in every runtime, before it leaves the process.
Request bodies are dropped wholesale (a server action's FormData
routinely carries a goal's target amount, a ledger entry's amount);
every other field is redacted by name against a pattern anchored on
this codebase's own `_minor`-suffix money convention (CLAUDE.md rule
1), so it structurally covers every monetary field this schema has or
will ever have, not a hand-maintained list. Read that file's own header
before changing it — the two techniques (drop-wholesale vs. redact-by-
pattern) exist for different reasons and shouldn't be collapsed into one.

Source maps and release tagging (`org`/`project`/`authToken` on
`next.config.ts`'s `withSentryConfig`) read from `SENTRY_ORG`/
`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` automatically; the release name
defaults to the git HEAD commit SHA with no config at all. Turbopack
(this app's bundler) is supported directly — no webpack-specific setup
needed, see `next.config.ts`'s own comment.

Tracing is deliberately off (`tracesSampleRate: 0`) — this pass is
error monitoring, not performance monitoring; turn tracing on
separately and deliberately if it's ever wanted.

## Uptime monitoring

`/api/health` (P9.2) is the route to point an external monitor at — it
requires the same bearer-token auth as the account-deletion processor
(a **different** secret, `HEALTH_CHECK_SECRET`, not `CRON_SECRET` —
this route is meant to be hit far more often, from a third party, and
reusing the same secret would mean rotating one for the other), and
its body touches the database (a cheap `select 1`-shaped query) so a
green check actually means Postgres is reachable, not just that the
Node process is up. See `src/app/api/health/route.ts`'s own comment
for the exact shape.

No monitoring account is wired up by this pass — that's a manual step:

1. Create a free account at an uptime checker (UptimeRobot, Better
   Stack, or similar — no strong preference, pick one with alerting
   to somewhere you'll actually see it: email is the low bar, SMS/push
   for anything better).
2. Add an HTTP(S) monitor against
   `https://my-life-be-like.vercel.app/api/health`, method GET, with
   header `Authorization: Bearer <HEALTH_CHECK_SECRET>`.
3. Check interval: 5 minutes is a reasonable default for an app this
   size — tighter doesn't meaningfully change response time to an
   incident, looser starts trading away the point of the check.
4. Point alerting at an address/device you actually monitor, not a
   shared inbox nobody watches.

## Spend caps and usage alerts

**Neither of these is configurable via API** — confirmed directly
(Vercel CLI has no spend-limit command; Supabase's Management API has
no usage/billing-alert endpoint) rather than assumed, so both are
manual dashboard steps, not something a future migration or script can
set up:

- **Vercel**: Team Settings → Billing → Spend Management. Set a spend
  limit — this is the backstop against a runaway bill from a bug or
  abuse, not a everyday budget lever.
- **Supabase usage alerts**: Organization Settings → Billing →
  guardrails/notifications (exact page name varies by dashboard
  version). Set alerts at 50%, 75%, and 90% of plan quota — **storage
  specifically**, not just the general usage number: it's the one line
  item that only ever grows as users join (dream photos, database
  rows) and never shrinks the way, say, bandwidth naturally
  fluctuates.

## Rate limiting

Two layers (P9.2), deliberately different mechanisms for different
jobs — see `src/lib/rate-limit-edge.ts`'s own header for the full
reasoning:

- **Coarse, blanket**: `proxy.ts` throttles every write-method request
  (POST/PUT/PATCH/DELETE — this covers Server Actions too, which Next.js
  sends as POST to the same page route) per IP, in-memory,
  best-effort — a backstop against a scripted flood, not a precise
  guarantee, and not guaranteed to survive a cold start or hold
  consistently across concurrent instances.
- **Precise, named**: signup, login, password reset, and export each
  get a Postgres-backed check (`src/lib/rate-limit.ts`, migration
  0042) — per-IP *and* per-account where both make sense (login,
  signup, password reset), which survives restarts and is consistent
  across every instance, at the cost of one DB round trip per call.
  Reserved for the handful of surfaces where the limit actually needs
  to be exact.

Password reset (P9.3, `/forgot-password`) was the one named gap P9.2
flagged and left unbuilt — `requestPasswordReset`
(`src/app/(auth)/forgot-password/actions.ts`) uses the same
per-IP-and-per-account shape as login, just with looser numbers (3 per
account / 10 per IP per 15 minutes, vs. login's 5/20 — a genuine
password-reset request is rarer per person than a login attempt).

## CI vs. deploy

`.github/workflows/ci.yml` has two jobs on every pull request: `ci` (`tsc
--noEmit`, ESLint, `next build`) and `db-isolation` (P9.0 — replays every
migration against a clean Postgres 17 instance, then runs every
`supabase/local/*` suite, failing the build on any RLS/isolation
regression, an uncovered table, or a missing `security_invoker`). Both are
gates, not pipeline stages — neither deploys anything. Vercel's own GitHub
integration builds and deploys independently of them: a PR gets a preview
deployment, a merge to the default branch deploys to production. Both
happen whether or not CI passes; CI existing alongside that is what makes
a red PR visible before merge, not what makes deployment happen.
