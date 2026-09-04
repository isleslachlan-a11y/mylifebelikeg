-- P9.0: the schema as it stood immediately before 0009. Migrations
-- 0001-0008 and 0010/0013 were never captured as files at all -- every
-- change in that range was applied directly against the live project
-- (the same "written ahead of the code... only ever inserted directly
-- into production" pattern Schema.MD documents repeatedly for later
-- migrations, just earlier and total). CLAUDE.md's own Database section
-- has said as much since P5.5: "supabase/migrations/ is still catching
-- up to the live schema and isn't a complete, replayable log." That was
-- fine when the only thing replaying migrations was a human, by hand,
-- against a project that already had the early schema. It stops being
-- fine the moment something (P9.0's own CI workflow) needs to build the
-- schema from nothing on a fresh Postgres instance, which is exactly
-- what "applies every migration in order to a clean database" requires.
--
-- There is no way to recover the *original* 0001-0008/0010/0013 SQL --
-- this project was never CLI-managed (no `supabase_migrations` schema
-- on the live project, confirmed directly), so no history was ever
-- tracked beyond the live schema itself. What follows instead is
-- reconstructed forward from that live schema: a full schema-only dump,
-- with every object 0009 onward creates fresh, every column those
-- migrations add, and every constraint they change, mechanically
-- removed back out (via a script cross-referenced against each of those
-- migration files' own DDL, not hand-transcribed) -- so that replaying
-- this file followed by 0009, 0011, 0012, 0014 through 0036 in order
-- reproduces the live schema exactly. Verified by doing precisely that
-- against a fresh Postgres 17 instance and diffing the result against a
-- fresh live dump (this package's own acceptance work) -- not assumed
-- from the reconstruction process alone.
--
-- Numbered 0008 (not 0001) deliberately: it sits immediately before
-- 0009, which is where the captured log actually begins, and this
-- repo's own numbering has never been gapless (0010/0013 stay
-- unclaimed, per CLAUDE.md) -- 0008 reads as "the last thing before the
-- log starts," which is what this file is.
--
-- Roles (anon/authenticated/service_role) are NOT created here -- those
-- are Supabase-platform-managed on a real project, never something a
-- migration creates; supabase/local/000 auth shim creates them locally,
-- the same file that already shims auth.* and storage.* for the same
-- reason.
--
-- PostgreSQL database dump
--

\restrict keN8UOAYrHIjUMuE55EbhCGAr1R5Ne8yQdtAMELTlrqkwQCAHbwwvHazGbjlgLs

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app;

--
-- Name: SCHEMA app; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA app IS 'Internal helper functions. Not exposed to PostgREST.';

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';

--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.booking_status AS ENUM (
    'idea',
    'researching',
    'booked',
    'done',
    'cancelled'
);

--
-- Name: cadence; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cadence AS ENUM (
    'one_off',
    'weekly',
    'fortnightly',
    'monthly',
    'quarterly',
    'annually'
);

--
-- Name: cashflow_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cashflow_kind AS ENUM (
    'income',
    'expense'
);

--
-- Name: dependency_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dependency_type AS ENUM (
    'fs',
    'ss',
    'ff',
    'sf'
);

--
-- Name: funding_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.funding_type AS ENUM (
    'none',
    'save_toward',
    'spend_against'
);

--
-- Name: goal_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.goal_kind AS ENUM (
    'standard',
    'trip'
);

--
-- Name: goal_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.goal_state AS ENUM (
    'active',
    'someday',
    'completed',
    'archived',
    'abandoned'
);

--
-- Name: ledger_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ledger_kind AS ENUM (
    'contribution',
    'expense'
);

--
-- Name: llama_frequency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.llama_frequency AS ENUM (
    'all',
    'important_only',
    'muted'
);

--
-- Name: llama_speaker; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.llama_speaker AS ENUM (
    'derek',
    'fluffy'
);

--
-- Name: participant_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.participant_role AS ENUM (
    'owner',
    'collaborator',
    'viewer'
);

--
-- Name: rag_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rag_status AS ENUM (
    'green',
    'amber',
    'red',
    'grey'
);

--
-- Name: share_scope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.share_scope AS ENUM (
    'view',
    'edit'
);

--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status AS ENUM (
    'not_started',
    'in_progress',
    'blocked',
    'done',
    'cancelled'
);

--
-- Name: travel_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.travel_mode AS ENUM (
    'flight',
    'train',
    'bus',
    'car',
    'ferry',
    'boat',
    'walk',
    'cycle',
    'other'
);

--
-- Name: visibility_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.visibility_level AS ENUM (
    'private',
    'shared'
);

--
-- Name: affordable_from(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.affordable_from(p_goal_id uuid) RETURNS date
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare
  g          record;
  v_today    date;
  v_contrib  bigint;
  v_remain   numeric;
  v_monthly  numeric;
  v_months   integer;
begin
  select * into g from goals where id = p_goal_id and deleted_at is null;
  if not found or g.funding <> 'save_toward' or g.target_amount_minor is null then
    return null;
  end if;

  v_today := app.today_for_user(g.owner_id);

  select coalesce(contributed_minor, 0) into v_contrib
  from v_goal_funding where goal_id = p_goal_id;

  v_remain := greatest(0, g.target_amount_minor - v_contrib);

  if v_remain = 0 then
    return v_today;
  end if;

  select sum(round(gp.monthly_allocation_minor
    * app.fx_rate(gp.pledged_currency, g.currency)))
  into v_monthly
  from goal_participants gp
  where gp.goal_id = p_goal_id
    and gp.removed_at is null
    and gp.monthly_allocation_minor is not null;

  v_months := app.months_to_afford(v_remain, v_monthly);
  if v_months is null then
    return null;
  end if;

  return (date_trunc('month', v_today::timestamp)
          + make_interval(months => v_months))::date;
end;
$$;

--
-- Name: can_edit_goal(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.can_edit_goal(p_goal_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
  select exists (
    select 1
    from goals g
    where g.id = p_goal_id
      and g.deleted_at is null
      and (
        g.owner_id = auth.uid()
        or exists (
          select 1 from goal_participants gp
          where gp.goal_id = g.id
            and gp.user_id = auth.uid()
            and gp.removed_at is null
            and gp.role in ('owner', 'collaborator')
        )
      )
  );
$$;

--
-- Name: can_view_goal(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.can_view_goal(p_goal_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
  select exists (
    select 1
    from goals g
    where g.id = p_goal_id
      and g.deleted_at is null
      and (
        g.owner_id = auth.uid()
        or exists (
          select 1 from goal_participants gp
          where gp.goal_id = g.id
            and gp.user_id = auth.uid()
            and gp.removed_at is null
        )
      )
  );
$$;

--
-- Name: cascade_goal_start_date(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.cascade_goal_start_date() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
begin
  if new.start_date is distinct from old.start_date then
    perform app.recompute_goal_schedule(new.id);
  end if;
  return null;
end;
$$;

--
-- Name: cascade_trip_goal_date(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.cascade_trip_goal_date() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare v_trip uuid;
begin
  if new.start_date is distinct from old.start_date then
    select id into v_trip from trips where goal_id = new.id;
    if v_trip is not null then
      perform app.recompute_trip_schedule(v_trip);
    end if;
  end if;
  return null;
end;
$$;

--
-- Name: compute_goal_rag(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.compute_goal_rag(p_goal_id uuid) RETURNS TABLE(schedule_status public.rag_status, budget_status public.rag_status, momentum_status public.rag_status, overall_status public.rag_status, schedule_variance_pp numeric, budget_variance_pp numeric, momentum_mean numeric, inputs jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare
  g                 record;
  fund              record;
  v_today           date;
  v_elapsed_pct     numeric;
  v_progress_pct    numeric;
  v_sched_var       numeric;
  v_sched           rag_status := 'grey';
  v_budget          rag_status := 'grey';
  v_momentum        rag_status := 'grey';
  v_budget_var      numeric;
  v_momentum_mean   numeric;
  v_rating_count    integer := 0;
  v_missed_streak   integer := 0;
  v_task_total      numeric := 0;
  v_task_done       numeric := 0;
  v_overdue_ms      integer := 0;
  v_overdue_crit    integer := 0;
  v_required_minor  numeric;
  v_has_tasks       boolean;
  v_has_budget      boolean;
begin
  select * into g from goals where id = p_goal_id and deleted_at is null;
  if not found then
    return;
  end if;

  v_today := app.today_for_user(g.owner_id);

  select * into fund from v_goal_funding where goal_id = p_goal_id;

  if g.created_at > now() - interval '14 days' then
    return query select 'green'::rag_status, 'green'::rag_status, 'green'::rag_status,
      'green'::rag_status, null::numeric, null::numeric, null::numeric,
      jsonb_build_object('reason', 'grace_period', 'today', v_today);
    return;
  end if;

  -- ---- Dimension 1: schedule -------------------------------------------------
  select
    coalesce(sum(greatest(duration_days, 1)), 0),
    coalesce(sum(greatest(duration_days, 1)) filter (where status = 'done'), 0)
  into v_task_total, v_task_done
  from tasks
  where goal_id = p_goal_id and deleted_at is null and status <> 'cancelled';

  v_has_tasks := v_task_total > 0;

  if g.start_date is not null and g.target_date is not null and v_has_tasks then
    if g.target_date <= g.start_date then
      v_elapsed_pct := 100;
    else
      v_elapsed_pct := greatest(0, least(100,
        (v_today - g.start_date)::numeric / (g.target_date - g.start_date)::numeric * 100));
    end if;

    v_progress_pct := v_task_done / v_task_total * 100;
    v_sched_var := round(v_progress_pct - v_elapsed_pct, 2);

    v_sched := case
      when v_sched_var >= -5  then 'green'::rag_status
      when v_sched_var >= -15 then 'amber'::rag_status
      else 'red'::rag_status
    end;

    select count(*) into v_overdue_ms
    from milestones
    where goal_id = p_goal_id and deleted_at is null
      and completed_at is null and due_date < v_today;

    select count(*) into v_overdue_crit
    from tasks
    where goal_id = p_goal_id and deleted_at is null and is_critical
      and status not in ('done', 'cancelled')
      and computed_end is not null and computed_end < v_today;

    if v_overdue_ms > 0 or v_overdue_crit > 0 then
      v_sched := 'red';
    end if;
  end if;

  -- ---- Dimension 2: budget ---------------------------------------------------
  v_has_budget := g.funding <> 'none' and g.target_amount_minor is not null;

  if v_has_budget then
    if g.funding = 'save_toward' then
      if g.start_date is not null and g.target_date is not null and g.target_date > g.start_date then
        v_required_minor := g.target_amount_minor
          * least(1, greatest(0,
              (v_today - g.start_date)::numeric / (g.target_date - g.start_date)::numeric));
      else
        v_required_minor := g.target_amount_minor;
      end if;

      if v_required_minor > 0 then
        v_budget_var := round(coalesce(fund.contributed_minor, 0) / v_required_minor * 100, 2);
        v_budget := case
          when v_budget_var >= 100 then 'green'::rag_status
          when v_budget_var >= 90  then 'amber'::rag_status
          else 'red'::rag_status
        end;
      else
        v_budget := 'green';
        v_budget_var := 100;
      end if;

    else
      v_elapsed_pct := case
        when g.start_date is null or g.target_date is null or g.target_date <= g.start_date then 100
        else greatest(0, least(100,
          (v_today - g.start_date)::numeric / (g.target_date - g.start_date)::numeric * 100))
      end;

      v_budget_var := round(
        coalesce(fund.spent_minor, 0)::numeric / nullif(g.target_amount_minor, 0) * 100
        - v_elapsed_pct, 2);

      v_budget := case
        when v_budget_var <= 5  then 'green'::rag_status
        when v_budget_var <= 15 then 'amber'::rag_status
        else 'red'::rag_status
      end;

      if coalesce(fund.spent_minor, 0) > g.target_amount_minor then
        v_budget := 'red';
      end if;
    end if;

    if coalesce(fund.is_underfunded, false) and v_budget = 'green' then
      v_budget := 'amber';
    end if;
  end if;

  -- ---- Dimension 3: momentum -------------------------------------------------
  select count(*), avg(score)
  into v_rating_count, v_momentum_mean
  from (
    select gr.score
    from goal_ratings gr
    join check_ins ci on ci.id = gr.check_in_id
    where gr.goal_id = p_goal_id and ci.submitted_at is not null
    order by ci.period_start desc
    limit 3 * greatest(1, (
      select count(*) from goal_participants
      where goal_id = p_goal_id and removed_at is null
    ))
  ) recent;

  if v_rating_count >= 3 then
    v_momentum_mean := round(v_momentum_mean, 2);
    v_momentum := case
      when v_momentum_mean >= 3.5 then 'green'::rag_status
      when v_momentum_mean >= 2.0 then 'amber'::rag_status
      else 'red'::rag_status
    end;
  end if;

  select count(*) into v_missed_streak
  from (
    select ci.id
    from check_ins ci
    where ci.user_id = g.owner_id
      and ci.submitted_at is not null
      and not exists (
        select 1 from goal_ratings gr
        where gr.check_in_id = ci.id and gr.goal_id = p_goal_id
      )
    order by ci.period_start desc
    limit 3
  ) missed;

  if v_missed_streak >= 3 and g.state = 'active' then
    v_momentum := 'red';
  end if;

  if not v_has_tasks and not v_has_budget then
    return query select 'grey'::rag_status, 'grey'::rag_status, v_momentum,
      'grey'::rag_status, null::numeric, null::numeric, v_momentum_mean,
      jsonb_build_object('reason', 'undefined_goal', 'today', v_today);
    return;
  end if;

  return query select
    v_sched,
    v_budget,
    v_momentum,
    app.worst_rag(v_sched, v_budget, v_momentum),
    v_sched_var,
    v_budget_var,
    v_momentum_mean,
    jsonb_build_object(
      'today', v_today,
      'owner_timezone', (select timezone from profiles where id = g.owner_id),
      'elapsed_pct', round(coalesce(v_elapsed_pct, 0), 2),
      'progress_pct', round(coalesce(v_progress_pct, 0), 2),
      'task_weight_total', v_task_total,
      'task_weight_done', v_task_done,
      'overdue_milestones', v_overdue_ms,
      'overdue_critical_tasks', v_overdue_crit,
      'rating_count', v_rating_count,
      'missed_streak', v_missed_streak,
      'is_underfunded', coalesce(fund.is_underfunded, false)
    );
end;
$$;

--
-- Name: derive_task_dates(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.derive_task_dates() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare
  v_start date;
begin
  select start_date into v_start from goals where id = new.goal_id;

  if v_start is null then
    new.computed_start := null;
    new.computed_end   := null;
  else
    new.computed_start := v_start + new.offset_days;
    new.computed_end   := v_start + new.offset_days + new.duration_days;
  end if;

  return new;
end;
$$;

--
-- Name: effective_goal_rag(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.effective_goal_rag(p_goal_id uuid) RETURNS public.rag_status
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare
  g record;
  computed rag_status;
begin
  select * into g from goals where id = p_goal_id and deleted_at is null;
  if not found then return null; end if;

  if g.rag_override is not null
     and g.rag_override_expires_at is not null
     and g.rag_override_expires_at > now() then
    return g.rag_override;
  end if;

  select overall_status into computed from app.compute_goal_rag(p_goal_id);
  return computed;
end;
$$;

--
-- Name: enforce_trip_goal_kind(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.enforce_trip_goal_kind() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
begin
  if not exists (select 1 from goals where id = new.goal_id and kind = 'trip') then
    raise exception 'trips.goal_id must reference a goal with kind = ''trip'''
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

--
-- Name: evaluate_achievements(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.evaluate_achievements(p_user_id uuid) RETURNS TABLE(code text, name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare
  a            record;
  v_qualifies  boolean;
  v_ctx        jsonb;
  v_count      integer;
  v_threshold  integer;
begin
  for a in
    select ac.* from achievements ac
    where ac.is_active
      and not exists (
        select 1 from user_achievements ua
        where ua.user_id = p_user_id and ua.achievement_id = ac.id
      )
  loop
    v_qualifies := false;
    v_ctx := '{}'::jsonb;
    v_threshold := coalesce((a.trigger_config->>'count')::integer,
                            (a.trigger_config->>'weeks')::integer,
                            (a.trigger_config->>'amount_minor')::integer,
                            1);

    case a.trigger_type

      when 'goals_completed' then
        select count(*) into v_count
        from goals
        where owner_id = p_user_id and state = 'completed' and deleted_at is null;
        v_qualifies := v_count >= v_threshold;
        v_ctx := jsonb_build_object('count', v_count);

      when 'trips_completed' then
        select count(*) into v_count
        from goals g
        join trips t on t.goal_id = g.id
        where g.owner_id = p_user_id and g.state = 'completed'
          and g.deleted_at is null and t.deleted_at is null;
        v_qualifies := v_count >= v_threshold;
        v_ctx := jsonb_build_object('count', v_count);

      when 'tasks_completed' then
        select count(*) into v_count
        from tasks where owner_id = p_user_id and status = 'done' and deleted_at is null;
        v_qualifies := v_count >= v_threshold;
        v_ctx := jsonb_build_object('count', v_count);

      when 'checkin_streak' then
        v_count := app.checkin_streak(p_user_id);
        v_qualifies := v_count >= v_threshold;
        v_ctx := jsonb_build_object('streak', v_count);

      when 'countries_visited' then
        select count(*) into v_count
        from v_countries_visited where user_id = p_user_id;
        v_qualifies := v_count >= v_threshold;
        v_ctx := jsonb_build_object('countries', v_count);

      when 'savings_milestone' then
        select coalesce(sum(base_amount_minor), 0)::integer into v_count
        from ledger_entries
        where user_id = p_user_id and entry_type = 'contribution' and deleted_at is null;
        v_qualifies := v_count >= v_threshold;
        v_ctx := jsonb_build_object('saved_minor', v_count);

      when 'goal_on_time' then
        select count(*) into v_count
        from goals g
        left join v_goal_funding f on f.goal_id = g.id
        where g.owner_id = p_user_id
          and g.state = 'completed'
          and g.deleted_at is null
          and g.target_date is not null
          and g.completed_at is not null
          and (g.completed_at at time zone 'UTC')::date <= g.target_date
          and (g.target_amount_minor is null
               or coalesce(f.spent_minor, 0) <= g.target_amount_minor);
        v_qualifies := v_count >= v_threshold;
        v_ctx := jsonb_build_object('count', v_count);

      when 'capacity_honesty' then
        v_qualifies := coalesce((a.trigger_config->>'granted')::boolean, false);

      when 'goal_under_budget' then
        select count(*) into v_count
        from goals g
        left join v_goal_funding f on f.goal_id = g.id
        where g.owner_id = p_user_id
          and g.state = 'completed'
          and g.deleted_at is null
          and g.target_amount_minor is not null
          and coalesce(f.spent_minor, 0) <= g.target_amount_minor;
        v_qualifies := v_count >= v_threshold;
        v_ctx := jsonb_build_object('count', v_count);

      when 'shared_goal' then
        v_qualifies := exists (
          select 1 from goals g
          where g.deleted_at is null
            and (
              g.owner_id = p_user_id
              or exists (
                select 1 from goal_participants gp
                where gp.goal_id = g.id and gp.user_id = p_user_id and gp.removed_at is null
              )
            )
            and (
              exists (
                select 1 from goal_participants gp
                where gp.goal_id = g.id and gp.removed_at is null and gp.user_id <> p_user_id
              )
              or g.owner_id <> p_user_id
            )
        );

      when 'checkin_tenure' then
        select count(*) into v_count
        from check_ins
        where user_id = p_user_id and submitted_at is not null;
        v_qualifies := v_count >= v_threshold;
        v_ctx := jsonb_build_object('count', v_count);

      when 'trip_stop_booked' then
        v_qualifies := exists (
          select 1 from trip_stops ts
          join trips t on t.id = ts.trip_id
          join goals g on g.id = t.goal_id
          where g.owner_id = p_user_id
            and g.deleted_at is null
            and ts.deleted_at is null
            and ts.booking_state in ('booked', 'done')
        );

      when 'someday_count' then
        select count(*) into v_count
        from someday_items
        where user_id = p_user_id and deleted_at is null;
        v_qualifies := v_count >= v_threshold;
        v_ctx := jsonb_build_object('count', v_count);

      -- P8.0: mirrors goals_completed exactly, per the brief — a dream
      -- is "achieved" the moment achieved_at is set, regardless of
      -- whether it was ever promoted into a trip stop first (promoting
      -- and achieving are different events, brief, verbatim — this
      -- counts achieved_at alone, never promoted_at).
      when 'dreams_achieved' then
        select count(*) into v_count
        from someday_items
        where user_id = p_user_id and achieved_at is not null and deleted_at is null;
        v_qualifies := v_count >= v_threshold;
        v_ctx := jsonb_build_object('count', v_count);

      else
        v_qualifies := false;  -- 'manual' and anything unrecognised
    end case;

    if v_qualifies then
      begin
        insert into user_achievements (user_id, achievement_id, context)
        values (p_user_id, a.id, v_ctx);

        code := a.code;
        name := a.name;
        return next;
      exception when unique_violation then
        null;  -- concurrent evaluation already granted it
      end;
    end if;
  end loop;
end;
$$;

--
-- Name: filter_llama_message(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.filter_llama_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare
  v_freq llama_frequency;
begin
  select llama_frequency into v_freq from profiles where id = new.user_id;

  if v_freq = 'muted' then
    return null;
  end if;

  if v_freq = 'important_only' and new.priority > 1 then
    return null;
  end if;

  return new;
end;
$$;

--
-- Name: fx_rate(character, character, date); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.fx_rate(p_from character, p_to character, p_as_of date DEFAULT CURRENT_DATE) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
  select case
    when p_from = p_to then 1::numeric
    else coalesce(
      (select rate from fx_rates
        where base_currency = p_from and quote_currency = p_to and as_of <= p_as_of
        order by as_of desc limit 1),
      (select 1 / rate from fx_rates
        where base_currency = p_to and quote_currency = p_from and as_of <= p_as_of
        order by as_of desc limit 1)
    )
  end;
$$;

--
-- Name: grant_achievement(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.grant_achievement(p_user_id uuid, p_code text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare v_id uuid;
begin
  if p_user_id <> auth.uid() and auth.uid() is not null then
    raise exception 'Cannot grant an achievement to another user'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_id from achievements where code = p_code and is_active;
  if v_id is null then
    return false;
  end if;

  insert into user_achievements (user_id, achievement_id)
  values (p_user_id, v_id)
  on conflict (user_id, achievement_id) do nothing;

  return found;
end;
$$;

--
-- Name: has_grant(text, uuid, public.share_scope); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.has_grant(p_resource_type text, p_resource_id uuid, p_scope public.share_scope DEFAULT 'view'::public.share_scope) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
  select exists (
    select 1 from share_grants sg
    where sg.resource_type = p_resource_type
      and sg.resource_id = p_resource_id
      and sg.grantee_id = auth.uid()
      and sg.revoked_at is null
      and (p_scope = 'view' or sg.scope = 'edit')
  );
$$;

--
-- Name: is_currency_code(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_currency_code(p text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
  select p ~ '^[A-Z]{3}$';
$_$;

--
-- Name: is_goal_owner(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_goal_owner(p_goal_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
  select exists (
    select 1 from goals g
    where g.id = p_goal_id and g.deleted_at is null and g.owner_id = auth.uid()
  );
$$;

--
-- Name: months_to_afford(numeric, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.months_to_afford(p_remaining_minor numeric, p_monthly_rate_minor numeric) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when p_remaining_minor <= 0 then 0
    when p_monthly_rate_minor is null or p_monthly_rate_minor <= 0 then null
    else ceil(p_remaining_minor / p_monthly_rate_minor)::integer
  end;
$$;

--
-- Name: on_trip_stop_change(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.on_trip_stop_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
begin
  perform app.recompute_trip_schedule(coalesce(new.trip_id, old.trip_id));
  return null;
end;
$$;

--
-- Name: presets_unlocked_by(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.presets_unlocked_by(p_user_id uuid, p_achievement_code text) RETURNS TABLE(code text, category text, name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
  select ap.code, ap.category, ap.name
  from avatar_presets ap
  join achievements ac on ac.id = ap.unlock_achievement_id
  where ac.code = p_achievement_code and ap.is_active
  order by ap.category, ap.sort_order;
$$;

--
-- Name: prevent_dependency_cycle(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.prevent_dependency_cycle() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_cycle boolean;
begin
  with recursive reachable as (
    select new.predecessor_task_id as task_id
    union
    select td.predecessor_task_id
    from task_dependencies td
    join reachable r on td.successor_task_id = r.task_id
  )
  select exists (select 1 from reachable where task_id = new.successor_task_id)
  into v_cycle;

  if v_cycle then
    raise exception 'Dependency would create a cycle (% -> %)',
      new.predecessor_task_id, new.successor_task_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

--
-- Name: promote_someday_to_stop(uuid, uuid, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.promote_someday_to_stop(p_someday_id uuid, p_trip_id uuid, p_nights integer DEFAULT 2) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare
  s      record;
  v_seq  integer;
  v_id   uuid;
begin
  select * into s from someday_items
   where id = p_someday_id and deleted_at is null and user_id = auth.uid();

  if not found then
    raise exception 'Someday item not found' using errcode = 'no_data_found';
  end if;

  if not exists (
    select 1 from trips t where t.id = p_trip_id and app.can_edit_goal(t.goal_id)
  ) then
    raise exception 'Not allowed to edit this trip' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(max(sequence) + 1, 0) into v_seq
  from trip_stops where trip_id = p_trip_id and deleted_at is null;

  insert into trip_stops (
    trip_id, someday_item_id, sequence, name, place_name,
    latitude, longitude, mapbox_place_id, country_code, nights,
    estimated_cost_minor, currency,
    unsplash_photo_id, unsplash_thumb_url, unsplash_full_url,
    unsplash_author_name, unsplash_author_url
  ) values (
    p_trip_id, s.id, v_seq, s.title, s.place_name,
    s.latitude, s.longitude, s.mapbox_place_id, s.country_code, greatest(p_nights, 0),
    s.rough_cost_minor, s.currency,
    s.unsplash_photo_id, s.unsplash_thumb_url, s.unsplash_full_url,
    s.unsplash_author_name, s.unsplash_author_url
  ) returning id into v_id;

  update someday_items set promoted_at = now() where id = p_someday_id;

  return v_id;
end;
$$;

--
-- Name: recompute_goal_schedule(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.recompute_goal_schedule(p_goal_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare
  v_start     date;
  v_rows      integer;
  v_iter      integer := 0;
  v_max_iter  integer;
  v_proj_end  integer;
begin
  select start_date into v_start from goals where id = p_goal_id;

  -- No goal start date: nothing is derivable. Null rather than guess.
  if v_start is null then
    update tasks
       set computed_start = null, computed_end = null,
           total_float_days = null, is_critical = false
     where goal_id = p_goal_id
       and (computed_start is not null or computed_end is not null
            or total_float_days is not null or is_critical);
    return;
  end if;

  -- ---- Simple case: no dependencies. Straight offsets, no float, no CPM. ----
  if not app.goal_has_dependencies(p_goal_id) then
    update tasks t
       set computed_start    = v_start + t.offset_days,
           computed_end      = v_start + t.offset_days + t.duration_days,
           total_float_days  = null,
           is_critical       = false
     where t.goal_id = p_goal_id
       and t.deleted_at is null;
    return;
  end if;

  -- ---- CPM ------------------------------------------------------------------
  create temporary table if not exists _cpm (
    task_id     uuid primary key,
    duration    integer not null,
    es          integer,          -- earliest start, days from goal start
    ef          integer,          -- earliest finish
    ls          integer,          -- latest start
    lf          integer,          -- latest finish
    pinned      boolean not null default false
  ) on commit drop;

  delete from _cpm;

  insert into _cpm (task_id, duration, es, ef, pinned)
  select t.id,
         greatest(t.duration_days, 0),
         t.offset_days,
         t.offset_days + greatest(t.duration_days, 0),
         not exists (
           select 1 from task_dependencies td where td.successor_task_id = t.id
         )
  from tasks t
  where t.goal_id = p_goal_id and t.deleted_at is null and t.status <> 'cancelled';

  select count(*) * 2 + 10 into v_max_iter from _cpm;

  -- ---- Forward pass: relax until stable -------------------------------------
  loop
    v_iter := v_iter + 1;

    with needed as (
      select
        s.task_id,
        max(case td.dep_type
              when 'fs' then p.ef + td.lag_days
              when 'ss' then p.es + td.lag_days
              when 'ff' then p.ef + td.lag_days - s.duration
              when 'sf' then p.es + td.lag_days - s.duration
            end) as required_es
      from _cpm s
      join task_dependencies td on td.successor_task_id = s.task_id
      join _cpm p on p.task_id = td.predecessor_task_id
      group by s.task_id
    )
    update _cpm c
       set es = greatest(c.es, n.required_es),
           ef = greatest(c.es, n.required_es) + c.duration
      from needed n
     where c.task_id = n.task_id
       and c.es < n.required_es;

    get diagnostics v_rows = ROW_COUNT;
    exit when v_rows = 0 or v_iter >= v_max_iter;
  end loop;

  -- Project end is the latest earliest-finish across all tasks.
  select max(ef) into v_proj_end from _cpm;

  -- ---- Backward pass --------------------------------------------------------
  update _cpm set lf = v_proj_end, ls = v_proj_end - duration;

  v_iter := 0;
  loop
    v_iter := v_iter + 1;

    with allowed as (
      select
        p.task_id,
        min(case td.dep_type
              when 'fs' then s.ls - td.lag_days
              when 'ss' then s.ls - td.lag_days + p.duration
              when 'ff' then s.lf - td.lag_days
              when 'sf' then s.lf - td.lag_days + p.duration
            end) as allowed_lf
      from _cpm p
      join task_dependencies td on td.predecessor_task_id = p.task_id
      join _cpm s on s.task_id = td.successor_task_id
      group by p.task_id
    )
    update _cpm c
       set lf = least(c.lf, a.allowed_lf),
           ls = least(c.lf, a.allowed_lf) - c.duration
      from allowed a
     where c.task_id = a.task_id
       and c.lf > a.allowed_lf;

    get diagnostics v_rows = ROW_COUNT;
    exit when v_rows = 0 or v_iter >= v_max_iter;
  end loop;

  -- ---- Write back -----------------------------------------------------------
  update tasks t
     set computed_start   = v_start + c.es,
         computed_end     = v_start + c.ef,
         total_float_days = c.ls - c.es,
         is_critical      = (c.ls - c.es) <= 0
    from _cpm c
   where t.id = c.task_id;

  -- Cancelled tasks sit outside the network.
  update tasks
     set total_float_days = null, is_critical = false
   where goal_id = p_goal_id and status = 'cancelled';
end;
$$;

--
-- Name: recompute_trip_schedule(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.recompute_trip_schedule(p_trip_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare
  v_start date;
begin
  select g.start_date into v_start
  from trips t join goals g on g.id = t.goal_id
  where t.id = p_trip_id;

  if v_start is null then
    update trip_stops
       set computed_arrival = null, computed_departure = null, arrival_offset_days = null
     where trip_id = p_trip_id
       and (computed_arrival is not null or computed_departure is not null);
    return;
  end if;

  with ordered as (
    select
      id,
      nights,
      coalesce(sum(nights) over (
        order by sequence
        rows between unbounded preceding and 1 preceding
      ), 0)::integer as offset_days
    from trip_stops
    where trip_id = p_trip_id and deleted_at is null
  )
  update trip_stops ts
     set arrival_offset_days = o.offset_days,
         computed_arrival    = v_start + o.offset_days,
         computed_departure  = v_start + o.offset_days + o.nights
    from ordered o
   where ts.id = o.id;
end;
$$;

--
-- Name: reorder_trip_stop(uuid, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.reorder_trip_stop(p_stop_id uuid, p_new_sequence integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare
  v_trip uuid;
  v_old  integer;
  v_max  integer;
begin
  select trip_id, sequence into v_trip, v_old
  from trip_stops where id = p_stop_id and deleted_at is null;

  if v_trip is null then
    raise exception 'Stop not found' using errcode = 'no_data_found';
  end if;

  if not exists (
    select 1 from trips t where t.id = v_trip and app.can_edit_goal(t.goal_id)
  ) then
    raise exception 'Not allowed to edit this trip' using errcode = 'insufficient_privilege';
  end if;

  select max(sequence) into v_max from trip_stops
   where trip_id = v_trip and deleted_at is null;

  p_new_sequence := greatest(0, least(p_new_sequence, v_max));

  if p_new_sequence = v_old then
    return;
  end if;

  -- trip_stops_sequence_unique is a PARTIAL index and therefore not
  -- deferrable, so it is enforced row-by-row during a multi-row update.
  -- Shifting a block in place collides on intermediate states. Instead:
  -- park every stop above the used range, then write final sequences from a
  -- computed ordering. Neither phase can collide.
  update trip_stops
     set sequence = sequence + 10000
   where trip_id = v_trip and deleted_at is null;

  with desired as (
    select
      id,
      row_number() over (
        order by
          case when id = p_stop_id then p_new_sequence
               when (sequence - 10000) < v_old and (sequence - 10000) < p_new_sequence
                 then (sequence - 10000)
               when (sequence - 10000) > v_old and (sequence - 10000) <= p_new_sequence
                 then (sequence - 10000) - 1
               when (sequence - 10000) < v_old and (sequence - 10000) >= p_new_sequence
                 then (sequence - 10000) + 1
               else (sequence - 10000)
          end,
          case when id = p_stop_id then 0 else 1 end
      ) - 1 as new_seq
    from trip_stops
    where trip_id = v_trip and deleted_at is null
  )
  update trip_stops ts
     set sequence = d.new_seq
    from desired d
   where ts.id = d.id;

  perform app.recompute_trip_schedule(v_trip);
end;
$$;

--
-- Name: seed_life_areas(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.seed_life_areas() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
begin
  insert into life_areas (user_id, name, colour, sort_order, is_system) values
    (new.id, 'Move & Home',       '#7C6BC4', 1, false),
    (new.id, 'Travel',            '#5B8DD9', 2, false),
    (new.id, 'Money',             '#4FB8A5', 3, false),
    (new.id, 'Career & Learning', '#D9A05B', 4, false),
    (new.id, 'Health',            '#C97BA8', 5, false),
    (new.id, 'Us',                '#B85C8A', 6, false),
    (new.id, 'Uncategorised',     '#6B7280', 99, true);
  return new;
end;
$$;

--
-- Name: stamp_ledger_base_amount(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.stamp_ledger_base_amount() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare
  v_base char(3);
  v_rate numeric;
begin
  select base_currency into v_base from profiles where id = new.user_id;
  v_base := coalesce(new.base_currency, v_base, 'AUD');
  v_rate := app.fx_rate(new.currency, v_base, new.occurred_on);

  if v_rate is null then
    raise exception 'No FX rate available for % -> % on %', new.currency, v_base, new.occurred_on
      using errcode = 'no_data_found';
  end if;

  new.base_currency     := v_base;
  new.fx_rate_applied   := v_rate;
  new.base_amount_minor := round(new.amount_minor * v_rate);
  return new;
end;
$$;

--
-- Name: today_for_user(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.today_for_user(p_user_id uuid) RETURNS date
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare
  v_tz text;
begin
  select timezone into v_tz from profiles where id = p_user_id;

  if v_tz is null then
    return (now() at time zone 'UTC')::date;
  end if;

  begin
    return (now() at time zone v_tz)::date;
  exception when others then
    -- Unrecognised timezone string: fall back rather than fail the whole query.
    return (now() at time zone 'UTC')::date;
  end;
end;
$$;

--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;

--
-- Name: validate_avatar(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.validate_avatar() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app'
    AS $$
declare
  k      text;
  v_code text;
  p      record;
begin
  if new.avatar is null or new.avatar = '{}'::jsonb then
    return new;
  end if;

  for k in select jsonb_object_keys(new.avatar) loop
    if k not in ('base', 'outfit', 'pose', 'backdrop', 'accessory') then
      raise exception 'Unknown avatar slot: %', k using errcode = 'check_violation';
    end if;

    v_code := new.avatar->>k;
    continue when v_code is null;

    select ap.*,
           (ap.unlock_achievement_id is null
            or exists (select 1 from user_achievements ua
                        where ua.user_id = new.id
                          and ua.achievement_id = ap.unlock_achievement_id)) as unlocked
      into p
    from avatar_presets ap
    where ap.code = v_code and ap.is_active;

    if not found then
      raise exception 'Unknown avatar preset: %', v_code using errcode = 'check_violation';
    end if;

    if p.category <> k then
      raise exception 'Preset % belongs to category %, not %', v_code, p.category, k
        using errcode = 'check_violation';
    end if;

    if not p.unlocked then
      raise exception 'Avatar preset % is not unlocked yet', v_code
        using errcode = 'insufficient_privilege';
    end if;
  end loop;

  return new;
end;
$$;

--
-- Name: worst_rag(public.rag_status[]); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.worst_rag(VARIADIC p public.rag_status[]) RETURNS public.rag_status
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when 'red'   = any(p) then 'red'::rag_status
    when 'amber' = any(p) then 'amber'::rag_status
    when 'green' = any(p) then 'green'::rag_status
    else 'grey'::rag_status
  end;
$$;

--
-- Name: evaluate_achievements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.evaluate_achievements() RETURNS TABLE(code text, name text)
    LANGUAGE sql
    SET search_path TO 'public', 'app'
    AS $$
  select * from app.evaluate_achievements(auth.uid());
$$;

--
-- Name: grant_achievement(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_achievement(p_code text) RETURNS boolean
    LANGUAGE sql
    SET search_path TO 'public', 'app'
    AS $$
  select app.grant_achievement(auth.uid(), p_code);
$$;

--
-- Name: presets_unlocked_by(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.presets_unlocked_by(p_achievement_code text) RETURNS TABLE(code text, category text, name text)
    LANGUAGE sql
    SET search_path TO 'public', 'app'
    AS $$
  select * from app.presets_unlocked_by(auth.uid(), p_achievement_code);
$$;

--
-- Name: promote_someday_to_stop(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promote_someday_to_stop(someday_id uuid, trip_id uuid, nights integer DEFAULT 2) RETURNS uuid
    LANGUAGE sql
    SET search_path TO 'public', 'app'
    AS $$
  select app.promote_someday_to_stop(someday_id, trip_id, nights);
$$;

--
-- Name: reorder_trip_stop(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reorder_trip_stop(stop_id uuid, new_sequence integer) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public', 'app'
    AS $$
  select app.reorder_trip_stop(stop_id, new_sequence);
$$;

--
-- Name: achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    trigger_type text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    flair_asset text,
    sort_order smallint DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT achievements_code_check CHECK ((code ~ '^[a-z0-9_]{3,50}$'::text)),
    CONSTRAINT achievements_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['goals_completed'::text, 'trips_completed'::text, 'checkin_streak'::text, 'savings_milestone'::text, 'tasks_completed'::text, 'countries_visited'::text, 'goal_on_time'::text, 'capacity_honesty'::text, 'manual'::text])))
);

--
-- Name: avatar_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avatar_presets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    asset_ref text NOT NULL,
    unlock_achievement_id uuid,
    sort_order smallint DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT avatar_presets_category_check CHECK ((category = ANY (ARRAY['base'::text, 'outfit'::text, 'pose'::text, 'backdrop'::text, 'accessory'::text])))
);

--
-- Name: cashflow_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashflow_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind public.cashflow_kind NOT NULL,
    label text NOT NULL,
    amount_minor bigint NOT NULL,
    currency character(3) NOT NULL,
    frequency public.cadence DEFAULT 'monthly'::public.cadence NOT NULL,
    active_from date DEFAULT CURRENT_DATE NOT NULL,
    active_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT cashflow_dates_ordered CHECK (((active_to IS NULL) OR (active_to >= active_from))),
    CONSTRAINT cashflow_items_amount_minor_check CHECK ((amount_minor >= 0)),
    CONSTRAINT cashflow_items_currency_check CHECK (app.is_currency_code((currency)::text)),
    CONSTRAINT cashflow_items_label_check CHECK ((length(TRIM(BOTH FROM label)) > 0))
);

--
-- Name: check_ins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.check_ins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    capacity_rating smallint,
    note text,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_in_period_ordered CHECK ((period_end >= period_start)),
    CONSTRAINT check_ins_capacity_rating_check CHECK (((capacity_rating >= 1) AND (capacity_rating <= 5)))
);

--
-- Name: fx_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fx_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    base_currency character(3) NOT NULL,
    quote_currency character(3) NOT NULL,
    rate numeric(20,10) NOT NULL,
    as_of date NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fx_distinct_currencies CHECK ((base_currency <> quote_currency)),
    CONSTRAINT fx_rates_base_currency_check CHECK (app.is_currency_code((base_currency)::text)),
    CONSTRAINT fx_rates_quote_currency_check CHECK (app.is_currency_code((quote_currency)::text)),
    CONSTRAINT fx_rates_rate_check CHECK ((rate > (0)::numeric))
);

--
-- Name: goal_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.participant_role DEFAULT 'collaborator'::public.participant_role NOT NULL,
    pledged_amount_minor bigint,
    pledged_currency character(3),
    pot_id uuid,
    invited_by uuid,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    removed_at timestamp with time zone,
    monthly_allocation_minor bigint,
    CONSTRAINT allocation_needs_currency CHECK (((monthly_allocation_minor IS NULL) OR (pledged_currency IS NOT NULL))),
    CONSTRAINT goal_participants_monthly_allocation_minor_check CHECK ((monthly_allocation_minor >= 0)),
    CONSTRAINT goal_participants_pledged_amount_minor_check CHECK ((pledged_amount_minor >= 0)),
    CONSTRAINT goal_participants_pledged_currency_check CHECK (app.is_currency_code((pledged_currency)::text)),
    CONSTRAINT pledge_needs_currency CHECK (((pledged_amount_minor IS NULL) OR (pledged_currency IS NOT NULL)))
);

--
-- Name: COLUMN goal_participants.monthly_allocation_minor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.goal_participants.monthly_allocation_minor IS 'How much this participant puts toward this goal per month, in minor units of pledged_currency. Drives the affordable-from calculation.';

--
-- Name: goal_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_in_id uuid NOT NULL,
    goal_id uuid NOT NULL,
    user_id uuid NOT NULL,
    score smallint NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_ratings_score_check CHECK (((score >= 1) AND (score <= 5)))
);

--
-- Name: goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    life_area_id uuid,
    kind public.goal_kind DEFAULT 'standard'::public.goal_kind NOT NULL,
    title text NOT NULL,
    description text,
    state public.goal_state DEFAULT 'active'::public.goal_state NOT NULL,
    visibility public.visibility_level DEFAULT 'private'::public.visibility_level NOT NULL,
    funding public.funding_type DEFAULT 'none'::public.funding_type NOT NULL,
    currency character(3) DEFAULT 'AUD'::bpchar NOT NULL,
    target_amount_minor bigint,
    start_date date,
    target_date date,
    rag_override public.rag_status,
    rag_override_reason text,
    rag_override_by uuid,
    rag_override_at timestamp with time zone,
    rag_override_expires_at timestamp with time zone,
    completed_at timestamp with time zone,
    archived_at timestamp with time zone,
    abandoned_at timestamp with time zone,
    abandon_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT abandoned_needs_reason CHECK (((state <> 'abandoned'::public.goal_state) OR (abandon_reason IS NOT NULL))),
    CONSTRAINT funded_goals_need_target CHECK (((funding = 'none'::public.funding_type) OR (target_amount_minor IS NOT NULL))),
    CONSTRAINT goal_dates_ordered CHECK (((start_date IS NULL) OR (target_date IS NULL) OR (target_date >= start_date))),
    CONSTRAINT goals_currency_check CHECK (app.is_currency_code((currency)::text)),
    CONSTRAINT goals_target_amount_minor_check CHECK ((target_amount_minor >= 0)),
    CONSTRAINT goals_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0)),
    CONSTRAINT override_needs_reason CHECK (((rag_override IS NULL) OR ((rag_override_reason IS NOT NULL) AND (rag_override_expires_at IS NOT NULL))))
);

--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inviter_id uuid NOT NULL,
    email text,
    invitee_id uuid,
    token_hash text NOT NULL,
    resource_type text,
    resource_id uuid,
    scope public.share_scope DEFAULT 'view'::public.share_scope NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '14 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by uuid,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invitations_resource_type_check CHECK ((resource_type = ANY (ARRAY['goal'::text, 'someday_item'::text, 'trip'::text]))),
    CONSTRAINT invite_needs_target CHECK (((email IS NOT NULL) OR (invitee_id IS NOT NULL))),
    CONSTRAINT invite_resource_paired CHECK (((resource_type IS NULL) = (resource_id IS NULL)))
);

--
-- Name: ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    goal_id uuid,
    pot_id uuid,
    entry_type public.ledger_kind NOT NULL,
    amount_minor bigint NOT NULL,
    currency character(3) NOT NULL,
    base_currency character(3) NOT NULL,
    base_amount_minor bigint NOT NULL,
    fx_rate_applied numeric(20,10) NOT NULL,
    occurred_on date DEFAULT CURRENT_DATE NOT NULL,
    description text,
    is_estimate boolean DEFAULT false NOT NULL,
    trip_stop_id uuid,
    trip_leg_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT ledger_entries_amount_minor_check CHECK ((amount_minor > 0)),
    CONSTRAINT ledger_entries_base_amount_minor_check CHECK ((base_amount_minor >= 0)),
    CONSTRAINT ledger_entries_base_currency_check CHECK (app.is_currency_code((base_currency)::text)),
    CONSTRAINT ledger_entries_currency_check CHECK (app.is_currency_code((currency)::text)),
    CONSTRAINT ledger_entries_fx_rate_applied_check CHECK ((fx_rate_applied > (0)::numeric))
);

--
-- Name: life_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.life_areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    colour text DEFAULT '#8B7BD8'::text NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

--
-- Name: llama_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llama_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    speaker public.llama_speaker NOT NULL,
    trigger_code text NOT NULL,
    body text NOT NULL,
    resource_type text,
    resource_id uuid,
    priority smallint DEFAULT 2 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    CONSTRAINT llama_messages_priority_check CHECK (((priority >= 1) AND (priority <= 3))),
    CONSTRAINT llama_messages_resource_type_check CHECK ((resource_type = ANY (ARRAY['goal'::text, 'task'::text, 'trip'::text, 'check_in'::text, 'pot'::text, 'profile'::text]))),
    CONSTRAINT llama_resource_paired CHECK (((resource_type IS NULL) = (resource_id IS NULL)))
);

--
-- Name: milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid NOT NULL,
    title text NOT NULL,
    due_date date NOT NULL,
    completed_at timestamp with time zone,
    sort_order smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT milestones_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0))
);

--
-- Name: pots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    currency character(3) NOT NULL,
    opening_balance_minor bigint DEFAULT 0 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT pots_currency_check CHECK (app.is_currency_code((currency)::text)),
    CONSTRAINT pots_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    handle text NOT NULL,
    display_name text NOT NULL,
    base_currency character(3) DEFAULT 'AUD'::bpchar NOT NULL,
    timezone text DEFAULT 'Australia/Brisbane'::text NOT NULL,
    active_goal_limit smallint DEFAULT 5 NOT NULL,
    llama_frequency public.llama_frequency DEFAULT 'all'::public.llama_frequency NOT NULL,
    avatar jsonb DEFAULT '{}'::jsonb NOT NULL,
    check_in_day smallint DEFAULT 7 NOT NULL,
    onboarded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT handle_format CHECK ((handle ~ '^[a-z0-9_]{3,30}$'::text)),
    CONSTRAINT profiles_active_goal_limit_check CHECK (((active_goal_limit >= 1) AND (active_goal_limit <= 20))),
    CONSTRAINT profiles_base_currency_check CHECK (app.is_currency_code((base_currency)::text)),
    CONSTRAINT profiles_check_in_day_check CHECK (((check_in_day >= 1) AND (check_in_day <= 7)))
);

--
-- Name: rag_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rag_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid NOT NULL,
    check_in_id uuid,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    schedule_status public.rag_status NOT NULL,
    budget_status public.rag_status NOT NULL,
    momentum_status public.rag_status NOT NULL,
    overall_status public.rag_status NOT NULL,
    schedule_variance_pp numeric(6,2),
    budget_variance_pp numeric(6,2),
    momentum_mean numeric(4,2),
    was_overridden boolean DEFAULT false NOT NULL,
    inputs jsonb DEFAULT '{}'::jsonb NOT NULL
);

--
-- Name: share_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid NOT NULL,
    grantor_id uuid NOT NULL,
    grantee_id uuid NOT NULL,
    scope public.share_scope DEFAULT 'view'::public.share_scope NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    CONSTRAINT no_self_grant CHECK ((grantor_id <> grantee_id)),
    CONSTRAINT share_grants_resource_type_check CHECK ((resource_type = ANY (ARRAY['goal'::text, 'someday_item'::text, 'trip'::text, 'profile'::text])))
);

--
-- Name: someday_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.someday_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    notes text,
    life_area_id uuid,
    rough_cost_minor bigint,
    currency character(3),
    place_name text,
    latitude double precision,
    longitude double precision,
    mapbox_place_id text,
    country_code character(2),
    unsplash_photo_id text,
    unsplash_thumb_url text,
    unsplash_full_url text,
    unsplash_author_name text,
    unsplash_author_url text,
    promoted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT someday_coords_paired CHECK (((latitude IS NULL) = (longitude IS NULL))),
    CONSTRAINT someday_cost_needs_currency CHECK (((rough_cost_minor IS NULL) OR (currency IS NOT NULL))),
    CONSTRAINT someday_items_currency_check CHECK (app.is_currency_code((currency)::text)),
    CONSTRAINT someday_items_latitude_check CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))),
    CONSTRAINT someday_items_longitude_check CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))),
    CONSTRAINT someday_items_rough_cost_minor_check CHECK ((rough_cost_minor >= 0)),
    CONSTRAINT someday_items_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0)),
    CONSTRAINT unsplash_needs_attribution CHECK (((unsplash_photo_id IS NULL) OR ((unsplash_author_name IS NOT NULL) AND (unsplash_author_url IS NOT NULL))))
);

--
-- Name: task_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    predecessor_task_id uuid NOT NULL,
    successor_task_id uuid NOT NULL,
    dep_type public.dependency_type DEFAULT 'fs'::public.dependency_type NOT NULL,
    lag_days integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT no_self_dependency CHECK ((predecessor_task_id <> successor_task_id))
);

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid NOT NULL,
    milestone_id uuid,
    owner_id uuid NOT NULL,
    title text NOT NULL,
    notes text,
    offset_days integer DEFAULT 0 NOT NULL,
    duration_days integer DEFAULT 1 NOT NULL,
    computed_start date,
    computed_end date,
    status public.task_status DEFAULT 'not_started'::public.task_status NOT NULL,
    completed_at timestamp with time zone,
    estimated_cost_minor bigint,
    cost_currency character(3),
    total_float_days integer,
    is_critical boolean DEFAULT false NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT done_tasks_have_timestamp CHECK (((status <> 'done'::public.task_status) OR (completed_at IS NOT NULL))),
    CONSTRAINT task_cost_needs_currency CHECK (((estimated_cost_minor IS NULL) OR (cost_currency IS NOT NULL))),
    CONSTRAINT tasks_cost_currency_check CHECK (app.is_currency_code((cost_currency)::text)),
    CONSTRAINT tasks_duration_days_check CHECK ((duration_days >= 0)),
    CONSTRAINT tasks_estimated_cost_minor_check CHECK ((estimated_cost_minor >= 0)),
    CONSTRAINT tasks_offset_days_check CHECK ((offset_days >= 0)),
    CONSTRAINT tasks_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0))
);

--
-- Name: trip_legs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trip_legs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    from_stop_id uuid,
    to_stop_id uuid,
    mode public.travel_mode DEFAULT 'flight'::public.travel_mode NOT NULL,
    duration_minutes integer,
    cost_minor bigint,
    currency character(3),
    booking_state public.booking_status DEFAULT 'idea'::public.booking_status NOT NULL,
    booking_reference text,
    booking_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT leg_cost_needs_currency CHECK (((cost_minor IS NULL) OR (currency IS NOT NULL))),
    CONSTRAINT leg_endpoints_differ CHECK (((from_stop_id IS NULL) OR (to_stop_id IS NULL) OR (from_stop_id <> to_stop_id))),
    CONSTRAINT leg_has_an_endpoint CHECK (((from_stop_id IS NOT NULL) OR (to_stop_id IS NOT NULL))),
    CONSTRAINT trip_legs_cost_minor_check CHECK ((cost_minor >= 0)),
    CONSTRAINT trip_legs_currency_check CHECK (app.is_currency_code((currency)::text)),
    CONSTRAINT trip_legs_duration_minutes_check CHECK ((duration_minutes >= 0))
);

--
-- Name: trip_stops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trip_stops (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    someday_item_id uuid,
    sequence integer NOT NULL,
    name text NOT NULL,
    place_name text,
    latitude double precision,
    longitude double precision,
    mapbox_place_id text,
    country_code character(2),
    nights integer DEFAULT 1 NOT NULL,
    arrival_offset_days integer,
    computed_arrival date,
    computed_departure date,
    estimated_cost_minor bigint,
    currency character(3),
    booking_state public.booking_status DEFAULT 'idea'::public.booking_status NOT NULL,
    booking_reference text,
    booking_url text,
    notes text,
    unsplash_photo_id text,
    unsplash_thumb_url text,
    unsplash_full_url text,
    unsplash_author_name text,
    unsplash_author_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT stop_coords_paired CHECK (((latitude IS NULL) = (longitude IS NULL))),
    CONSTRAINT stop_cost_needs_currency CHECK (((estimated_cost_minor IS NULL) OR (currency IS NOT NULL))),
    CONSTRAINT stop_unsplash_needs_attribution CHECK (((unsplash_photo_id IS NULL) OR ((unsplash_author_name IS NOT NULL) AND (unsplash_author_url IS NOT NULL)))),
    CONSTRAINT trip_stops_currency_check CHECK (app.is_currency_code((currency)::text)),
    CONSTRAINT trip_stops_estimated_cost_minor_check CHECK ((estimated_cost_minor >= 0)),
    CONSTRAINT trip_stops_latitude_check CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))),
    CONSTRAINT trip_stops_longitude_check CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))),
    CONSTRAINT trip_stops_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT trip_stops_nights_check CHECK ((nights >= 0)),
    CONSTRAINT trip_stops_sequence_check CHECK ((sequence >= 0))
);

--
-- Name: trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid NOT NULL,
    origin_name text,
    origin_lat double precision,
    origin_lng double precision,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT trips_origin_lat_check CHECK (((origin_lat >= ('-90'::integer)::double precision) AND (origin_lat <= (90)::double precision))),
    CONSTRAINT trips_origin_lng_check CHECK (((origin_lng >= ('-180'::integer)::double precision) AND (origin_lng <= (180)::double precision)))
);

