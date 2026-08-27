-- P4.4: momentum, divergence, and trends.
--
-- This fixes a latent bug in the already-live `v_rating_divergence`
-- (0014) rather than building on top of it as-is. That view is
-- `security_invoker`, and joins `goal_ratings` to `check_ins` directly:
--
--   from goal_ratings gr join check_ins ci on ci.id = gr.check_in_id
--
-- `check_ins_all` (the only RLS policy on check_ins) is `user_id =
-- auth.uid()` for every command, with no allowance for a shared goal's
-- other participants. Under `security_invoker`, that policy is enforced
-- as the *querying* user, for every table the view touches — so for any
-- real (non-superuser) session, the `ci` side of that join only ever
-- matches the querying user's own check-ins. A participant's row whose
-- check_in_id belongs to someone else's check-in is silently dropped by
-- the inner join before `count(distinct gr.user_id)` ever runs, so
-- `having count(distinct gr.user_id) > 1` can never be true from any
-- real user's perspective — the view was returning zero rows for
-- everyone, always, the exact opposite of its purpose. `007 checkin
-- test`'s divergence assertion never caught this because that script
-- runs without `set role authenticated`/a JWT claim (unlike `002 rls
-- test`), so it exercises this view as an RLS-bypassing superuser.
--
-- The fix follows 0016's own pattern for the identical class of
-- problem (`app.compute_goal_rag` needing to read across a goal's
-- tasks/milestones/ledger regardless of the caller's RLS): a SECURITY
-- DEFINER function does the actual cross-participant read, and a thin
-- `security_invoker` view sits in front of it, gated on `goals` — whose
-- RLS (owner OR active participant) is the *correct* authorization
-- boundary for "can this viewer see how people rated this goal", not
-- check_ins' narrower "is this your own weekly check-in".
--
-- v_goal_rating_trend is new: the per-participant raw (user_id,
-- period_start, score) rows the sparkline and the divergence callout's
-- "who rated what" sentence both need — v_rating_divergence itself only
-- has the aggregate (min/max/spread/mean), not who scored which end of
-- it.
create or replace function app.rating_divergence(p_goal_id uuid)
returns table (
  period_start date,
  rater_count integer,
  min_score smallint,
  max_score smallint,
  spread smallint,
  mean_score numeric
)
language sql
stable
security definer
set search_path = public, app
as $$
  select
    ci.period_start,
    count(distinct gr.user_id)::int,
    min(gr.score),
    max(gr.score),
    (max(gr.score) - min(gr.score))::smallint,
    round(avg(gr.score), 2)
  from goal_ratings gr
  join check_ins ci on ci.id = gr.check_in_id
  where gr.goal_id = p_goal_id
    and ci.submitted_at is not null
  group by ci.period_start
  having count(distinct gr.user_id) > 1;
$$;

-- create or replace fails here: the old view's rater_count was bigint
-- (a plain count(*)), the new one is integer (app.rating_divergence's
-- own return type) — Postgres won't let CREATE OR REPLACE VIEW change a
-- column's type, so this drops and recreates instead. Nothing depends
-- on this view besides its own grant.
drop view public.v_rating_divergence;

create view public.v_rating_divergence
with (security_invoker = true) as
select g.id as goal_id, d.*
from goals g
cross join lateral app.rating_divergence(g.id) d
where g.deleted_at is null;

grant select on public.v_rating_divergence to authenticated;

-- Every submitted rating on the goal, per participant per period — no
-- aggregation, since the sparkline draws one line per participant (P4.4
-- brief: "not an average") and the divergence callout needs to name
-- who scored what, not just how far apart they were.
create or replace function app.goal_rating_trend(p_goal_id uuid)
returns table (
  user_id uuid,
  period_start date,
  score smallint
)
language sql
stable
security definer
set search_path = public, app
as $$
  select gr.user_id, ci.period_start, gr.score
  from goal_ratings gr
  join check_ins ci on ci.id = gr.check_in_id
  where gr.goal_id = p_goal_id
    and ci.submitted_at is not null;
$$;

create or replace view public.v_goal_rating_trend
with (security_invoker = true) as
select g.id as goal_id, t.*
from goals g
cross join lateral app.goal_rating_trend(g.id) t
where g.deleted_at is null;

grant select on public.v_goal_rating_trend to authenticated;
