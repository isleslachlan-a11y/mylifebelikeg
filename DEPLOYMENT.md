# Deployment

Deployed on Vercel with its default Next.js (App Router) build — no
`vercel.json` in this repo because nothing here needs overriding: framework
detection, build command, and output are all correct on defaults. Add one
only when a real requirement shows up (custom headers, redirects, a cron
job, etc.), not preemptively.

## Environment variables

Set these in Vercel → Project → Settings → Environment Variables.

| Variable                        | Value                               | Public or secret                                                                                                                         |
| ------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://<project-ref>.supabase.co` | Public                                                                                                                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/publishable key                | Public                                                                                                                                   |
| `SUPABASE_SERVICE_ROLE_KEY`     | service role/secret key             | **Secret**                                                                                                                               |
| `EXCHANGE_RATE_API_KEY`         | key from exchangerate-api.com       | **Secret**                                                                                                                               |
| `FX_REFRESH_CRON_SECRET`        | any random string you generate      | **Secret** (optional — only needed if an external scheduler calls `/api/fx/refresh`; the in-app "Refresh rates" button works without it) |

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
   (`0009_whatever.sql`, following the `000N_description.sql` convention
   the existing local test scripts already assume — see
   `supabase/local/002 rls test`, which asserts grants specifically come
   from `0008_grants.sql`).
2. Apply it to the real project — `supabase db push` if linked, or via the
   SQL editor in the Supabase dashboard.
3. Regenerate types from the now-updated schema:
   `SUPABASE_PROJECT_ID=<project-ref> npm run db:types`. Commit the
   regenerated `src/types/database.ts` in the same PR as the migration —
   never hand-edit that file (see `src/lib/supabase/README.md`).
4. Before applying anywhere real, sanity-check the migration locally
   against a throwaway Postgres per `Schema.MD`'s "Running it locally"
   section, especially if it touches RLS.

## CI vs. deploy

`.github/workflows/ci.yml` runs `tsc --noEmit`, ESLint, and `next build` on
every pull request. It's a gate, not a pipeline stage — it doesn't deploy
anything. Vercel's own GitHub integration builds and deploys independently
of it: a PR gets a preview deployment, a merge to the default branch
deploys to production. Both happen whether or not CI passes; CI existing
alongside that is what makes a red PR visible before merge, not what makes
deployment happen.