--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    achievement_id uuid NOT NULL,
    unlocked_at timestamp with time zone DEFAULT now() NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL
);

--
-- Name: v_monthly_capacity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_monthly_capacity WITH (security_invoker='true') AS
 SELECT p.id AS user_id,
    p.base_currency,
    (COALESCE(sum((((
        CASE
            WHEN (ci.kind = 'income'::public.cashflow_kind) THEN 1
            ELSE '-1'::integer
        END)::numeric * round(((ci.amount_minor)::numeric * app.fx_rate(ci.currency, p.base_currency)))) *
        CASE ci.frequency
            WHEN 'weekly'::public.cadence THEN (52.0 / 12.0)
            WHEN 'fortnightly'::public.cadence THEN (26.0 / 12.0)
            WHEN 'monthly'::public.cadence THEN 1.0
            WHEN 'quarterly'::public.cadence THEN (1.0 / 3.0)
            WHEN 'annually'::public.cadence THEN (1.0 / 12.0)
            ELSE 0.0
        END)), (0)::numeric))::bigint AS monthly_capacity_minor
   FROM (public.profiles p
     LEFT JOIN public.cashflow_items ci ON (((ci.user_id = p.id) AND (ci.deleted_at IS NULL) AND (ci.active_from <= CURRENT_DATE) AND ((ci.active_to IS NULL) OR (ci.active_to >= CURRENT_DATE)))))
  WHERE ((p.deleted_at IS NULL) AND ((p.id = auth.uid()) OR (auth.uid() IS NULL)))
  GROUP BY p.id, p.base_currency;

