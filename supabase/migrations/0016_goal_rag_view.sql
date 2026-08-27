-- P4.2: the public-schema surface RAG display needs. Same shape as
-- 0015 — `app.compute_goal_rag`/`app.effective_goal_rag` aren't
-- PostgREST-reachable (confirmed live, 0014/0015's own findings), so
-- this is a single view standing in front of both, one row per goal,
-- rather than a per-goal RPC round trip for every list/timeline/
-- dashboard render.
--
-- `cross join lateral` rather than a plain join: app.compute_goal_rag
-- is a set-returning function, called once per goal row with that row's
-- own id — the `where g.deleted_at is null` filter here matches the
-- same predicate compute_goal_rag applies internally before it ever
-- looks up the goal, so it always finds it and this always yields
-- exactly one row per goal (never the function's own "goal not found"
-- empty-set case).
--
-- effective_status (app.effective_goal_rag) and overall_status
-- (compute_goal_rag's own, override-blind) are both exposed
-- deliberately: effective_status is what a status dot should render —
-- "honouring any live override" (P4.2 brief) — while overall_status
-- and the three per-dimension statuses are what the goal-detail
-- breakdown needs, since an override only ever replaces the *overall*
-- colour, never the individual dimensions it was computed from.
-- is_overridden mirrors 0014's app.snapshot_checkin_rag's own
-- was_overridden check verbatim, for the same reason: an override is
-- "live" only while unexpired, not merely non-null.
--
-- security_invoker (rule 3): RLS on `goals` (owner OR active
-- participant) still governs which rows a caller ever sees here, same
-- as querying `goals` directly would. app.compute_goal_rag/
-- app.effective_goal_rag are both SECURITY DEFINER internally (0014-era
-- precedent) so they can read across tasks/milestones/ledger/etc.
-- regardless of the caller's own RLS — that's intentional elevation for
-- computing the numbers, not a hole in who can see them: this view is
-- still gated by `goals`' own RLS before compute_goal_rag ever runs.
create or replace view public.v_goal_rag
with (security_invoker = true) as
select
  g.id as goal_id,
  r.schedule_status,
  r.budget_status,
  r.momentum_status,
  r.overall_status,
  app.effective_goal_rag(g.id) as effective_status,
  r.schedule_variance_pp,
  r.budget_variance_pp,
  r.momentum_mean,
  r.inputs,
  (g.rag_override is not null
   and g.rag_override_expires_at is not null
   and g.rag_override_expires_at > now()) as is_overridden
from goals g
cross join lateral app.compute_goal_rag(g.id) r
where g.deleted_at is null;

grant select on public.v_goal_rag to authenticated;
