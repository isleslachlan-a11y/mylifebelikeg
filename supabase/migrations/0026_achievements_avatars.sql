-- Phase 7: profile, avatars, and achievements. Same situation 0014,
-- 0016, 0018, 0021 were each already in — this documents what's already
-- live on the real Supabase project rather than introducing new
-- behaviour. The three tables (`achievements`, `avatar_presets`,
-- `user_achievements`), `profiles.avatar`, and their RLS policies
-- pre-date this migration file (part of the original uncaptured schema,
-- per Schema.MD's usual "written ahead of the code" pattern — already
-- reflected in the committed `src/types/database.ts`). What this file
-- actually captures net-new, verified live via `pg_get_functiondef`/
-- `pg_get_viewdef`/`pg_get_triggerdef` (not hand-derived) and cross-
-- checked against `supabase/local/010 achievements test`: the two
-- evaluator functions, the unlock view, and the two enforcement
-- triggers. The brief that opened this phase named this migration
-- "0017_achievements_avatars.sql" — that number was already claimed by
-- 0017_rag_override_history.sql by the time this phase started, so it's
-- filed here as 0026 instead (per CLAUDE.md: check the live schema, not
-- the highest committed filename, when picking the next number). The
-- `asset_ref` values seeded below are still the placeholder_* strings
-- P7.0 exists to replace — that migration lands separately, since it
-- depends on which avatar library/collection gets chosen.

-- ---------------------------------------------------------------------
-- app.evaluate_achievements: idempotent, returns only newly unlocked
-- codes. Loops every active achievement the user doesn't already hold
-- and checks it against its trigger_type; `trigger_config` is read
-- defensively (count / weeks / amount_minor, falling back to 1) since
-- which key is set depends on which trigger_type it belongs to, the
-- same "loosely-typed jsonb, every key optional" shape rag.ts's
-- ragInputs() already uses for compute_goal_rag's inputs. A caught
-- unique_violation on the insert is the idempotency guard for two
-- concurrent evaluations of the same user racing each other, not an
-- expected steady-state path.
-- ---------------------------------------------------------------------
create or replace function app.evaluate_achievements(p_user_id uuid)
returns table(code text, name text)
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
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
        -- Completed on or before target date AND at or under budget.
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
        -- Lowered their own limit while goals were struggling: a real act of
        -- judgement, not an accident. Recorded by the app when accepted.
        v_qualifies := coalesce((a.trigger_config->>'granted')::boolean, false);

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

-- ---------------------------------------------------------------------
-- app.grant_achievement: the manual-grant path for app-decided
-- achievements (honest_reckoning — the capacity-suggestion flow decides
-- when a lowered limit was a real act of judgement, not something a
-- generic counting rule can detect). Refuses to grant to a user other
-- than the caller unless called with no session at all (auth.uid() is
-- null), which is what lets a SECURITY DEFINER server-side call site
-- still work; the local test's "cannot grant to another user" case
-- exercises the auth.uid() IS NOT NULL branch specifically.
-- ---------------------------------------------------------------------
create or replace function app.grant_achievement(p_user_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
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

-- ---------------------------------------------------------------------
-- app.presets_unlocked_by: what a given achievement unlocks, for the
-- reveal moment when it's granted — a plain read, SECURITY DEFINER only
-- so it can see avatar_presets rows regardless of caller session shape,
-- same reasoning v_available_presets' own auth.uid() read needs a
-- security barrier for.
-- ---------------------------------------------------------------------
create or replace function app.presets_unlocked_by(p_user_id uuid, p_achievement_code text)
returns table(code text, category text, name text)
language sql
stable security definer
set search_path to 'public', 'app'
as $$
  select ap.code, ap.category, ap.name
  from avatar_presets ap
  join achievements ac on ac.id = ap.unlock_achievement_id
  where ac.code = p_achievement_code and ap.is_active
  order by ap.category, ap.sort_order;
$$;

-- ---------------------------------------------------------------------
-- v_available_presets: every active preset with is_unlocked for the
-- current user, plus the unlocking achievement's own name/description
-- as unlock_hint — "a locked preset should say how to get it" (the
-- local test's own assertion). security_invoker is deliberately NOT
-- set here (unlike v_critical_path and friends) because the view's
-- is_unlocked expression already keys off auth.uid() directly rather
-- than relying on RLS row visibility to do the filtering.
-- ---------------------------------------------------------------------
create or replace view v_available_presets as
select
  ap.id,
  ap.code,
  ap.category,
  ap.name,
  ap.asset_ref,
  ap.sort_order,
  ap.unlock_achievement_id,
  ac.code as unlock_achievement_code,
  ac.name as unlock_achievement_name,
  ac.description as unlock_hint,
  ap.unlock_achievement_id is null or exists (
    select 1 from user_achievements ua
    where ua.user_id = auth.uid() and ua.achievement_id = ap.unlock_achievement_id
  ) as is_unlocked
from avatar_presets ap
left join achievements ac on ac.id = ap.unlock_achievement_id
where ap.is_active;

-- ---------------------------------------------------------------------
-- app.validate_avatar: the trigger that makes the whole unlock system
-- non-decorative (P7 brief, verbatim: "without it, equipping a locked
-- outfit is one crafted API call away"). Fires BEFORE INSERT OR UPDATE
-- OF avatar on profiles, so a client posting straight to PostgREST gets
-- the same enforcement the UI does. Refuses three distinct shapes, each
-- its own error and errcode so client code (humanizeDbError) can tell
-- them apart: an unknown slot key, an unknown/wrong-category preset
-- code (check_violation — a data-shape problem), and a real-but-locked
-- preset (insufficient_privilege — an authorization problem, matching
-- grant_achievement's own errcode choice for the same category of
-- refusal).
-- ---------------------------------------------------------------------
create or replace function app.validate_avatar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
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

drop trigger if exists profiles_validate_avatar on profiles;
create trigger profiles_validate_avatar
  before insert or update of avatar on profiles
  for each row execute function app.validate_avatar();

-- ---------------------------------------------------------------------
-- app.enforce_pin_limit: caps pinned achievements at three (the local
-- test's own bar — the fourth pin attempt must fail with
-- check_violation). Only runs the count when the row being written is
-- itself being pinned true, so un-pinning is always free.
-- ---------------------------------------------------------------------
create or replace function app.enforce_pin_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare v_n integer;
begin
  if new.is_pinned then
    select count(*) into v_n
    from user_achievements
    where user_id = new.user_id and is_pinned and id <> new.id;

    if v_n >= 3 then
      raise exception 'You can pin at most three achievements'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_achievements_pin_limit on user_achievements;
create trigger user_achievements_pin_limit
  before insert or update of is_pinned on user_achievements
  for each row execute function app.enforce_pin_limit();