--
-- Name: v_allocation_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_allocation_summary WITH (security_invoker='true') AS
 SELECT p.id AS user_id,
    p.base_currency,
    cap.monthly_capacity_minor,
    COALESCE(alloc.allocated_minor, (0)::bigint) AS allocated_minor,
    (cap.monthly_capacity_minor - COALESCE(alloc.allocated_minor, (0)::bigint)) AS free_minor,
    (COALESCE(alloc.allocated_minor, (0)::bigint) > cap.monthly_capacity_minor) AS over_allocated
   FROM ((public.profiles p
     JOIN public.v_monthly_capacity cap ON ((cap.user_id = p.id)))
     LEFT JOIN LATERAL ( SELECT (sum(round(((gp.monthly_allocation_minor)::numeric * app.fx_rate(gp.pledged_currency, p.base_currency)))))::bigint AS allocated_minor
           FROM (public.goal_participants gp
             JOIN public.goals g ON ((g.id = gp.goal_id)))
          WHERE ((gp.user_id = p.id) AND (gp.removed_at IS NULL) AND (gp.monthly_allocation_minor IS NOT NULL) AND (g.deleted_at IS NULL) AND (g.state = 'active'::public.goal_state))) alloc ON (true))
  WHERE ((p.deleted_at IS NULL) AND ((p.id = auth.uid()) OR (auth.uid() IS NULL)));

