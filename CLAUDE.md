# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A life-planning web app for setting goals, planning trips, and tracking progress against budgets and timelines. Individual-first: every object is owned by one person, and sharing is an explicit grant on top. Designed to scale beyond two users to public signup.

## Stack

Next.js (App Router) + TypeScript, Supabase (Postgres + Auth + RLS), Tailwind CSS, shadcn/ui, deployed on Vercel.

## Non-negotiable rules

1. All monetary values are integers in minor units (cents/pence) with an explicit 3-letter currency code alongside. Never floats, never a bare number. Format for display only at the render boundary.
2. Never query Supabase from client components with the service role key. All privileged operations go through Next.js route handlers or server actions.
3. Row Level Security is the security boundary. Never disable it, never bypass it with the service role to "make a query work". If a query returns nothing, the policy is the thing to inspect.
4. Dates are stored UTC (`timestamptz`) or as a bare `date` where time of day is meaningless. Display in the user's timezone from `profiles.timezone`.
5. Task dates are derived from `offset_days` + `duration_days`, never entered directly.
6. Database types are generated from the schema, never hand-written. Regenerate after any migration.
7. No `localStorage` or `sessionStorage` for application data.

## Schema

The full data model lives in `Schema.MD` and the migrations in `supabase/migrations/`. These are the source of truth — read them rather than inferring table shapes.

## Gotchas

- This Next.js version deprecated `middleware.ts` in favor of `src/proxy.ts` (exported function named `proxy`, not `middleware`). A `middleware.ts` file is silently never invoked — no build error, no warning in dev output beyond an easy-to-miss deprecation notice — and because it's also at the project root rather than `src/` (this project uses `src/app`), a root-level `proxy.ts` is *also* silently never invoked. Confirm it's live by checking `next build` output for a `ƒ Proxy (Middleware)` line.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
