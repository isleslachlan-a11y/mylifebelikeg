-- P7.2: wiring achievement unlocking to real events.
--
-- `app.evaluate_achievements`, `app.grant_achievement`, and
-- `app.presets_unlocked_by` (all 0026) live in the `app` schema, which
-- PostgREST doesn't expose — same "neither had a public wrapper yet, so
-- neither was actually reachable from supabase.rpc()" situation
-- 0024_trip_creation.sql's own header describes for
-- `reorder_trip_stop`/`promote_someday_to_stop`. These three are that
-- wrapper. Each pins `auth.uid()` internally rather than accepting a
-- caller-supplied user id, matching `public.suggest_goal_limit_change`/
-- `public.current_checkin_period` (0019) rather than
-- `public.create_trip_goal`'s own shape — there's no legitimate
-- "evaluate someone else's achievements" caller, so the possibility is
-- removed at the wrapper rather than left for `app.grant_achievement`'s
-- own `p_user_id <> auth.uid()` check (0026) to catch. `language sql`,
-- no `security definer` — the underlying `app.*` functions are already
-- `security definer`, and RLS on `achievements`/`avatar_presets` is
-- permissive-read for any signed-in user regardless.
create or replace function public.evaluate_achievements()
returns table (code text, name text)
language sql
set search_path = public, app
as $$
  select * from app.evaluate_achievements(auth.uid());
$$;

create or replace function public.grant_achievement(p_code text)
returns boolean
language sql
set search_path = public, app
as $$
  select app.grant_achievement(auth.uid(), p_code);
$$;

create or replace function public.presets_unlocked_by(p_achievement_code text)
returns table (code text, category text, name text)
language sql
set search_path = public, app
as $$
  select * from app.presets_unlocked_by(auth.uid(), p_achievement_code);
$$;

-- Dashboard load is the one call site that's a genuine poll (every
-- other trigger — check-in submit, goal/trip completion, a ledger
-- entry, accepting a "lower" capacity suggestion — is a discrete event
-- and always runs evaluate_achievements immediately, uncached). A
-- separate column from `llama_evaluated_at` (0020) on purpose: these
-- are two independent systems debounced against two independent clocks
-- — sharing one timestamp would mean whichever system's dashboard-load
-- call happens to run first silently suppresses the other's for the
-- same hour. Nullable, same reasoning as 0020: never evaluated yet
-- reads as "run now", not an error.
alter table public.profiles
  add column achievements_evaluated_at timestamptz;