--
-- Name: v_countries_visited; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_countries_visited WITH (security_invoker='true') AS
 SELECT DISTINCT gp.user_id,
    ts.country_code
   FROM (((public.trip_stops ts
     JOIN public.trips tr ON ((tr.id = ts.trip_id)))
     JOIN public.goals g ON ((g.id = tr.goal_id)))
     JOIN public.goal_participants gp ON (((gp.goal_id = g.id) AND (gp.removed_at IS NULL))))
  WHERE ((ts.deleted_at IS NULL) AND (ts.country_code IS NOT NULL) AND (g.state = 'completed'::public.goal_state));

--
-- Name: v_goal_funding; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_goal_funding WITH (security_invoker='true') AS
 SELECT g.id AS goal_id,
    g.currency,
    g.funding,
    g.target_amount_minor,
    (COALESCE(pledges.pledged_minor, (0)::numeric))::bigint AS pledged_minor,
    (COALESCE(contrib.contributed_minor, (0)::numeric))::bigint AS contributed_minor,
    (COALESCE(spend.spent_minor, (0)::numeric))::bigint AS spent_minor,
    ((g.funding <> 'none'::public.funding_type) AND (g.target_amount_minor IS NOT NULL) AND (COALESCE(pledges.pledged_minor, (0)::numeric) < (g.target_amount_minor)::numeric)) AS is_underfunded
   FROM (((public.goals g
     LEFT JOIN LATERAL ( SELECT sum(round(((gp.pledged_amount_minor)::numeric * app.fx_rate(gp.pledged_currency, g.currency)))) AS pledged_minor
           FROM public.goal_participants gp
          WHERE ((gp.goal_id = g.id) AND (gp.removed_at IS NULL) AND (gp.pledged_amount_minor IS NOT NULL))) pledges ON (true))
     LEFT JOIN LATERAL ( SELECT sum(round(((le.amount_minor)::numeric * app.fx_rate(le.currency, g.currency, le.occurred_on)))) AS contributed_minor
           FROM public.ledger_entries le
          WHERE ((le.goal_id = g.id) AND (le.entry_type = 'contribution'::public.ledger_kind) AND (le.deleted_at IS NULL))) contrib ON (true))
     LEFT JOIN LATERAL ( SELECT sum(round(((le.amount_minor)::numeric * app.fx_rate(le.currency, g.currency, le.occurred_on)))) AS spent_minor
           FROM public.ledger_entries le
          WHERE ((le.goal_id = g.id) AND (le.entry_type = 'expense'::public.ledger_kind) AND (le.deleted_at IS NULL))) spend ON (true))
  WHERE (g.deleted_at IS NULL);

