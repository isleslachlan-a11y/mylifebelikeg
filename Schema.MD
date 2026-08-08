# Data model

Postgres / Supabase. 24 tables across 7 migrations, all validated against Postgres 16.

## Running it locally

```bash
createdb starmap
psql -d starmap -f supabase/local/000_auth_shim.sql     # local only, NOT for Supabase
for f in supabase/migrations/*.sql; do psql -d starmap -v ON_ERROR_STOP=1 -f "$f"; done
psql -d starmap -f supabase/local/001_smoke_test.sql    # logic assertions
psql -d starmap -f supabase/local/002_rls_test.sql      # isolation assertions
```

On Supabase, skip `supabase/local/` entirely — the platform provides `auth.users` and `auth.uid()`.

## Shape of it

```
profiles ──┬── life_areas                    (timeline lanes)
           ├── pots ── cashflow_items        (private money, never shared)
           └── goals ──┬── goal_participants (pledges, per person, per pot)
                       ├── milestones
                       ├── tasks ── task_dependencies
                       ├── ledger_entries
                       ├── goal_ratings ── check_ins
                       ├── rag_snapshots
                       └── trips ──┬── trip_stops
                                   └── trip_legs
someday_items ─→ (promoted into) trip_stops
share_grants / invitations                   (everything not covered by participants)
achievements / user_achievements / avatar_presets / llama_messages
```

## Decisions worth knowing

**A trip is a goal.** `goals.kind = 'trip'` plus one row in `trips`. It inherits budget, RAG, participants and timeline placement rather than reimplementing them. A trigger enforces that only trip-kind goals get a `trips` row.

**Shared goals are one row, never mirrored copies.** One `goals` row, many `goal_participants`. Two copies would drift, and divergent ratings would become meaningless.

**Pledges live on the participant, not the goal.** This is what makes "individual pots + shared goals" coherent: the goal has a target, each participant pledges from their own pot in their own currency, and `v_goal_funding.is_underfunded` fires when pledges fall short of target.

**All money is `BIGINT` minor units plus an explicit `char(3)` currency.** No floats. The only `numeric` is the FX rate itself.

**FX is stamped at write time.** `ledger_entries` stores the rate used and the converted base amount. Historical records never silently re-value when today's rate moves. `app.fx_rate()` falls back to the inverse pair if the direct one is missing.

**Task dates are derived.** `offset_days` + `duration_days`; `computed_start`/`computed_end` are scheduler caches so the timeline can range-query without recomputing the graph on every read.

**Dependency cycles are rejected at write time.** A recursive-CTE trigger. Without it, the CPM forward pass hangs and the cause is very hard to trace back to the offending row.

**RLS is deny-by-default on all 24 tables**, with `SECURITY DEFINER` helper functions (`app.can_view_goal`, `app.can_edit_goal`, `app.has_grant`) to avoid policy recursion. Verified by `002_rls_test.sql`, which asserts a collaborator on a shared goal **cannot** see the other person's pot, cashflow, check-ins or someday list — and that an anonymous session sees nothing at all.

**Two things you may want to push back on:**
1. RAG is computed on read via `app.compute_goal_rag()` **and** snapshotted into `rag_snapshots` at each check-in, so you get trend history rather than only a current colour.
2. Ledger entries against a shared goal are visible to all participants. Co-planning a budget you can't see doesn't work — but it does mean spend on a shared goal isn't private.

## RAG, as implemented

Three dimensions scored independently, worst wins. `grey` never wins.

| | Green | Amber | Red |
|---|---|---|---|
| **Schedule** (progress% − elapsed%, duration-weighted) | ≥ −5pp | −5 to −15pp | < −15pp |
| **Budget** (save_toward: saved ÷ required-to-date) | ≥100% | 90–99% | <90% |
| **Budget** (spend_against: spend% − elapsed%) | ≤5pp | 5–15pp | >15pp |
| **Momentum** (mean of last 3 ratings, all participants) | ≥3.5 | 2.0–3.49 | <2.0 |

Forced red: overdue incomplete milestone, overdue critical-path task, spend already over target, or three consecutive missed check-ins.
Underfunded pledges cap the budget dimension at amber.
Goals under 14 days old are always green. Goals with neither tasks nor budget are **grey — Undefined**, never green.
Overrides require a reason and an expiry, and fall back to computed once expired.

## Built but not yet wired

`trip_stops.computed_arrival` / `computed_departure`, `tasks.computed_start` / `computed_end`, `tasks.total_float_days` and `is_critical` are all columns the scheduler writes. The scheduler itself is Phase 3 (dates) and Phase 5 (CPM). Until then the app must populate them on write.

`achievements` ships with nine seeded rows; the unlock evaluator is Phase 7.