-- P4.0's prerequisite: the check-in engine. Weekly period derivation,
-- idempotent check-in creation, streaks, cross-participant rating
-- divergence, and the RAG-history snapshot taken on submit.
--
-- This file documents what's already running live, the same situation
-- 0009/0011/0012 were in — the SQL below was verified against the real
-- project directly (`supabase db dump --schema app|public`), not
-- hand-derived, so unlike those three this one didn't need a "review by
-- hand before applying" caveat: applying it is a no-op `create or
-- replace` against the live objects it's transcribing.
--
-- Numbering: last committed migration was 0012. 0013 isn't in this repo
-- either, and this file doesn't try to guess what it was — the same
-- gap 0010 already established a precedent for (CLAUDE.md's Database
-- section). 0014 is simply the number this package was given.
--
-- Depends on objects this migration does NOT define, all pre-existing
-- (part of the original uncaptured 0001-0008, per Schema.MD's "RAG, as
-- implemented" already describing them as current fact before this
-- phase started): `app.today_for_user()`, `app.compute_goal_rag()`,
-- `app.effective_goal_rag()`, `app.worst_rag()`, `profiles.check_in_day`,
-- and the `check_ins`/`goal_ratings`/`rag_snapshots` tables themselves
-- (including `check_ins`' `check_ins_user_period` unique index on
-- (user_id, period_start) — that's what makes a concurrent double-call
-- to `ensure_current_checkin` fail loudly on the second insert rather
-- than silently duplicate; this migration doesn't add exception
-- handling around that because the live function doesn't either).
--
-- PostgREST only exposes `public`/`graphql_public` (confirmed live —
-- see schedule-variance.ts's and budget-variance.ts's top comments for
-- the same finding on `app.compute_goal_rag`/`app.financial_horizon`).
-- Every function below lives in `app` for that reason and is reachable
-- from triggers/views, not directly from the client. `v_rating_divergence`
-- is the one object here a Server Component/Action can actually SELECT
-- via the client. Whatever check-in UI ends up calling
-- `ensure_current_checkin`/submitting a check-in will need a `public`
-- wrapper (RPC) or a server action running the equivalent SQL directly —
-- a decision for that package, not this one.

-- ---------------------------------------------------------------------
-- Period derivation. A 7-day window ending on the most recent occurrence
-- of profiles.check_in_day (1=Monday..7=Sunday, isodow), computed off
-- app.today_for_user() rather than current_date — reusing the timezone
-- fix so a period boundary can't land on the wrong day the way raw UTC
-- current_date would (PHASE-3-REQUIREMENTS.MD's R2 bug, one level up).
-- ---------------------------------------------------------------------
create or replace function app.current_checkin_period(p_user_id uuid)
returns table (period_start date, period_end date)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_today date;
  v_day   smallint;
  v_back  integer;
  v_end   date;
begin
  v_today := app.today_for_user(p_user_id);
  select check_in_day into v_day from profiles where id = p_user_id;
  v_day := coalesce(v_day, 7);

  -- Days back from today to the most recent check_in_day (0 if today is it).
  v_back := (extract(isodow from v_today)::int - v_day + 7) % 7;
  v_end  := v_today - v_back;

  return query select (v_end - 6)::date, v_end;
end;
$$;

-- Idempotent: returns the current period's check_ins row, creating it
-- as an unsubmitted draft if it doesn't exist yet. The auth.uid() guard
-- only fires for an authenticated caller impersonating someone else —
-- auth.uid() is null for the service role and for the local auth shim's
-- unauthenticated psql sessions, so neither is blocked from passing an
-- explicit p_user_id.
create or replace function app.ensure_current_checkin(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_period record;
  v_id     uuid;
begin
  if p_user_id <> auth.uid() and auth.uid() is not null then
    raise exception 'Cannot create a check-in for another user'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_period from app.current_checkin_period(p_user_id);

  select id into v_id from check_ins
   where user_id = p_user_id and period_start = v_period.period_start;

  if v_id is not null then
    return v_id;
  end if;

  insert into check_ins (user_id, period_start, period_end)
  values (p_user_id, v_period.period_start, v_period.period_end)
  returning id into v_id;

  return v_id;
end;
$$;

-- Consecutive *submitted* weeks, walking backwards from the most
-- recently completed period (period_start - 7, - 14, ...) so an absent
-- or still-draft current period never breaks a streak — only a missing
-- submission on a period that's already over does. The current period
-- is checked separately at the end and only ever adds to the count,
-- never resets it. Capped at 520 iterations (ten years) as a guard
-- against a runaway loop, not because a real streak could plausibly
-- get there.
create or replace function app.checkin_streak(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_period  record;
  v_expect  date;
  v_streak  integer := 0;
  v_found   boolean;
begin
  select * into v_period from app.current_checkin_period(p_user_id);

  -- Walk backwards from the most recently completed period.
  v_expect := v_period.period_start - 7;

  loop
    select exists (
      select 1 from check_ins
      where user_id = p_user_id
        and period_start = v_expect
        and submitted_at is not null
    ) into v_found;

    exit when not v_found;

    v_streak := v_streak + 1;
    v_expect := v_expect - 7;

    exit when v_streak > 520;  -- ten years; guard against a runaway loop
  end loop;

  -- A submitted check-in for the current period extends the streak.
  if exists (
    select 1 from check_ins
    where user_id = p_user_id
      and period_start = v_period.period_start
      and submitted_at is not null
  ) then
    v_streak := v_streak + 1;
  end if;

  return v_streak;
end;
$$;

-- ---------------------------------------------------------------------
-- Where participants disagree on the same goal in the same period.
-- Grouped by (goal_id, period_start) rather than by check_in_id — each
-- participant submits their own check_ins row for the week, so two
-- people's ratings on a shared goal live under two different
-- check_in_ids that happen to share a period_start. `having count(...)
-- > 1` excludes goals nobody else rated that period: a single rater
-- can't diverge from themselves, so there's nothing worth surfacing.
-- security_invoker (default since Postgres 15, explicit here per
-- CLAUDE.md rule 3) so RLS on goal_ratings/check_ins gates this exactly
-- like querying either table directly would.
-- ---------------------------------------------------------------------
create or replace view public.v_rating_divergence
with (security_invoker = true) as
select
  gr.goal_id,
  ci.period_start,
  count(distinct gr.user_id) as rater_count,
  min(gr.score) as min_score,
  max(gr.score) as max_score,
  (max(gr.score) - min(gr.score)) as spread,
  round(avg(gr.score), 2) as mean_score
from goal_ratings gr
join check_ins ci on ci.id = gr.check_in_id
where ci.submitted_at is not null
group by gr.goal_id, ci.period_start
having count(distinct gr.user_id) > 1;

-- Explicit grant, not inherited — same reasoning as 0009/0011/0012:
-- nothing here can see whether an earlier, uncommitted migration used
-- ALTER DEFAULT PRIVILEGES for future public views, so grant directly.
grant select on public.v_rating_divergence to authenticated;

-- ---------------------------------------------------------------------
-- RAG history on submit. Snapshots every goal actually rated in this
-- check-in (not every active goal the user has — momentum aside, the
-- other two dimensions don't need a rating to be computable, but tying
-- the snapshot to what the user actually reviewed this session keeps
-- rag_snapshots a record of "what was looked at," not a second
-- independently-scheduled cron sweep). was_overridden records whether
-- an active override was in effect at snapshot time, not whether the
-- computed and overridden colours differ.
-- ---------------------------------------------------------------------
create or replace function app.snapshot_checkin_rag(p_check_in_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  g      record;
  r      record;
  v_over boolean;
  v_n    integer := 0;
begin
  for g in
    select distinct gr.goal_id
    from goal_ratings gr
    where gr.check_in_id = p_check_in_id
  loop
    select * into r from app.compute_goal_rag(g.goal_id);
    continue when r is null;

    select (rag_override is not null
            and rag_override_expires_at is not null
            and rag_override_expires_at > now())
      into v_over
      from goals where id = g.goal_id;

    insert into rag_snapshots (
      goal_id, check_in_id, schedule_status, budget_status, momentum_status,
      overall_status, schedule_variance_pp, budget_variance_pp, momentum_mean,
      was_overridden, inputs
    ) values (
      g.goal_id, p_check_in_id, r.schedule_status, r.budget_status,
      r.momentum_status, r.overall_status, r.schedule_variance_pp,
      r.budget_variance_pp, r.momentum_mean, coalesce(v_over, false), r.inputs
    );

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

-- Fires the snapshot above and clears stale overrides, both only on the
-- null -> not-null submitted_at transition (never on an edit to an
-- already-submitted check-in, and never on the draft insert itself).
-- "Stale" means the override was set before the period being submitted
-- started — i.e. a newer check-in now has fresher information than
-- whatever prompted the override, so it falls back to computed rather
-- than persisting indefinitely. Ordinary expiry (rag_override_expires_at
-- passing) is handled separately by app.effective_goal_rag, not here.
create or replace function app.on_checkin_submitted()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if new.submitted_at is not null and old.submitted_at is null then
    perform app.snapshot_checkin_rag(new.id);

    update goals g
       set rag_override = null,
           rag_override_reason = null,
           rag_override_expires_at = null
     where g.owner_id = new.user_id
       and g.rag_override is not null
       and g.rag_override_at < new.period_start;
  end if;
  return new;
end;
$$;

create or replace trigger check_ins_on_submit
after update of submitted_at on public.check_ins
for each row execute function app.on_checkin_submitted();

-- ---------------------------------------------------------------------
-- Advisory raise/lower suggestion for profiles.active_goal_limit, off
-- the last 3 submitted weeks' capacity_rating. Needs 3 data points
-- minimum (returns no rows below that — "not enough history" is a real
-- outcome, not a bug) since a suggestion off 1-2 weeks is closer to
-- noise than signal. "Struggling" reuses app.effective_goal_rag (the
-- override-aware read), not app.compute_goal_rag directly, so an
-- intentional override that's still within its expiry isn't counted
-- against the user's capacity.
-- ---------------------------------------------------------------------
create or replace function app.suggest_goal_limit_change(p_user_id uuid)
returns table (direction text, reason text, current_limit smallint)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_limit      smallint;
  v_recent     numeric;
  v_n_capacity integer;
  v_active     integer;
  v_struggling integer;
begin
  select active_goal_limit into v_limit from profiles where id = p_user_id;

  select count(*), avg(capacity_rating)
    into v_n_capacity, v_recent
  from (
    select capacity_rating from check_ins
     where user_id = p_user_id and submitted_at is not null and capacity_rating is not null
     order by period_start desc limit 3
  ) c;

  if v_n_capacity < 3 then
    return;  -- not enough history to suggest anything
  end if;

  select count(*) into v_active
    from goals where owner_id = p_user_id and state = 'active' and deleted_at is null;

  select count(*) into v_struggling
    from goals g
   where g.owner_id = p_user_id and g.state = 'active' and g.deleted_at is null
     and app.effective_goal_rag(g.id) in ('amber', 'red');

  if v_recent >= 4 and v_struggling = 0 and v_active >= v_limit then
    return query select 'raise'::text,
      'Three strong weeks with nothing slipping.'::text, v_limit;
  elsif v_recent <= 2 then
    return query select 'lower'::text,
      'Capacity has been low for three weeks running.'::text, v_limit;
  elsif v_active > 0 and v_struggling::numeric / v_active > 0.33 then
    return query select 'lower'::text,
      'More than a third of your goals are slipping.'::text, v_limit;
  end if;
end;
$$;
