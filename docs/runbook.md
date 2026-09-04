# Runbook

For the moment something is actually wrong. Written so the steps don't
need to be worked out from scratch at 2am — copy-pasteable commands,
not prose to interpret under pressure.

Project: Supabase org **Tokos** (`pdfrpwopjclkfxnxtfha`), project
**MyLifeBeLike** (`sajqimckalucfhifxkgy`, `ap-northeast-1`). Vercel team
**tokos1**, project `my-life-be-like`.

---

## Backups and restore

### Current status: **no backups exist**. This is a real gap, not a false alarm.

Confirmed directly against the live project (`supabase backups list
--project-ref sajqimckalucfhifxkgy`), not assumed from the plan name:

```
{"region":"ap-northeast-1","walg_enabled":true,"pitr_enabled":false,"backups":[],...}
```

The Tokos org is on Supabase's **Free** plan
(`GET /v1/organizations/pdfrpwopjclkfxnxtfha` → `"plan": "free"`). Free
projects get **zero** backups of any kind — no daily snapshots, no
PITR, nothing. `walg_enabled: true` just means the underlying
replication mechanism backups would use is running; it does not mean
anything is actually being retained. If this project is ever lost —
a bad migration, an accidental `delete from`, a Supabase-side incident
— **there is currently no way to get the data back**, other than
whatever's in a local `pg_dump` someone happened to take by hand.

This was found and documented (P9.2) but deliberately **not** acted on
without an explicit decision to spend money — upgrading is real, ongoing
cost, not something to do silently on someone else's behalf. Below is
the exact procedure for both the upgrade and the restore test, ready to
run the moment that decision is made.

### To close the gap: upgrade, then actually test a restore

**Step 1 — Upgrade the org to Pro** (minimum US$25/mo; required for
*any* backup feature at all). Via the dashboard: Organization Settings
→ Billing → Change plan → Pro. There is no Management API endpoint for
changing a subscription plan (checked directly — `GET
/v1/organizations/{id}/billing/subscription` doesn't exist on this
API), so this step can't be scripted.

Pro includes **daily backups, 7-day retention**, no extra add-on
needed. If continuous (minute-level, not once-daily) recovery matters
more than 7-day daily snapshots, also add the **Point-in-Time Recovery**
add-on from the same Billing page (extra cost on top of Pro) — decide
based on how much data loss between the last daily snapshot and an
incident is tolerable versus the add-on's price.

**Step 2 — Confirm backups are actually running** (don't just trust the
upgrade — check):

```bash
npx supabase backups list --project-ref sajqimckalucfhifxkgy
```

Expect `"backups": [...]` to be non-empty within 24 hours of upgrading
(daily backups need at least one cycle to run), and `"pitr_enabled":
true` if the add-on was purchased.

**Step 3 — Perform an actual restore test.** "An untested backup is a
belief, not a backup" (brief, verbatim) — this step is not optional,
and re-running it once (not just once ever) after any major schema
change is worth doing.

Two restore shapes exist on Supabase; pick based on what's actually
available:

- **Restore to a new project** (daily/physical backups, Pro's base
  tier) — the safer test, since it never touches the live project.
  **Dashboard-only** — Database → Backups → pick a backup → "Restore to
  new project." No CLI/API equivalent exists for this specific
  operation (checked — `supabase backups restore` only supports
  PITR-timestamp restores against an existing project, not
  clone-to-new).
- **PITR restore** (if the add-on is active) — restores a project **in
  place**, to a specific timestamp:

  ```bash
  npx supabase backups restore --project-ref sajqimckalucfhifxkgy --timestamp <unix-epoch-seconds>
  ```

  Never run this against the live project ref as a *test* — it's a
  real, in-place rollback. If PITR is the only restore option
  available, create a disposable scratch project first
  (`npx supabase projects create` — costs its own project-tier spend;
  a `small`/`micro` size is enough for a verification pass) and prove
  the restore mechanism works there conceptually before ever running it
  for real against production during an actual incident.

**Step 4 — Verify the restored data is actually intact**, not just that
the restore command exited 0:

```bash
# Point at the restored project's connection string
psql "$RESTORED_PROJECT_DB_URL" -c "select count(*) from goals;"
psql "$RESTORED_PROJECT_DB_URL" -c "select count(*) from profiles;"
psql "$RESTORED_PROJECT_DB_URL" -c "select max(created_at) from ledger_entries;"
```

Compare counts against what's expected from the live project at
roughly the backup's timestamp. A restore that completes without error
but silently drops rows (a bad `pg_restore` flag, a truncated dump) is
worse than an obviously-failed one — this is the step that catches it.

**Step 5 — Record the result here.** Once a real restore has actually
been performed:

> _(fill in when done)_ Restored on **[date]** from a **[daily
> backup / PITR timestamp]** dated **[backup timestamp]**, into
> **[new project ref / in-place]**. Verified: `goals` count matched
> (**N** rows), `profiles` count matched (**N** rows), most recent
> `ledger_entries.created_at` matched. Elapsed time: **[duration]**.

An unfilled version of this line six months from now is itself a
signal — it means the last real test is that old, and it's worth
redoing.

---

## Error monitoring (Sentry)