--
-- Name: v_goal_affordability; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_goal_affordability WITH (security_invoker='true') AS
 SELECT g.id AS goal_id,
    g.owner_id,
    g.currency,
    g.funding,
    g.target_date,
    g.target_amount_minor,
    COALESCE(f.contributed_minor, (0)::bigint) AS contributed_minor,
    GREATEST((0)::bigint, (g.target_amount_minor - COALESCE(f.contributed_minor, (0)::bigint))) AS remaining_minor,
    COALESCE(alloc.monthly_minor, (0)::bigint) AS monthly_rate_minor,
    app.affordable_from(g.id) AS affordable_from,
        CASE
            WHEN (app.affordable_from(g.id) IS NULL) THEN NULL::integer
            WHEN (g.target_date IS NULL) THEN NULL::integer
            ELSE (app.affordable_from(g.id) - g.target_date)
        END AS slips_by_days,
        CASE
            WHEN (g.funding <> 'save_toward'::public.funding_type) THEN NULL::boolean
            WHEN (app.affordable_from(g.id) IS NULL) THEN false
            WHEN (g.target_date IS NULL) THEN true
            ELSE (app.affordable_from(g.id) <= g.target_date)
        END AS affordable_by_target
   FROM ((public.goals g
     LEFT JOIN public.v_goal_funding f ON ((f.goal_id = g.id)))
     LEFT JOIN LATERAL ( SELECT (sum(round(((gp.monthly_allocation_minor)::numeric * app.fx_rate(gp.pledged_currency, g.currency)))))::bigint AS monthly_minor
           FROM public.goal_participants gp
          WHERE ((gp.goal_id = g.id) AND (gp.removed_at IS NULL) AND (gp.monthly_allocation_minor IS NOT NULL))) alloc ON (true))
  WHERE ((g.deleted_at IS NULL) AND (g.funding = 'save_toward'::public.funding_type) AND (g.target_amount_minor IS NOT NULL));

--
-- Name: v_pot_balances; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_pot_balances WITH (security_invoker='true') AS
 SELECT po.id AS pot_id,
    po.user_id,
    po.name,
    po.currency,
    (((po.opening_balance_minor)::numeric - COALESCE(sum(round(((le.amount_minor)::numeric * app.fx_rate(le.currency, po.currency, le.occurred_on)))), (0)::numeric)))::bigint AS balance_minor
   FROM (public.pots po
     LEFT JOIN public.ledger_entries le ON (((le.pot_id = po.id) AND (le.deleted_at IS NULL))))
  WHERE (po.deleted_at IS NULL)
  GROUP BY po.id, po.user_id, po.name, po.currency, po.opening_balance_minor;

--
-- Name: v_trip_estimates; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_trip_estimates WITH (security_invoker='true') AS
 SELECT t.id AS trip_id,
    t.goal_id,
    g.currency,
    (COALESCE(stops.total, (0)::numeric))::bigint AS stops_estimate_minor,
    (COALESCE(legs.total, (0)::numeric))::bigint AS legs_estimate_minor,
    ((COALESCE(stops.total, (0)::numeric) + COALESCE(legs.total, (0)::numeric)))::bigint AS total_estimate_minor,
    COALESCE(stops.night_count, (0)::bigint) AS total_nights
   FROM (((public.trips t
     JOIN public.goals g ON ((g.id = t.goal_id)))
     LEFT JOIN LATERAL ( SELECT sum(round(((ts.estimated_cost_minor)::numeric * app.fx_rate(ts.currency, g.currency)))) AS total,
            sum(ts.nights) AS night_count
           FROM public.trip_stops ts
          WHERE ((ts.trip_id = t.id) AND (ts.deleted_at IS NULL))) stops ON (true))
     LEFT JOIN LATERAL ( SELECT sum(round(((tl.cost_minor)::numeric * app.fx_rate(tl.currency, g.currency)))) AS total
           FROM public.trip_legs tl
          WHERE ((tl.trip_id = t.id) AND (tl.deleted_at IS NULL))) legs ON (true))
  WHERE (t.deleted_at IS NULL);

--
-- Name: v_user_capacity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_user_capacity WITH (security_invoker='true') AS
 SELECT p.id AS user_id,
    p.active_goal_limit,
    count(g.id) FILTER (WHERE (g.state = 'active'::public.goal_state)) AS active_goal_count,
    (count(g.id) FILTER (WHERE (g.state = 'active'::public.goal_state)) > p.active_goal_limit) AS over_limit,
    ( SELECT avg(c.capacity_rating) AS avg
           FROM ( SELECT ci.capacity_rating
                   FROM public.check_ins ci
                  WHERE ((ci.user_id = p.id) AND (ci.submitted_at IS NOT NULL) AND (ci.capacity_rating IS NOT NULL))
                  ORDER BY ci.period_start DESC
                 LIMIT 3) c) AS recent_capacity_mean
   FROM (public.profiles p
     LEFT JOIN public.goals g ON (((g.owner_id = p.id) AND (g.deleted_at IS NULL))))
  WHERE ((p.deleted_at IS NULL) AND ((p.id = auth.uid()) OR (auth.uid() IS NULL)))
  GROUP BY p.id, p.active_goal_limit;

--
-- Name: achievements achievements_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_code_key UNIQUE (code);

--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);

--
-- Name: avatar_presets avatar_presets_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatar_presets
    ADD CONSTRAINT avatar_presets_code_key UNIQUE (code);

--
-- Name: avatar_presets avatar_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatar_presets
    ADD CONSTRAINT avatar_presets_pkey PRIMARY KEY (id);

--
-- Name: cashflow_items cashflow_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashflow_items
    ADD CONSTRAINT cashflow_items_pkey PRIMARY KEY (id);

--
-- Name: check_ins check_ins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_ins
    ADD CONSTRAINT check_ins_pkey PRIMARY KEY (id);

--
-- Name: fx_rates fx_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rates
    ADD CONSTRAINT fx_rates_pkey PRIMARY KEY (id);

--
-- Name: goal_participants goal_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_participants
    ADD CONSTRAINT goal_participants_pkey PRIMARY KEY (id);

--
-- Name: goal_ratings goal_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_ratings
    ADD CONSTRAINT goal_ratings_pkey PRIMARY KEY (id);

--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);

--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);

--
-- Name: ledger_entries ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_pkey PRIMARY KEY (id);

--
-- Name: life_areas life_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.life_areas
    ADD CONSTRAINT life_areas_pkey PRIMARY KEY (id);

--
-- Name: llama_messages llama_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llama_messages
    ADD CONSTRAINT llama_messages_pkey PRIMARY KEY (id);

--
-- Name: milestones milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestones
    ADD CONSTRAINT milestones_pkey PRIMARY KEY (id);

--
-- Name: pots pots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pots
    ADD CONSTRAINT pots_pkey PRIMARY KEY (id);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

--
-- Name: rag_snapshots rag_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rag_snapshots
    ADD CONSTRAINT rag_snapshots_pkey PRIMARY KEY (id);

--
-- Name: share_grants share_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_grants
    ADD CONSTRAINT share_grants_pkey PRIMARY KEY (id);

--
-- Name: someday_items someday_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.someday_items
    ADD CONSTRAINT someday_items_pkey PRIMARY KEY (id);

--
-- Name: task_dependencies task_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_pkey PRIMARY KEY (id);

--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

--
-- Name: trip_legs trip_legs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_legs
    ADD CONSTRAINT trip_legs_pkey PRIMARY KEY (id);

--
-- Name: trip_stops trip_stops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_stops
    ADD CONSTRAINT trip_stops_pkey PRIMARY KEY (id);

--
-- Name: trip_stops trip_stops_sequence_deferrable; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_stops
    ADD CONSTRAINT trip_stops_sequence_deferrable UNIQUE (trip_id, sequence) DEFERRABLE INITIALLY DEFERRED;

--
-- Name: trips trips_goal_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_goal_id_key UNIQUE (goal_id);

--
-- Name: trips trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);

--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);

--
-- Name: avatar_presets_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX avatar_presets_category_idx ON public.avatar_presets USING btree (category, sort_order);

--
-- Name: cashflow_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cashflow_user_idx ON public.cashflow_items USING btree (user_id) WHERE (deleted_at IS NULL);

--
-- Name: check_ins_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX check_ins_recent_idx ON public.check_ins USING btree (user_id, period_start DESC);

--
-- Name: check_ins_user_period; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX check_ins_user_period ON public.check_ins USING btree (user_id, period_start);

--
-- Name: fx_rates_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fx_rates_lookup_idx ON public.fx_rates USING btree (base_currency, quote_currency, as_of DESC);

--
-- Name: fx_rates_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fx_rates_unique ON public.fx_rates USING btree (base_currency, quote_currency, as_of);

--
-- Name: goal_participants_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX goal_participants_unique ON public.goal_participants USING btree (goal_id, user_id) WHERE (removed_at IS NULL);

--
-- Name: goal_participants_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_participants_user_idx ON public.goal_participants USING btree (user_id) WHERE (removed_at IS NULL);

