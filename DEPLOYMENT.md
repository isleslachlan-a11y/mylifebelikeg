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