DSN-optional (see `DEPLOYMENT.md`'s "Error monitoring" section) — if
`NEXT_PUBLIC_SENTRY_DSN` isn't set anywhere, nothing below applies yet;
set it up first.

**Finding an error**: sentry.io → the project → Issues. Every event is
already scrubbed before it arrives (`src/lib/sentry-scrub.ts`) — no
request body, no `_minor`-suffixed money field, no email/token/cookie.
**This means Sentry cannot answer "what exact amount was in the
request that failed"** — that's deliberate, not a bug in the tooling.
If a specific failing value genuinely needs to be reconstructed:

1. Check the stack trace and breadcrumbs first — usually enough to
   find the code path without needing the actual payload.
2. If not, Vercel's own function logs (Vercel dashboard → project →
   Logs, or `vercel logs <deployment-url>`) retain recent invocation
   logs — but treat these with the **same** caution as the database
   itself: they can carry request data Sentry deliberately doesn't.
   Don't paste log output into a ticket, a Slack message, or anywhere
   outside of what's already access-controlled the way the database is.
3. As a last resort, reproduce with a disposable test account and
   deliberately trigger the same code path with synthetic data.

**Triggering a test error** to confirm the pipeline end-to-end (do this
once after first setting the DSN, and again after any change to
`sentry-scrub.ts`, `instrumentation.ts`, or `instrumentation-client.ts`):

```ts
// Temporarily, anywhere in a Server Component or Server Action:
throw new Error("P9.2 Sentry verification — safe to ignore/delete");
```

Confirm in Sentry: the issue appears, the stack trace resolves to real
source lines (not minified/anonymous — this is the source-map upload
working), and the release is tagged with a real commit SHA. Then remove
the test throw.

## Rate limiting

Buckets live in `app.rate_limits` (migration 0042) — not
PostgREST-reachable directly (no RLS policy grants client access; only
`public.check_rate_limit`'s service-role-gated wrapper touches it), so
inspecting or clearing one needs the SQL editor or a direct `psql`
connection, not the API.

**A real user got rate-limited and needs unblocking right now**:

```sql
-- Find what's blocking them first -- bucket names are
-- "<surface>:<dimension>:<value>", e.g. login:account:someone@example.com
select * from app.rate_limits where bucket like '%someone@example.com%';

-- Clear it
delete from app.rate_limits where bucket = 'login:account:someone@example.com';
```

**The blanket edge throttle** (`src/lib/rate-limit-edge.ts`) has no
persistent state to inspect or clear — it's an in-memory map inside
whatever Vercel Edge instance served the request, and naturally clears
itself within the window (60 seconds) or on the next cold start. If
someone is stuck on this one, waiting under a minute resolves it; there
is no faster manual override.

## Account deletion processor

`/api/account/process-deletions`, driven by `vercel.json`'s daily cron.
To check whether it's actually running: Vercel dashboard → project →
Cron Jobs, or `vercel logs` filtered to that route.

**Trigger it manually** (needs `CRON_SECRET`):

```bash
curl -X POST https://my-life-be-like.vercel.app/api/account/process-deletions \
  -H "Authorization: Bearer $CRON_SECRET"
```

Response is a JSON summary (`checked`, `succeeded`, `failed`). A
non-empty `failed` array names the stage each failure happened at
(`storage`/`prepare`/`auth`) — re-running is always safe (see migration
0041's own comments on why every step is idempotent); a failure just
means the account stays "due" and gets picked up again next run.

## Uptime monitoring

`/api/health` needs `HEALTH_CHECK_SECRET` — see `DEPLOYMENT.md`'s
"Uptime monitoring" section for the external-monitor setup (not
automatable, dashboard/third-party-account work). To check it by hand:

```bash
curl -i https://my-life-be-like.vercel.app/api/health \
  -H "Authorization: Bearer $HEALTH_CHECK_SECRET"
```

`200 {"status":"ok","database":"reachable",...}` is healthy. `503
{"status":"error","database":"unreachable"}` means the app is up but
Postgres isn't answering — check Supabase's own status page and the
project's dashboard for an active incident before assuming it's this
app's fault.

## Spend caps and usage alerts

See `DEPLOYMENT.md`'s own section for where to set these up (both are
dashboard-only, not scriptable). When an alert actually fires:

1. Check **which** resource — Supabase's alert breakdown, or Vercel's
   usage dashboard, names the specific line item.
2. If it's **storage**: this is the one that never shrinks on its own
   (dream photos, database growth). Check for an obviously runaway
   cause first (a bug re-uploading the same photo repeatedly, a
   scraper hammering `/api/export`) before assuming it's organic growth
   that needs a plan upgrade.
3. If it's **bandwidth/compute**: check Vercel's own request logs for
   a traffic spike — a scripted attacker is a very different response
   (block at the edge, check the rate limiters above are actually
   firing) than organic growth (a plan conversation).

## Rotating a secret

`CRON_SECRET`, `HEALTH_CHECK_SECRET`, `FX_REFRESH_CRON_SECRET`,
`SENTRY_AUTH_TOKEN` are all independent, single-purpose values — none
of them need to be rotated together, and rotating one never affects
another:

1. Generate a new random value (`openssl rand -hex 32` is fine).
2. Update it in Vercel → Project → Settings → Environment Variables,
   for both Production and Preview.
3. Redeploy (env var changes don't take effect on already-running
   instances until the next deploy).
4. Update whatever external caller uses the old value (the uptime
   monitor for `HEALTH_CHECK_SECRET`, Vercel Cron picks up
   `CRON_SECRET` automatically since it's Vercel's own mechanism).