--
-- Name: goal_ratings_goal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_ratings_goal_idx ON public.goal_ratings USING btree (goal_id, created_at DESC);

--
-- Name: goal_ratings_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX goal_ratings_unique ON public.goal_ratings USING btree (check_in_id, goal_id, user_id);

--
-- Name: goals_life_area_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_life_area_idx ON public.goals USING btree (life_area_id) WHERE (deleted_at IS NULL);

--
-- Name: goals_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_owner_idx ON public.goals USING btree (owner_id) WHERE (deleted_at IS NULL);

--
-- Name: goals_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_state_idx ON public.goals USING btree (owner_id, state) WHERE (deleted_at IS NULL);

--
-- Name: goals_timeline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_timeline_idx ON public.goals USING btree (start_date, target_date) WHERE (deleted_at IS NULL);

--
-- Name: invitations_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_email_idx ON public.invitations USING btree (lower(email)) WHERE (accepted_at IS NULL);

--
-- Name: invitations_inviter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_inviter_idx ON public.invitations USING btree (inviter_id);

--
-- Name: invitations_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invitations_token_key ON public.invitations USING btree (token_hash);

--
-- Name: ledger_goal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ledger_goal_idx ON public.ledger_entries USING btree (goal_id) WHERE (deleted_at IS NULL);

--
-- Name: ledger_pot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ledger_pot_idx ON public.ledger_entries USING btree (pot_id) WHERE (deleted_at IS NULL);

--
-- Name: ledger_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ledger_type_idx ON public.ledger_entries USING btree (goal_id, entry_type) WHERE (deleted_at IS NULL);

--
-- Name: ledger_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ledger_user_idx ON public.ledger_entries USING btree (user_id, occurred_on DESC) WHERE (deleted_at IS NULL);

--
-- Name: life_areas_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX life_areas_user_idx ON public.life_areas USING btree (user_id) WHERE (deleted_at IS NULL);

--
-- Name: life_areas_user_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX life_areas_user_name_key ON public.life_areas USING btree (user_id, lower(name)) WHERE (deleted_at IS NULL);

--
-- Name: llama_messages_inbox_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llama_messages_inbox_idx ON public.llama_messages USING btree (user_id, created_at DESC) WHERE (dismissed_at IS NULL);

--
-- Name: llama_messages_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llama_messages_unread_idx ON public.llama_messages USING btree (user_id) WHERE ((read_at IS NULL) AND (dismissed_at IS NULL));

--
-- Name: milestones_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX milestones_due_idx ON public.milestones USING btree (due_date) WHERE (deleted_at IS NULL);

--
-- Name: milestones_goal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX milestones_goal_idx ON public.milestones USING btree (goal_id) WHERE (deleted_at IS NULL);

--
-- Name: pots_one_default_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pots_one_default_per_user ON public.pots USING btree (user_id) WHERE (is_default AND (deleted_at IS NULL));

--
-- Name: pots_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pots_user_idx ON public.pots USING btree (user_id) WHERE (deleted_at IS NULL);

--
-- Name: profiles_handle_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_handle_key ON public.profiles USING btree (lower(handle)) WHERE (deleted_at IS NULL);

--
-- Name: rag_snapshots_goal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rag_snapshots_goal_idx ON public.rag_snapshots USING btree (goal_id, computed_at DESC);

--
-- Name: share_grants_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX share_grants_active_unique ON public.share_grants USING btree (resource_type, resource_id, grantee_id) WHERE (revoked_at IS NULL);

--
-- Name: share_grants_grantee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX share_grants_grantee_idx ON public.share_grants USING btree (grantee_id, resource_type) WHERE (revoked_at IS NULL);

--
-- Name: share_grants_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX share_grants_resource_idx ON public.share_grants USING btree (resource_type, resource_id) WHERE (revoked_at IS NULL);

--
-- Name: someday_geo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX someday_geo_idx ON public.someday_items USING btree (latitude, longitude) WHERE (deleted_at IS NULL);

--
-- Name: someday_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX someday_user_idx ON public.someday_items USING btree (user_id) WHERE (deleted_at IS NULL);

--
-- Name: task_dependencies_succ_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_dependencies_succ_idx ON public.task_dependencies USING btree (successor_task_id);

--
-- Name: task_dependencies_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX task_dependencies_unique ON public.task_dependencies USING btree (predecessor_task_id, successor_task_id);

--
-- Name: tasks_goal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_goal_idx ON public.tasks USING btree (goal_id) WHERE (deleted_at IS NULL);

--
-- Name: tasks_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_owner_idx ON public.tasks USING btree (owner_id) WHERE (deleted_at IS NULL);

--
-- Name: tasks_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_window_idx ON public.tasks USING btree (computed_start, computed_end) WHERE (deleted_at IS NULL);

--
-- Name: trip_legs_trip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trip_legs_trip_idx ON public.trip_legs USING btree (trip_id) WHERE (deleted_at IS NULL);

--
-- Name: trip_stops_range_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trip_stops_range_idx ON public.trip_stops USING btree (computed_arrival, computed_departure) WHERE ((deleted_at IS NULL) AND (computed_arrival IS NOT NULL));

--
-- Name: trip_stops_sequence_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX trip_stops_sequence_unique ON public.trip_stops USING btree (trip_id, sequence) WHERE (deleted_at IS NULL);

--
-- Name: trip_stops_trip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trip_stops_trip_idx ON public.trip_stops USING btree (trip_id, sequence) WHERE (deleted_at IS NULL);

--
-- Name: user_achievements_pinned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_achievements_pinned_idx ON public.user_achievements USING btree (user_id) WHERE is_pinned;

--
-- Name: user_achievements_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_achievements_unique ON public.user_achievements USING btree (user_id, achievement_id);

--
-- Name: user_achievements_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_achievements_user_idx ON public.user_achievements USING btree (user_id, unlocked_at DESC);

--
-- Name: cashflow_items cashflow_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cashflow_touch BEFORE UPDATE ON public.cashflow_items FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

--
-- Name: check_ins check_ins_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER check_ins_touch BEFORE UPDATE ON public.check_ins FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

--
-- Name: goals goals_cascade_schedule; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER goals_cascade_schedule AFTER UPDATE OF start_date ON public.goals FOR EACH ROW EXECUTE FUNCTION app.cascade_goal_start_date();

--
-- Name: goals goals_cascade_trip; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER goals_cascade_trip AFTER UPDATE OF start_date ON public.goals FOR EACH ROW EXECUTE FUNCTION app.cascade_trip_goal_date();

--
-- Name: goals goals_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER goals_touch BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

--
-- Name: ledger_entries ledger_stamp_base; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ledger_stamp_base BEFORE INSERT ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION app.stamp_ledger_base_amount();

--
-- Name: ledger_entries ledger_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ledger_touch BEFORE UPDATE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

--
-- Name: life_areas life_areas_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER life_areas_touch BEFORE UPDATE ON public.life_areas FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

--
-- Name: llama_messages llama_messages_filter; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER llama_messages_filter BEFORE INSERT ON public.llama_messages FOR EACH ROW EXECUTE FUNCTION app.filter_llama_message();

--
-- Name: milestones milestones_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER milestones_touch BEFORE UPDATE ON public.milestones FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

--
-- Name: pots pots_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pots_touch BEFORE UPDATE ON public.pots FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

--
-- Name: profiles profiles_seed_life_areas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_seed_life_areas AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION app.seed_life_areas();

--
-- Name: profiles profiles_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

--
-- Name: someday_items someday_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER someday_touch BEFORE UPDATE ON public.someday_items FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

--
-- Name: task_dependencies task_dependencies_no_cycle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER task_dependencies_no_cycle BEFORE INSERT OR UPDATE ON public.task_dependencies FOR EACH ROW EXECUTE FUNCTION app.prevent_dependency_cycle();

--
-- Name: tasks tasks_derive_dates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tasks_derive_dates BEFORE INSERT OR UPDATE OF offset_days, duration_days, goal_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION app.derive_task_dates();

--
-- Name: tasks tasks_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tasks_touch BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

--
-- Name: trip_legs trip_legs_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trip_legs_touch BEFORE UPDATE ON public.trip_legs FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

--
-- Name: trip_stops trip_stops_recompute; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trip_stops_recompute AFTER INSERT OR DELETE OR UPDATE OF sequence, nights, deleted_at ON public.trip_stops FOR EACH ROW EXECUTE FUNCTION app.on_trip_stop_change();

--
-- Name: trip_stops trip_stops_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trip_stops_touch BEFORE UPDATE ON public.trip_stops FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

--
-- Name: trips trips_kind_check; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trips_kind_check BEFORE INSERT OR UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION app.enforce_trip_goal_kind();

--
-- Name: trips trips_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trips_touch BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

--
-- Name: avatar_presets avatar_presets_unlock_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatar_presets
    ADD CONSTRAINT avatar_presets_unlock_achievement_id_fkey FOREIGN KEY (unlock_achievement_id) REFERENCES public.achievements(id) ON DELETE SET NULL;

--
-- Name: cashflow_items cashflow_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashflow_items
    ADD CONSTRAINT cashflow_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: check_ins check_ins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_ins
    ADD CONSTRAINT check_ins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: goal_participants goal_participants_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_participants
    ADD CONSTRAINT goal_participants_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;

--
-- Name: goal_participants goal_participants_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_participants
    ADD CONSTRAINT goal_participants_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

--
-- Name: goal_participants goal_participants_pot_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_participants
    ADD CONSTRAINT goal_participants_pot_fk FOREIGN KEY (pot_id) REFERENCES public.pots(id) ON DELETE SET NULL;

--
-- Name: goal_participants goal_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_participants
    ADD CONSTRAINT goal_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: goal_ratings goal_ratings_check_in_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_ratings
    ADD CONSTRAINT goal_ratings_check_in_id_fkey FOREIGN KEY (check_in_id) REFERENCES public.check_ins(id) ON DELETE CASCADE;

--
-- Name: goal_ratings goal_ratings_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_ratings
    ADD CONSTRAINT goal_ratings_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;

--
-- Name: goal_ratings goal_ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_ratings
    ADD CONSTRAINT goal_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: goals goals_life_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_life_area_id_fkey FOREIGN KEY (life_area_id) REFERENCES public.life_areas(id) ON DELETE SET NULL;

