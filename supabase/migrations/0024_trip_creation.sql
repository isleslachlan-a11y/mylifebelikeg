-- P6.3: trip management. "A trip is a goal with kind = 'trip' plus a
-- trips row" (brief, verbatim) — trips.goal_id already has a trigger
-- (0016-era, app.enforce_trip_goal_kind) rejecting a trips row against a
-- non-trip goal, but nothing before this migration created the two rows
-- together atomically. PostgREST gives the client one statement per
-- request, not a client-driven multi-statement transaction, so "creates
-- the goal and the trip together in one transaction" (brief) has to mean
-- a single Postgres function doing both inserts — same reasoning
-- 0023's app.preview_task_slip comment gives for why its own rollback
-- has to live inside the function, not in application code.
create or replace function app.create_trip_goal(
  p_title text,
  p_description text,
  p_life_area_id uuid,
  p_funding public.funding_type,
  p_currency text,
  p_target_amount_minor bigint,
  p_start_date date,
  p_target_date date,
  p_visibility public.visibility_level,
  p_origin_name text,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_trip_notes text
)
returns table (goal_id uuid, trip_id uuid)
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_user     uuid := auth.uid();
  v_goal_id  uuid;
  v_trip_id  uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  -- No further authorization check needed beyond "signed in": this
  -- creates a brand-new goal owned by the caller, there is no existing
  -- resource to check app.can_edit_goal against yet. Every other
  -- constraint (goals_title_check, funded_goals_need_target,
  -- goal_dates_ordered, ...) is the same table CHECK a plain insert
  -- through goals_write's RLS would hit — this function doesn't
  -- duplicate that validation, a failure here surfaces the identical
  -- Postgres error humanizeDbError already maps.
  insert into goals (
    owner_id, title, description, life_area_id, kind, funding, currency,
    target_amount_minor, start_date, target_date, visibility
  ) values (
    v_user, p_title, p_description, p_life_area_id, 'trip', p_funding,
    p_currency, p_target_amount_minor, p_start_date, p_target_date,
    p_visibility
  )
  returning id into v_goal_id;

  -- app.enforce_trip_goal_kind (trips_kind_check, BEFORE INSERT) re-checks
  -- goals.kind = 'trip' here regardless — belt and braces, since the
  -- insert above is the only thing guaranteeing it in the same breath.
  insert into trips (goal_id, origin_name, origin_lat, origin_lng, notes)
  values (v_goal_id, p_origin_name, p_origin_lat, p_origin_lng, p_trip_notes)
  returning id into v_trip_id;

  return query select v_goal_id, v_trip_id;
end;
$$;

grant execute on function app.create_trip_goal(
  text, text, uuid, public.funding_type, text, bigint, date, date,
  public.visibility_level, text, double precision, double precision, text
) to authenticated;

-- The callable surface — same "app isn't reachable from supabase.rpc(),
-- public is a thin pass-through" shape as every other public.* wrapper
-- in this schema (0014's top comment; 0023's public.preview_task_slip).
create or replace function public.create_trip_goal(
  title text,
  description text,
  life_area_id uuid,
  funding public.funding_type,
  currency text,
  target_amount_minor bigint,
  start_date date,
  target_date date,
  visibility public.visibility_level,
  origin_name text,
  origin_lat double precision,
  origin_lng double precision,
  trip_notes text
)
returns table (goal_id uuid, trip_id uuid)
language sql
set search_path = public, app
as $$
  select * from app.create_trip_goal(
    title, description, life_area_id, funding, currency, target_amount_minor,
    start_date, target_date, visibility, origin_name, origin_lat, origin_lng,
    trip_notes
  );
$$;

-- app.reorder_trip_stop and app.promote_someday_to_stop both predate this
-- migration (verified against a live `supabase db dump`, not assumed —
-- same "objects already live before the migration file existed" pattern
-- CLAUDE.md documents for several 0014+ migrations) but neither had a
-- public wrapper yet, so neither was actually callable from
-- supabase.rpc(). These two are that wrapper, nothing else changes.
create or replace function public.reorder_trip_stop(stop_id uuid, new_sequence integer)
returns void
language sql
set search_path = public, app
as $$
  select app.reorder_trip_stop(stop_id, new_sequence);
$$;

create or replace function public.promote_someday_to_stop(
  someday_id uuid,
  trip_id uuid,
  nights integer default 2
)
returns uuid
language sql
set search_path = public, app
as $$
  select app.promote_someday_to_stop(someday_id, trip_id, nights);
$$;
