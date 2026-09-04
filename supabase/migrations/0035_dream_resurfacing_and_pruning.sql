-- P8.5: Prompts, and pruning. "Build dream resurfacing on top of the
-- existing check-in engine rather than beside it" (brief, verbatim) --
-- everything here keys off `check_ins`, the same one-row-per-period
-- abstraction `app.current_checkin_period`/`app.ensure_current_checkin`
-- (0014) already established, rather than recomputing period boundaries
-- a second way.
--
-- ---------------------------------------------------------------------
-- Weekly surfacing. `check_ins.surfaced_dream_id` -- which dream (if
-- any) was surfaced for *this* period -- is what makes
-- `app.surface_dream_for_checkin` idempotent for free: a check-in page
-- visited twice in the same week doesn't re-roll the dice, it just
-- returns whatever it already picked. No new period-boundary logic of
-- its own; "this period" already means exactly whichever check_ins row
-- ensure_current_checkin resolved to.
-- ---------------------------------------------------------------------
alter table check_ins
  add column surfaced_dream_id uuid references someday_items(id) on delete set null;

create function app.surface_dream_for_checkin(p_check_in_id uuid) returns uuid
    language plpgsql security definer
    set search_path to 'public', 'app'
    as $$
declare
  v_user     uuid;
  v_existing uuid;
  v_picked   uuid;
begin
  select user_id, surfaced_dream_id into v_user, v_existing
  from check_ins where id = p_check_in_id;

  if v_user is null then
    raise exception 'Check-in not found' using errcode = 'no_data_found';
  end if;
  if v_user <> auth.uid() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  -- Idempotent: already picked for this period, return the same one --
  -- never re-rolled, never re-stamped.
  if v_existing is not null then
    return v_existing;
  end if;

  -- Selection rules (brief, verbatim): never one with snoozed_until in
  -- the future or archived_at set; prefer the largest last_surfaced_at
  -- gap; break ties randomly, not by id. NULLS FIRST puts a dream
  -- that's never been surfaced (an infinite gap) ahead of anything
  -- that's been surfaced before, which is what "largest gap" means at
  -- the boundary; random() breaks a genuine tie (most commonly several
  -- NULLs) without favouring whichever row happens to sort first by id.
  -- Achieved dreams are excluded too -- resurfacing is for dreams
  -- nothing has happened to yet, not ones already settled.
  select id into v_picked
  from someday_items
  where user_id = v_user
    and deleted_at is null
    and archived_at is null
    and achieved_at is null
    and (snoozed_until is null or snoozed_until < app.today_for_user(v_user))
  order by last_surfaced_at asc nulls first, random()
  limit 1;

  if v_picked is null then
    return null;
  end if;

  update someday_items set last_surfaced_at = now() where id = v_picked;
  update check_ins set surfaced_dream_id = v_picked where id = p_check_in_id;

  return v_picked;
end;
$$;

create function public.surface_dream_for_checkin(check_in_id uuid) returns uuid
    language sql
    set search_path to 'public', 'app'
    as $$
  select app.surface_dream_for_checkin(check_in_id);
$$;

-- "Not right now — snooze for three months" (brief, verbatim). A small
-- RPC rather than a plain client-side `.update()` for the same reason
-- every other user-timezone-sensitive date write in this app goes
-- through the database (see app.today_for_user's own callers): three
-- calendar months from the user's own local today, not from whatever
-- date happens to be current in the server process or the browser.
create function app.snooze_dream(p_dream_id uuid) returns void
    language plpgsql security definer
    set search_path to 'public', 'app'
    as $$
declare
  v_user uuid := auth.uid();
begin
  update someday_items
     set snoozed_until = app.today_for_user(v_user) + interval '3 months'
   where id = p_dream_id and user_id = v_user and deleted_at is null;

  if not found then
    raise exception 'Dream not found' using errcode = 'no_data_found';
  end if;
end;
$$;

create function public.snooze_dream(dream_id uuid) returns void
    language sql
    set search_path to 'public', 'app'
    as $$
  select app.snooze_dream(dream_id);
$$;

-- ---------------------------------------------------------------------
-- Quarterly prune. "Dreams untouched for over a year" (brief) --
-- `coalesce(last_surfaced_at, created_at)` is the one shared "last time
-- a human looked at this" signal both this view and the weekly
-- surfacing above read from: a dream that's never been surfaced uses
-- its own creation as the anchor (sat there, ignored, since it was
-- added); one that has, resets the clock, the same way "Keep" in the
-- prune batch UI does by calling the exact same surface path. One
-- shared timestamp, not a second one invented for this view alone.
-- ---------------------------------------------------------------------
create view v_dream_prune_candidates
with (security_invoker = true) as
select
  si.id as dream_id,
  si.user_id,
  si.title,
  si.kind,
  si.rough_cost_minor,
  si.currency,
  si.created_at,
  si.last_surfaced_at,
  coalesce(si.last_surfaced_at, si.created_at) as last_touched_at
from someday_items si
where si.deleted_at is null
  and si.archived_at is null
  and si.achieved_at is null
  and coalesce(si.last_surfaced_at, si.created_at) < now() - interval '1 year';

do $$
begin
  assert (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'check_ins'
      and column_name = 'surfaced_dream_id'
  ) = 1, 'expected check_ins.surfaced_dream_id to exist';

  assert (
    select count(*) from information_schema.views
    where table_schema = 'public' and table_name = 'v_dream_prune_candidates'
  ) = 1, 'expected v_dream_prune_candidates to exist';
end $$;