--
-- Name: goals goals_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: goals goals_rag_override_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_rag_override_by_fkey FOREIGN KEY (rag_override_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

--
-- Name: invitations invitations_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

--
-- Name: invitations invitations_invitee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_invitee_id_fkey FOREIGN KEY (invitee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: invitations invitations_inviter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: ledger_entries ledger_entries_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;

--
-- Name: ledger_entries ledger_entries_pot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_pot_id_fkey FOREIGN KEY (pot_id) REFERENCES public.pots(id) ON DELETE SET NULL;

--
-- Name: ledger_entries ledger_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: ledger_entries ledger_trip_leg_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_trip_leg_fk FOREIGN KEY (trip_leg_id) REFERENCES public.trip_legs(id) ON DELETE SET NULL;

--
-- Name: ledger_entries ledger_trip_stop_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_trip_stop_fk FOREIGN KEY (trip_stop_id) REFERENCES public.trip_stops(id) ON DELETE SET NULL;

--
-- Name: life_areas life_areas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.life_areas
    ADD CONSTRAINT life_areas_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: llama_messages llama_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llama_messages
    ADD CONSTRAINT llama_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: milestones milestones_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestones
    ADD CONSTRAINT milestones_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;

--
-- Name: pots pots_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pots
    ADD CONSTRAINT pots_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: rag_snapshots rag_snapshots_check_in_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rag_snapshots
    ADD CONSTRAINT rag_snapshots_check_in_id_fkey FOREIGN KEY (check_in_id) REFERENCES public.check_ins(id) ON DELETE SET NULL;

--
-- Name: rag_snapshots rag_snapshots_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rag_snapshots
    ADD CONSTRAINT rag_snapshots_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;

--
-- Name: share_grants share_grants_grantee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_grants
    ADD CONSTRAINT share_grants_grantee_id_fkey FOREIGN KEY (grantee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: share_grants share_grants_grantor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_grants
    ADD CONSTRAINT share_grants_grantor_id_fkey FOREIGN KEY (grantor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: share_grants share_grants_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_grants
    ADD CONSTRAINT share_grants_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

--
-- Name: someday_items someday_items_life_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.someday_items
    ADD CONSTRAINT someday_items_life_area_id_fkey FOREIGN KEY (life_area_id) REFERENCES public.life_areas(id) ON DELETE SET NULL;

--
-- Name: someday_items someday_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.someday_items
    ADD CONSTRAINT someday_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: task_dependencies task_dependencies_predecessor_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_predecessor_task_id_fkey FOREIGN KEY (predecessor_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

--
-- Name: task_dependencies task_dependencies_successor_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_successor_task_id_fkey FOREIGN KEY (successor_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

--
-- Name: tasks tasks_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;

--
-- Name: tasks tasks_milestone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE SET NULL;

--
-- Name: tasks tasks_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

--
-- Name: trip_legs trip_legs_from_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_legs
    ADD CONSTRAINT trip_legs_from_stop_id_fkey FOREIGN KEY (from_stop_id) REFERENCES public.trip_stops(id) ON DELETE CASCADE;

--
-- Name: trip_legs trip_legs_to_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_legs
    ADD CONSTRAINT trip_legs_to_stop_id_fkey FOREIGN KEY (to_stop_id) REFERENCES public.trip_stops(id) ON DELETE CASCADE;

--
-- Name: trip_legs trip_legs_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_legs
    ADD CONSTRAINT trip_legs_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;

--
-- Name: trip_stops trip_stops_someday_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_stops
    ADD CONSTRAINT trip_stops_someday_item_id_fkey FOREIGN KEY (someday_item_id) REFERENCES public.someday_items(id) ON DELETE SET NULL;

--
-- Name: trip_stops trip_stops_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_stops
    ADD CONSTRAINT trip_stops_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;

--
-- Name: trips trips_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;

--
-- Name: user_achievements user_achievements_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id) ON DELETE CASCADE;

--
-- Name: user_achievements user_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: achievements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: achievements achievements_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY achievements_select ON public.achievements FOR SELECT USING (((auth.uid() IS NOT NULL) AND is_active));

--
-- Name: avatar_presets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avatar_presets ENABLE ROW LEVEL SECURITY;

--
-- Name: avatar_presets avatar_presets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY avatar_presets_select ON public.avatar_presets FOR SELECT USING (((auth.uid() IS NOT NULL) AND is_active));

--
-- Name: cashflow_items cashflow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cashflow_all ON public.cashflow_items USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

--
-- Name: cashflow_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cashflow_items ENABLE ROW LEVEL SECURITY;

--
-- Name: check_ins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

--
-- Name: check_ins check_ins_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY check_ins_all ON public.check_ins USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

--
-- Name: fx_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: fx_rates fx_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fx_select ON public.fx_rates FOR SELECT USING ((auth.uid() IS NOT NULL));

--
-- Name: goal_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: goal_participants goal_participants_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_participants_delete ON public.goal_participants FOR DELETE USING ((app.is_goal_owner(goal_id) OR (user_id = auth.uid())));

--
-- Name: goal_participants goal_participants_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_participants_insert ON public.goal_participants FOR INSERT WITH CHECK (app.is_goal_owner(goal_id));

--
-- Name: goal_participants goal_participants_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_participants_select ON public.goal_participants FOR SELECT USING (((user_id = auth.uid()) OR app.can_view_goal(goal_id)));

--
-- Name: goal_participants goal_participants_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_participants_update ON public.goal_participants FOR UPDATE USING ((app.is_goal_owner(goal_id) OR (user_id = auth.uid())));

--
-- Name: goal_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: goal_ratings goal_ratings_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_ratings_delete ON public.goal_ratings FOR DELETE USING ((user_id = auth.uid()));

--
-- Name: goal_ratings goal_ratings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_ratings_insert ON public.goal_ratings FOR INSERT WITH CHECK (((user_id = auth.uid()) AND app.can_view_goal(goal_id)));

--
-- Name: goal_ratings goal_ratings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_ratings_select ON public.goal_ratings FOR SELECT USING (((user_id = auth.uid()) OR app.can_view_goal(goal_id)));

--
-- Name: goal_ratings goal_ratings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_ratings_update ON public.goal_ratings FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

--
-- Name: goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

--
-- Name: goals goals_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goals_delete ON public.goals FOR DELETE USING ((owner_id = auth.uid()));

--
-- Name: goals goals_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goals_insert ON public.goals FOR INSERT WITH CHECK ((owner_id = auth.uid()));

--
-- Name: goals goals_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goals_select ON public.goals FOR SELECT USING (((deleted_at IS NULL) AND ((owner_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.goal_participants gp
  WHERE ((gp.goal_id = goals.id) AND (gp.user_id = auth.uid()) AND (gp.removed_at IS NULL)))))));

--
-- Name: goals goals_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goals_update ON public.goals FOR UPDATE USING (app.can_edit_goal(id)) WITH CHECK (app.can_edit_goal(id));

--
-- Name: invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations invitations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_insert ON public.invitations FOR INSERT WITH CHECK ((inviter_id = auth.uid()));

--
-- Name: invitations invitations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_select ON public.invitations FOR SELECT USING (((inviter_id = auth.uid()) OR (invitee_id = auth.uid())));

--
-- Name: invitations invitations_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_update ON public.invitations FOR UPDATE USING (((inviter_id = auth.uid()) OR (invitee_id = auth.uid())));

--
-- Name: ledger_entries ledger_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ledger_delete ON public.ledger_entries FOR DELETE USING ((user_id = auth.uid()));

--
-- Name: ledger_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: ledger_entries ledger_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ledger_insert ON public.ledger_entries FOR INSERT WITH CHECK ((user_id = auth.uid()));

--
-- Name: ledger_entries ledger_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ledger_select ON public.ledger_entries FOR SELECT USING (((deleted_at IS NULL) AND ((user_id = auth.uid()) OR ((goal_id IS NOT NULL) AND app.can_view_goal(goal_id)))));

--
-- Name: ledger_entries ledger_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ledger_update ON public.ledger_entries FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

--
-- Name: life_areas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.life_areas ENABLE ROW LEVEL SECURITY;

--
-- Name: life_areas life_areas_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY life_areas_all ON public.life_areas USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

--
-- Name: llama_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.llama_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: llama_messages llama_messages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY llama_messages_select ON public.llama_messages FOR SELECT USING ((user_id = auth.uid()));

--
-- Name: llama_messages llama_messages_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY llama_messages_update ON public.llama_messages FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

--
-- Name: milestones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

--
-- Name: milestones milestones_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY milestones_select ON public.milestones FOR SELECT USING (((deleted_at IS NULL) AND app.can_view_goal(goal_id)));

--
-- Name: milestones milestones_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY milestones_write ON public.milestones USING (app.can_edit_goal(goal_id)) WITH CHECK (app.can_edit_goal(goal_id));

--
-- Name: pots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pots ENABLE ROW LEVEL SECURITY;

--
-- Name: pots pots_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pots_all ON public.pots USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK ((id = auth.uid()));

--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (((auth.uid() IS NOT NULL) AND (deleted_at IS NULL)));

--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

--
-- Name: rag_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rag_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: rag_snapshots rag_snapshots_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rag_snapshots_select ON public.rag_snapshots FOR SELECT USING (app.can_view_goal(goal_id));

--
-- Name: share_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.share_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: share_grants share_grants_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY share_grants_insert ON public.share_grants FOR INSERT WITH CHECK ((grantor_id = auth.uid()));

--
-- Name: share_grants share_grants_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY share_grants_select ON public.share_grants FOR SELECT USING (((grantor_id = auth.uid()) OR (grantee_id = auth.uid())));

--
-- Name: share_grants share_grants_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY share_grants_update ON public.share_grants FOR UPDATE USING (((grantor_id = auth.uid()) OR (grantee_id = auth.uid())));

--
-- Name: someday_items someday_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY someday_delete ON public.someday_items FOR DELETE USING ((user_id = auth.uid()));

--
-- Name: someday_items someday_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY someday_insert ON public.someday_items FOR INSERT WITH CHECK ((user_id = auth.uid()));

--
-- Name: someday_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.someday_items ENABLE ROW LEVEL SECURITY;

--
-- Name: someday_items someday_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY someday_select ON public.someday_items FOR SELECT USING (((deleted_at IS NULL) AND ((user_id = auth.uid()) OR app.has_grant('someday_item'::text, id, 'view'::public.share_scope))));

--
-- Name: someday_items someday_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY someday_update ON public.someday_items FOR UPDATE USING (((user_id = auth.uid()) OR app.has_grant('someday_item'::text, id, 'edit'::public.share_scope))) WITH CHECK (((user_id = auth.uid()) OR app.has_grant('someday_item'::text, id, 'edit'::public.share_scope)));

--
-- Name: task_dependencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

--
-- Name: task_dependencies task_dependencies_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_dependencies_select ON public.task_dependencies FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_dependencies.predecessor_task_id) AND app.can_view_goal(t.goal_id)))));

--
-- Name: task_dependencies task_dependencies_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_dependencies_write ON public.task_dependencies USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_dependencies.predecessor_task_id) AND app.can_edit_goal(t.goal_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_dependencies.predecessor_task_id) AND app.can_edit_goal(t.goal_id)))));

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_select ON public.tasks FOR SELECT USING (((deleted_at IS NULL) AND app.can_view_goal(goal_id)));

--
-- Name: tasks tasks_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_write ON public.tasks USING (app.can_edit_goal(goal_id)) WITH CHECK (app.can_edit_goal(goal_id));

--
-- Name: trip_legs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trip_legs ENABLE ROW LEVEL SECURITY;

--
-- Name: trip_legs trip_legs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trip_legs_select ON public.trip_legs FOR SELECT USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.trips t
  WHERE ((t.id = trip_legs.trip_id) AND app.can_view_goal(t.goal_id))))));

--
-- Name: trip_legs trip_legs_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trip_legs_write ON public.trip_legs USING ((EXISTS ( SELECT 1
   FROM public.trips t
  WHERE ((t.id = trip_legs.trip_id) AND app.can_edit_goal(t.goal_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.trips t
  WHERE ((t.id = trip_legs.trip_id) AND app.can_edit_goal(t.goal_id)))));

--
-- Name: trip_stops; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;

--
-- Name: trip_stops trip_stops_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trip_stops_select ON public.trip_stops FOR SELECT USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.trips t
  WHERE ((t.id = trip_stops.trip_id) AND app.can_view_goal(t.goal_id))))));

