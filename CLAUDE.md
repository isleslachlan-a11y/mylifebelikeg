# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A life-planning web app for setting goals, planning trips, and tracking progress against budgets and timelines. Individual-first: every object is owned by one person, and sharing is an explicit grant on top. Designed to scale beyond two users to public signup. Currently early-stage (see commit history: `P0.x` = pre-launch phase 0 milestones — auth, shell, and scaffolding are in; the timeline/goals/money features themselves are mostly unbuilt pages).

## Stack

Next.js 16 (App Router) + TypeScript, Supabase (Postgres + Auth + RLS), Tailwind CSS v4, shadcn/ui (`radix-nova` style), deployed on Vercel.

## Commands

```bash
npm run dev          # start dev server
npm run build         # production build (also run by CI)
npm run lint          # eslint
npm run format         # prettier --write .
npx tsc --noEmit       # type check (CI runs this after `next typegen`, see below)
npm run db:types       # regenerate src/types/database.ts from the live schema; requires SUPABASE_PROJECT_ID
```

There is no `npm test` / unit test runner in this repo. Correctness for SQL (schema, triggers, RLS) is checked by running the `supabase/local/*` scripts against a scratch Postgres — see "Database" below. There's also no Storybook; UI states meant for visual review live at `/styleguide` and `/styleguide/llamas` (real routes in the running app, not a separate tool).

CI (`.github/workflows/ci.yml`, runs on every PR) does, in order: `npx next typegen` (needed so `tsc` can see route-generated types like `LayoutProps`/`PageProps`), `tsc --noEmit`, `npm run lint`, `npm run build`. It's a gate only — Vercel's own GitHub integration builds and deploys independently of it, so CI passing/failing doesn't control whether a deploy happens.

To run a single check rather than the whole CI sequence, run that one command above directly — there's no per-file or per-test filtering because there's no test runner.

## Non-negotiable rules

1. All monetary values are integers in minor units (cents/pence) with an explicit 3-letter currency code alongside. Never floats, never a bare number. Format for display only at the render boundary.
2. Never query Supabase from client components with the service role key. All privileged operations go through Next.js route handlers or server actions.
3. Row Level Security is the security boundary. Never disable it, never bypass it with the service role to "make a query work". If a query returns nothing, the policy is the thing to inspect.
4. Dates are stored UTC (`timestamptz`) or as a bare `date` where time of day is meaningless. Display in the user's timezone from `profiles.timezone`.
5. Task dates are derived from `offset_days` + `duration_days`, never entered directly.
6. Database types are generated from the schema, never hand-written. Regenerate after any migration.
7. No `localStorage` or `sessionStorage` for application data.

## Architecture

**Route groups.** `src/app/(auth)/` (login, signup, onboarding — reachable while unauthenticated) and `src/app/(app)/` (dashboard, timeline, goals, trips, money, check-in, profile — gated). The split is enforced in code, not just by folder naming: `src/lib/supabase/middleware.ts` (invoked from `src/proxy.ts`, see Gotchas) redirects based on auth state and whether a `profiles` row exists yet, using explicit `AUTH_ROUTES`/`UNGATED_ROUTES` allow-lists rather than inferring from the route group.

**Three Supabase client constructors, not one** — pick the one matching where the code runs, don't share instances across requests:
- `src/lib/supabase/client.ts` — browser/Client Components, anon key.
- `src/lib/supabase/server.ts` — Server Components/route handlers/Server Actions, cookie-based session, created fresh per request.
- `src/lib/supabase/middleware.ts` — the proxy/middleware layer specifically; the one place session-cookie writes are guaranteed to succeed (Server Components can't write cookies at all — `server.ts`'s `setAll` silently no-ops there by design).

**The llama message system** (`src/lib/llamas/`) is the app's copy/notification layer: two personas, Derek (blunt, handles red/amber/overdue) and Fluffy (warm, handles green/completions/streaks). `types.ts` defines the `TriggerCode` union and per-trigger params; `registry.ts` maps each trigger to a speaker + priority (the speaker is decided once, centrally — call sites never pick a llama); `copy.ts` holds enumerable copy variants per trigger, viewable side-by-side at `/styleguide/llamas`. Adding a new triggered message means touching all three files. Wiring these triggers to real app events hasn't happened yet — `copy.ts`'s `getLlamaCopy` is what real call sites will eventually use.

**Database.** `Schema.MD` is the narrative source of truth for the data model (24 tables, RLS design, RAG scoring rules, FX handling, what's built vs. not-yet-wired) — read it before touching anything schema-adjacent, it explains *why* the shape is what it is, not just what it is. As of this writing `supabase/migrations/` referenced there doesn't yet exist in this repo (the live Supabase project's schema is ahead of committed migration files); `src/types/database.ts` is already generated against the real schema, so trust that file for current table/column shapes even where migration SQL is absent. `supabase/local/*` are numbered psql scripts (auth shim, smoke test, RLS isolation test, schedule test) for validating schema changes against a throwaway local Postgres before they touch the real project — see the "Running it locally" section of `Schema.MD` for the exact sequence.

**Deployment** is documented in `DEPLOYMENT.md`: no `vercel.json` (defaults are correct), the three required env vars and why `SUPABASE_SERVICE_ROLE_KEY` must never gain a `NEXT_PUBLIC_` prefix, Supabase Auth redirect allow-list config, and the migration-then-regenerate-types workflow.

## Gotchas

- This Next.js version deprecated `middleware.ts` in favor of `src/proxy.ts` (exported function named `proxy`, not `middleware`). A `middleware.ts` file is silently never invoked — no build error, no warning in dev output beyond an easy-to-miss deprecation notice — and because it's also at the project root rather than `src/` (this project uses `src/app`), a root-level `proxy.ts` is *also* silently never invoked. Confirm it's live by checking `next build` output for a `ƒ Proxy (Middleware)` line.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