--
-- Name: trip_stops trip_stops_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trip_stops_write ON public.trip_stops USING ((EXISTS ( SELECT 1
   FROM public.trips t
  WHERE ((t.id = trip_stops.trip_id) AND app.can_edit_goal(t.goal_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.trips t
  WHERE ((t.id = trip_stops.trip_id) AND app.can_edit_goal(t.goal_id)))));

--
-- Name: trips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

--
-- Name: trips trips_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trips_select ON public.trips FOR SELECT USING (((deleted_at IS NULL) AND app.can_view_goal(goal_id)));

--
-- Name: trips trips_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trips_write ON public.trips USING (app.can_edit_goal(goal_id)) WITH CHECK (app.can_edit_goal(goal_id));

--
-- Name: user_achievements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: user_achievements user_achievements_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_achievements_select ON public.user_achievements FOR SELECT USING (((user_id = auth.uid()) OR app.has_grant('profile'::text, user_id, 'view'::public.share_scope)));

--
-- Name: user_achievements user_achievements_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_achievements_update ON public.user_achievements FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

--
-- Name: SCHEMA app; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA app TO authenticated;
GRANT USAGE ON SCHEMA app TO anon;
GRANT USAGE ON SCHEMA app TO service_role;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

--
-- Name: FUNCTION affordable_from(p_goal_id uuid); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.affordable_from(p_goal_id uuid) TO anon;
GRANT ALL ON FUNCTION app.affordable_from(p_goal_id uuid) TO authenticated;
GRANT ALL ON FUNCTION app.affordable_from(p_goal_id uuid) TO service_role;

--
-- Name: FUNCTION can_edit_goal(p_goal_id uuid); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.can_edit_goal(p_goal_id uuid) TO authenticated;
GRANT ALL ON FUNCTION app.can_edit_goal(p_goal_id uuid) TO anon;
GRANT ALL ON FUNCTION app.can_edit_goal(p_goal_id uuid) TO service_role;

--
-- Name: FUNCTION can_view_goal(p_goal_id uuid); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.can_view_goal(p_goal_id uuid) TO authenticated;
GRANT ALL ON FUNCTION app.can_view_goal(p_goal_id uuid) TO anon;
GRANT ALL ON FUNCTION app.can_view_goal(p_goal_id uuid) TO service_role;

--
-- Name: FUNCTION cascade_goal_start_date(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.cascade_goal_start_date() TO anon;
GRANT ALL ON FUNCTION app.cascade_goal_start_date() TO authenticated;
GRANT ALL ON FUNCTION app.cascade_goal_start_date() TO service_role;

--
-- Name: FUNCTION cascade_trip_goal_date(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.cascade_trip_goal_date() TO anon;
GRANT ALL ON FUNCTION app.cascade_trip_goal_date() TO authenticated;
GRANT ALL ON FUNCTION app.cascade_trip_goal_date() TO service_role;

--
-- Name: FUNCTION compute_goal_rag(p_goal_id uuid); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.compute_goal_rag(p_goal_id uuid) TO authenticated;
GRANT ALL ON FUNCTION app.compute_goal_rag(p_goal_id uuid) TO anon;
GRANT ALL ON FUNCTION app.compute_goal_rag(p_goal_id uuid) TO service_role;

--
-- Name: FUNCTION derive_task_dates(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.derive_task_dates() TO anon;
GRANT ALL ON FUNCTION app.derive_task_dates() TO authenticated;
GRANT ALL ON FUNCTION app.derive_task_dates() TO service_role;

--
-- Name: FUNCTION effective_goal_rag(p_goal_id uuid); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.effective_goal_rag(p_goal_id uuid) TO authenticated;
GRANT ALL ON FUNCTION app.effective_goal_rag(p_goal_id uuid) TO anon;
GRANT ALL ON FUNCTION app.effective_goal_rag(p_goal_id uuid) TO service_role;

--
-- Name: FUNCTION enforce_trip_goal_kind(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.enforce_trip_goal_kind() TO authenticated;
GRANT ALL ON FUNCTION app.enforce_trip_goal_kind() TO anon;
GRANT ALL ON FUNCTION app.enforce_trip_goal_kind() TO service_role;

--
-- Name: FUNCTION evaluate_achievements(p_user_id uuid); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.evaluate_achievements(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION app.evaluate_achievements(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION app.evaluate_achievements(p_user_id uuid) TO service_role;

--
-- Name: FUNCTION filter_llama_message(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.filter_llama_message() TO authenticated;
GRANT ALL ON FUNCTION app.filter_llama_message() TO anon;
GRANT ALL ON FUNCTION app.filter_llama_message() TO service_role;

--
-- Name: FUNCTION fx_rate(p_from character, p_to character, p_as_of date); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.fx_rate(p_from character, p_to character, p_as_of date) TO authenticated;
GRANT ALL ON FUNCTION app.fx_rate(p_from character, p_to character, p_as_of date) TO anon;
GRANT ALL ON FUNCTION app.fx_rate(p_from character, p_to character, p_as_of date) TO service_role;

--
-- Name: FUNCTION grant_achievement(p_user_id uuid, p_code text); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.grant_achievement(p_user_id uuid, p_code text) TO anon;
GRANT ALL ON FUNCTION app.grant_achievement(p_user_id uuid, p_code text) TO authenticated;
GRANT ALL ON FUNCTION app.grant_achievement(p_user_id uuid, p_code text) TO service_role;

--
-- Name: FUNCTION has_grant(p_resource_type text, p_resource_id uuid, p_scope public.share_scope); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.has_grant(p_resource_type text, p_resource_id uuid, p_scope public.share_scope) TO authenticated;
GRANT ALL ON FUNCTION app.has_grant(p_resource_type text, p_resource_id uuid, p_scope public.share_scope) TO anon;
GRANT ALL ON FUNCTION app.has_grant(p_resource_type text, p_resource_id uuid, p_scope public.share_scope) TO service_role;

--
-- Name: FUNCTION is_currency_code(p text); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.is_currency_code(p text) TO authenticated;
GRANT ALL ON FUNCTION app.is_currency_code(p text) TO anon;
GRANT ALL ON FUNCTION app.is_currency_code(p text) TO service_role;

--
-- Name: FUNCTION is_goal_owner(p_goal_id uuid); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.is_goal_owner(p_goal_id uuid) TO authenticated;
GRANT ALL ON FUNCTION app.is_goal_owner(p_goal_id uuid) TO anon;
GRANT ALL ON FUNCTION app.is_goal_owner(p_goal_id uuid) TO service_role;

--
-- Name: FUNCTION months_to_afford(p_remaining_minor numeric, p_monthly_rate_minor numeric); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.months_to_afford(p_remaining_minor numeric, p_monthly_rate_minor numeric) TO anon;
GRANT ALL ON FUNCTION app.months_to_afford(p_remaining_minor numeric, p_monthly_rate_minor numeric) TO authenticated;
GRANT ALL ON FUNCTION app.months_to_afford(p_remaining_minor numeric, p_monthly_rate_minor numeric) TO service_role;

--
-- Name: FUNCTION on_trip_stop_change(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.on_trip_stop_change() TO anon;
GRANT ALL ON FUNCTION app.on_trip_stop_change() TO authenticated;
GRANT ALL ON FUNCTION app.on_trip_stop_change() TO service_role;

--
-- Name: FUNCTION presets_unlocked_by(p_user_id uuid, p_achievement_code text); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.presets_unlocked_by(p_user_id uuid, p_achievement_code text) TO anon;
GRANT ALL ON FUNCTION app.presets_unlocked_by(p_user_id uuid, p_achievement_code text) TO authenticated;
GRANT ALL ON FUNCTION app.presets_unlocked_by(p_user_id uuid, p_achievement_code text) TO service_role;

--
-- Name: FUNCTION prevent_dependency_cycle(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.prevent_dependency_cycle() TO authenticated;
GRANT ALL ON FUNCTION app.prevent_dependency_cycle() TO anon;
GRANT ALL ON FUNCTION app.prevent_dependency_cycle() TO service_role;

--
-- Name: FUNCTION promote_someday_to_stop(p_someday_id uuid, p_trip_id uuid, p_nights integer); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.promote_someday_to_stop(p_someday_id uuid, p_trip_id uuid, p_nights integer) TO anon;
GRANT ALL ON FUNCTION app.promote_someday_to_stop(p_someday_id uuid, p_trip_id uuid, p_nights integer) TO authenticated;
GRANT ALL ON FUNCTION app.promote_someday_to_stop(p_someday_id uuid, p_trip_id uuid, p_nights integer) TO service_role;

--
-- Name: FUNCTION recompute_goal_schedule(p_goal_id uuid); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.recompute_goal_schedule(p_goal_id uuid) TO anon;
GRANT ALL ON FUNCTION app.recompute_goal_schedule(p_goal_id uuid) TO authenticated;
GRANT ALL ON FUNCTION app.recompute_goal_schedule(p_goal_id uuid) TO service_role;

--
-- Name: FUNCTION recompute_trip_schedule(p_trip_id uuid); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.recompute_trip_schedule(p_trip_id uuid) TO anon;
GRANT ALL ON FUNCTION app.recompute_trip_schedule(p_trip_id uuid) TO authenticated;
GRANT ALL ON FUNCTION app.recompute_trip_schedule(p_trip_id uuid) TO service_role;

--
-- Name: FUNCTION reorder_trip_stop(p_stop_id uuid, p_new_sequence integer); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.reorder_trip_stop(p_stop_id uuid, p_new_sequence integer) TO anon;
GRANT ALL ON FUNCTION app.reorder_trip_stop(p_stop_id uuid, p_new_sequence integer) TO authenticated;
GRANT ALL ON FUNCTION app.reorder_trip_stop(p_stop_id uuid, p_new_sequence integer) TO service_role;

--
-- Name: FUNCTION seed_life_areas(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.seed_life_areas() TO authenticated;
GRANT ALL ON FUNCTION app.seed_life_areas() TO anon;
GRANT ALL ON FUNCTION app.seed_life_areas() TO service_role;

--
-- Name: FUNCTION stamp_ledger_base_amount(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.stamp_ledger_base_amount() TO authenticated;
GRANT ALL ON FUNCTION app.stamp_ledger_base_amount() TO anon;
GRANT ALL ON FUNCTION app.stamp_ledger_base_amount() TO service_role;

--
-- Name: FUNCTION today_for_user(p_user_id uuid); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.today_for_user(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION app.today_for_user(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION app.today_for_user(p_user_id uuid) TO service_role;

--
-- Name: FUNCTION touch_updated_at(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION app.touch_updated_at() TO anon;
GRANT ALL ON FUNCTION app.touch_updated_at() TO service_role;

--
-- Name: FUNCTION validate_avatar(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.validate_avatar() TO anon;
GRANT ALL ON FUNCTION app.validate_avatar() TO authenticated;
GRANT ALL ON FUNCTION app.validate_avatar() TO service_role;

--
-- Name: FUNCTION worst_rag(VARIADIC p public.rag_status[]); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION app.worst_rag(VARIADIC p public.rag_status[]) TO authenticated;
GRANT ALL ON FUNCTION app.worst_rag(VARIADIC p public.rag_status[]) TO anon;
GRANT ALL ON FUNCTION app.worst_rag(VARIADIC p public.rag_status[]) TO service_role;

--
-- Name: FUNCTION evaluate_achievements(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.evaluate_achievements() TO anon;
GRANT ALL ON FUNCTION public.evaluate_achievements() TO authenticated;
GRANT ALL ON FUNCTION public.evaluate_achievements() TO service_role;

--
-- Name: FUNCTION grant_achievement(p_code text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.grant_achievement(p_code text) TO anon;
GRANT ALL ON FUNCTION public.grant_achievement(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.grant_achievement(p_code text) TO service_role;

--
-- Name: FUNCTION presets_unlocked_by(p_achievement_code text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.presets_unlocked_by(p_achievement_code text) TO anon;
GRANT ALL ON FUNCTION public.presets_unlocked_by(p_achievement_code text) TO authenticated;
GRANT ALL ON FUNCTION public.presets_unlocked_by(p_achievement_code text) TO service_role;

--
-- Name: FUNCTION promote_someday_to_stop(someday_id uuid, trip_id uuid, nights integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.promote_someday_to_stop(someday_id uuid, trip_id uuid, nights integer) TO anon;
GRANT ALL ON FUNCTION public.promote_someday_to_stop(someday_id uuid, trip_id uuid, nights integer) TO authenticated;
GRANT ALL ON FUNCTION public.promote_someday_to_stop(someday_id uuid, trip_id uuid, nights integer) TO service_role;

--
-- Name: FUNCTION reorder_trip_stop(stop_id uuid, new_sequence integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reorder_trip_stop(stop_id uuid, new_sequence integer) TO anon;
GRANT ALL ON FUNCTION public.reorder_trip_stop(stop_id uuid, new_sequence integer) TO authenticated;
GRANT ALL ON FUNCTION public.reorder_trip_stop(stop_id uuid, new_sequence integer) TO service_role;

--
-- Name: TABLE achievements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.achievements TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.achievements TO authenticated;
GRANT ALL ON TABLE public.achievements TO service_role;

--
-- Name: TABLE avatar_presets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.avatar_presets TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.avatar_presets TO authenticated;
GRANT ALL ON TABLE public.avatar_presets TO service_role;

--
-- Name: TABLE cashflow_items; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.cashflow_items TO anon;
GRANT ALL ON TABLE public.cashflow_items TO authenticated;
GRANT ALL ON TABLE public.cashflow_items TO service_role;

--
-- Name: TABLE check_ins; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.check_ins TO anon;
GRANT ALL ON TABLE public.check_ins TO authenticated;
GRANT ALL ON TABLE public.check_ins TO service_role;

--
-- Name: TABLE fx_rates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fx_rates TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.fx_rates TO authenticated;
GRANT ALL ON TABLE public.fx_rates TO service_role;

--
-- Name: TABLE goal_participants; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.goal_participants TO anon;
GRANT ALL ON TABLE public.goal_participants TO authenticated;
GRANT ALL ON TABLE public.goal_participants TO service_role;

--
-- Name: TABLE goal_ratings; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.goal_ratings TO anon;
GRANT ALL ON TABLE public.goal_ratings TO authenticated;
GRANT ALL ON TABLE public.goal_ratings TO service_role;

--
-- Name: TABLE goals; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.goals TO anon;
GRANT ALL ON TABLE public.goals TO authenticated;
GRANT ALL ON TABLE public.goals TO service_role;

--
-- Name: TABLE invitations; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.invitations TO anon;
GRANT ALL ON TABLE public.invitations TO authenticated;
GRANT ALL ON TABLE public.invitations TO service_role;

--
-- Name: TABLE ledger_entries; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.ledger_entries TO anon;
GRANT ALL ON TABLE public.ledger_entries TO authenticated;
GRANT ALL ON TABLE public.ledger_entries TO service_role;

--
-- Name: TABLE life_areas; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.life_areas TO anon;
GRANT ALL ON TABLE public.life_areas TO authenticated;
GRANT ALL ON TABLE public.life_areas TO service_role;

--
-- Name: TABLE llama_messages; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.llama_messages TO anon;
GRANT ALL ON TABLE public.llama_messages TO authenticated;
GRANT ALL ON TABLE public.llama_messages TO service_role;

--
-- Name: TABLE milestones; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.milestones TO anon;
GRANT ALL ON TABLE public.milestones TO authenticated;
GRANT ALL ON TABLE public.milestones TO service_role;

--
-- Name: TABLE pots; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.pots TO anon;
GRANT ALL ON TABLE public.pots TO authenticated;
GRANT ALL ON TABLE public.pots TO service_role;

--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

--
-- Name: TABLE rag_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.rag_snapshots TO anon;
GRANT ALL ON TABLE public.rag_snapshots TO authenticated;
GRANT ALL ON TABLE public.rag_snapshots TO service_role;

--
-- Name: TABLE share_grants; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.share_grants TO anon;
GRANT ALL ON TABLE public.share_grants TO authenticated;
GRANT ALL ON TABLE public.share_grants TO service_role;

--
-- Name: TABLE someday_items; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.someday_items TO anon;
GRANT ALL ON TABLE public.someday_items TO authenticated;
GRANT ALL ON TABLE public.someday_items TO service_role;

--
-- Name: TABLE task_dependencies; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.task_dependencies TO anon;
GRANT ALL ON TABLE public.task_dependencies TO authenticated;
GRANT ALL ON TABLE public.task_dependencies TO service_role;

--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;

--
-- Name: TABLE trip_legs; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.trip_legs TO anon;
GRANT ALL ON TABLE public.trip_legs TO authenticated;
GRANT ALL ON TABLE public.trip_legs TO service_role;

--
-- Name: TABLE trip_stops; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.trip_stops TO anon;
GRANT ALL ON TABLE public.trip_stops TO authenticated;
GRANT ALL ON TABLE public.trip_stops TO service_role;

--
-- Name: TABLE trips; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.trips TO anon;
GRANT ALL ON TABLE public.trips TO authenticated;
GRANT ALL ON TABLE public.trips TO service_role;

--
-- Name: TABLE user_achievements; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.user_achievements TO anon;
GRANT ALL ON TABLE public.user_achievements TO authenticated;
GRANT ALL ON TABLE public.user_achievements TO service_role;

--
-- Name: TABLE v_monthly_capacity; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_monthly_capacity TO anon;
GRANT ALL ON TABLE public.v_monthly_capacity TO authenticated;
GRANT ALL ON TABLE public.v_monthly_capacity TO service_role;

--
-- Name: TABLE v_allocation_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_allocation_summary TO anon;
GRANT ALL ON TABLE public.v_allocation_summary TO authenticated;
GRANT ALL ON TABLE public.v_allocation_summary TO service_role;

--
-- Name: TABLE v_countries_visited; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_countries_visited TO anon;
GRANT ALL ON TABLE public.v_countries_visited TO authenticated;
GRANT ALL ON TABLE public.v_countries_visited TO service_role;

--
-- Name: TABLE v_goal_funding; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_goal_funding TO anon;
GRANT ALL ON TABLE public.v_goal_funding TO authenticated;
GRANT ALL ON TABLE public.v_goal_funding TO service_role;

--
-- Name: TABLE v_goal_affordability; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_goal_affordability TO anon;
GRANT ALL ON TABLE public.v_goal_affordability TO authenticated;
GRANT ALL ON TABLE public.v_goal_affordability TO service_role;

--
-- Name: TABLE v_pot_balances; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_pot_balances TO anon;
GRANT ALL ON TABLE public.v_pot_balances TO authenticated;
GRANT ALL ON TABLE public.v_pot_balances TO service_role;

--
-- Name: TABLE v_trip_estimates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_trip_estimates TO anon;
GRANT ALL ON TABLE public.v_trip_estimates TO authenticated;
GRANT ALL ON TABLE public.v_trip_estimates TO service_role;

--
-- Name: TABLE v_user_capacity; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_user_capacity TO anon;
GRANT ALL ON TABLE public.v_user_capacity TO authenticated;
GRANT ALL ON TABLE public.v_user_capacity TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: app; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app GRANT ALL ON FUNCTIONS TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--

\unrestrict keN8UOAYrHIjUMuE55EbhCGAr1R5Ne8yQdtAMELTlrqkwQCAHbwwvHazGbjlgLs
