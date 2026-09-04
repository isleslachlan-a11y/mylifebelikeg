-- Phase 8, P8.0: the Dream Diary — someday_items grows up, not a parallel
-- table. The brief names this "0018_dreams.sql"; 0018 was already
-- claimed by 0018_rating_trend_and_divergence_fix.sql by the time this
-- phase started, so — per CLAUDE.md's own rule for exactly this
-- situation — it's filed as 0031, the real next number, checked against
-- the live schema rather than assumed.
--
-- Read directly off the live `someday_items` table before writing
-- anything here, not assumed from the brief's own description of intent
-- (its own instruction, taken literally): latitude, longitude,
-- place_name, mapbox_place_id, and country_code are *already* all
-- nullable, and there is already exactly one constraint tying place
-- fields together — `someday_coords_paired`, `(latitude IS NULL) =
-- (longitude IS NULL)` — already the all-or-nothing pairing the brief
-- asks to "keep" if one exists. Nothing to drop; place_name/
-- mapbox_place_id/country_code were never part of that pairing to begin
-- with. An `unsplash_needs_attribution` constraint also already exists
-- (P6.0) and is untouched here — it still does its own job regardless
-- of the new image_source/storage_path columns below.

-- ---------------------------------------------------------------------
-- kind: what a dream actually is. Default 'place' so every one of the
-- rows that already exist (all of them place-shaped, from before this
-- column existed) keeps its current meaning without a backfill.
-- ---------------------------------------------------------------------
create type dream_kind as enum ('place', 'object', 'experience', 'other');

alter table someday_items
  add column kind dream_kind not null default 'place';

-- ---------------------------------------------------------------------
-- Your own photos (P8.1 builds the upload path itself; this is just the
-- column shape it needs). `storage_path` is an object path inside the
-- bucket, never a signed URL — those expire, so storing one would mean
-- silently-broken images the moment it does. `image_source` is nullable
-- on its own (an item can have no image at all, same as today), but the
-- three-way check below makes every *other* combination structurally
-- impossible: an upload always has a path and never Unsplash
-- attribution, an Unsplash image always has attribution and never a
-- path, and "no image" means neither. Attribution is a licence
-- obligation (P6.0's own reasoning for `unsplash_needs_attribution`) —
-- this is that same reasoning extended to the new source, not a new
-- idea.
-- ---------------------------------------------------------------------
create type dream_image_source as enum ('unsplash', 'upload');

alter table someday_items
  add column image_source dream_image_source,
  add column storage_path text;

alter table someday_items
  add constraint dream_image_source_consistent check (
    (image_source is null and storage_path is null and unsplash_photo_id is null)
    or (image_source = 'upload' and storage_path is not null and unsplash_photo_id is null)
    or (image_source = 'unsplash' and storage_path is null and unsplash_photo_id is not null)
  );

-- ---------------------------------------------------------------------
-- Achieved, distinct from promoted (brief, verbatim: "promoting means
-- it became a plan, achieving means you have it"). `achieved_storage_path`
-- deliberately has no `achieved_image_source`/attribution columns
-- alongside it the way the dream photo does: an achieved photo is
-- definitionally a real photo of the real thing you now have, never a
-- stock Unsplash image, so there's no second source to distinguish —
-- one column, always an upload, is the whole pattern here, not a gap.
-- ---------------------------------------------------------------------
alter table someday_items
  add column achieved_at timestamptz,
  add column achieved_note text,
  add column achieved_storage_path text;

alter table someday_items
  add constraint achieved_photo_needs_achieved_at check (
    achieved_storage_path is null or achieved_at is not null
  );

-- ---------------------------------------------------------------------
-- Resurfacing (P8.5's own prompt engine reads these; this migration
-- only owns the columns). Nullable throughout — a dream that's never
-- been surfaced or snoozed has no value for either yet, which is a
-- real, common state (every existing row, right after this migration
-- runs), not an error.
-- ---------------------------------------------------------------------
alter table someday_items
  add column last_surfaced_at timestamptz,
  add column snoozed_until date;

-- ---------------------------------------------------------------------
-- Archived: soft, like everything else in this schema, and a genuinely
-- different outcome from achieved — a dream you no longer want is not
-- the same event as a dream you got, and the constraint below makes
-- having both a data-integrity error, not just a UI inconsistency
-- ("having both is a bug upstream," brief, verbatim).
-- ---------------------------------------------------------------------
alter table someday_items
  add column archived_at timestamptz;

alter table someday_items
  add constraint achieved_xor_archived check (
    achieved_at is null or archived_at is null
  );

-- ---------------------------------------------------------------------
-- v_someday_progress: the existing four columns are untouched (Phase
-- 6's /someday page reads them directly) — this only adds three.
-- `unachieved_cost_minor_base` converts every unachieved dream's own
-- currency into the user's base_currency before summing, same
-- app.fx_rate pattern the rest of this schema already uses for
-- cross-currency totals (v_goal_affordability, v_monthly_capacity) —
-- summing raw minor units across different currencies would be
-- meaningless. The join to `profiles` for base_currency doesn't change
-- any existing row's grouping (every someday_items.user_id has exactly
-- one profiles row, not-null FK), so the four original columns keep
-- computing exactly what they always did.
-- ---------------------------------------------------------------------
create or replace view v_someday_progress
with (security_invoker = true) as
select
  si.user_id,
  count(*)::integer as total_items,
  count(*) filter (where si.promoted_at is not null)::integer as promoted_count,
  count(*) filter (where si.promoted_at is null)::integer as still_dreaming,
  count(distinct si.country_code) filter (where si.country_code is not null)::integer as countries_wanted,
  count(*) filter (where si.achieved_at is not null)::integer as achieved_count,
  count(*) filter (where si.archived_at is not null)::integer as archived_count,
  coalesce(sum(
    round(si.rough_cost_minor * app.fx_rate(si.currency, p.base_currency))
  ) filter (
    where si.achieved_at is null and si.archived_at is null and si.rough_cost_minor is not null
  ), 0)::bigint as unachieved_cost_minor_base
from someday_items si
join profiles p on p.id = si.user_id
where si.deleted_at is null
group by si.user_id, p.base_currency;

-- ---------------------------------------------------------------------
-- The affordability maths itself lives in exactly one place:
-- app.affordable_from (Phase 2) already answers "how long, at the
-- current rate, to accumulate a remaining amount" for a goal — it just
-- has the months-to-date conversion and the goal-specific "where does
-- the monthly rate come from" fused into one function. Split those
-- apart: app.months_to_afford is the reusable core (an amount and a
-- rate in, a month count out — no goal, no date, nothing goal-shaped at
-- all), and affordable_from is rewritten to call it rather than compute
-- the same ceil() a second time where it could drift from this one.
-- Verified byte-for-byte equivalent to the pre-existing behaviour: same
-- v_remain/v_monthly inputs, same date_trunc+make_interval conversion,
-- just factored so a second caller (v_dream_affordability below) can
-- reuse the core without a goal in sight.
-- ---------------------------------------------------------------------
create or replace function app.months_to_afford(
  p_remaining_minor numeric,
  p_monthly_rate_minor numeric
)
returns integer
language sql
immutable
as $$
  select case
    when p_remaining_minor <= 0 then 0
    when p_monthly_rate_minor is null or p_monthly_rate_minor <= 0 then null
    else ceil(p_remaining_minor / p_monthly_rate_minor)::integer
  end;
$$;

create or replace function app.affordable_from(p_goal_id uuid)
returns date
language plpgsql
stable security definer
set search_path to 'public', 'app'
as $$
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

  -- Already there. Kept as its own early return, not folded into
  -- months_to_afford's own remaining<=0 -> 0 case below: 0 months from
  -- the *start of this month* is not the same date as v_today, and the
  -- pre-existing behaviour (and 006 affordability test's own assertion)
  -- is the exact date, not a month boundary. Caught by actually running
  -- the local suite against this refactor, not assumed safe because the
  -- two looked equivalent on paper.
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
    return null;  -- never, at the current rate
  end if;

  -- Whole calendar months from the start of the current month, so the answer
  -- lands on a real month boundary rather than an arbitrary 30-day multiple.
  return (date_trunc('month', v_today::timestamp)
          + make_interval(months => v_months))::date;
end;
$$;

-- ---------------------------------------------------------------------
-- v_dream_affordability: one row per unachieved, unarchived, costed
-- dream, joined to the dream owner's own monthly capacity (P2.1's
-- v_monthly_capacity) converted into the dream's own currency. The join
-- key is deliberately `si.user_id`, not `auth.uid()` — "affordable for
-- the dream's owner" is the only meaning that makes sense regardless of
-- who's looking. v_monthly_capacity's own definition already restricts
-- to `p.id = auth.uid()` (a user's cashflow capacity is exactly the
-- kind of thing this app never exposes to anyone else, per the
-- established "nothing about their money" rule the P7.3 profile pages
-- already follow) — an inner join, not a left join, is what makes that
-- restriction actually bite: a dream visible to a share-grant viewer
-- through someday_items' own RLS (security_invoker on this view) simply
-- has no row here at all for anyone but its owner, rather than a row
-- with capacity zeroed out or nulled. Nothing is computed for the
-- viewer's own capacity — this is never "can I afford your dream."
-- ---------------------------------------------------------------------
create or replace view v_dream_affordability
with (security_invoker = true) as
select
  si.id as dream_id,
  si.user_id,
  si.title,
  si.currency,
  si.rough_cost_minor,
  round(mc.monthly_capacity_minor * app.fx_rate(mc.base_currency, si.currency))::bigint
    as monthly_capacity_minor,
  app.months_to_afford(
    si.rough_cost_minor,
    round(mc.monthly_capacity_minor * app.fx_rate(mc.base_currency, si.currency))
  ) as months_to_afford
from someday_items si
join v_monthly_capacity mc on mc.user_id = si.user_id
where si.deleted_at is null
  and si.achieved_at is null
  and si.archived_at is null
  and si.rough_cost_minor is not null;

-- ---------------------------------------------------------------------
-- Achievements: dreams_achieved follows goals_completed's own shape
-- exactly (count, threshold from trigger_config, context jsonb) — full
-- CREATE OR REPLACE, not a diff, same as every prior extension of this
-- function (0029 most recently).
-- ---------------------------------------------------------------------
alter table achievements drop constraint achievements_trigger_type_check;
alter table achievements add constraint achievements_trigger_type_check
  check (trigger_type = any (array[
    'goals_completed', 'trips_completed', 'checkin_streak', 'savings_milestone',
    'tasks_completed', 'countries_visited', 'goal_on_time', 'capacity_honesty',
    'manual', 'goal_under_budget', 'shared_goal', 'checkin_tenure',
    'trip_stop_booked', 'someday_count', 'dreams_achieved'
  ]));

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

-- ---------------------------------------------------------------------
-- Two new achievements, navigation/night-sky named (P7.4's own theme,
-- carried forward): a dream achieved is a new fixed point in the sky,
-- not a fleeting one. Both get an avatar_presets unlock — the brief
-- doesn't offer these two the "flair alone" option P7.4's five did.
-- pose_delighted uses 'surprised', the one real Avataaars `eyes` value
-- P7.0/P7.4's poses never claimed; accessory_star_cluster is hand-drawn
-- (src/lib/avatar/render.ts, P8.x application code), same "no native
-- match" fallback every existing accessory already uses — three stars
-- has no Avataaars equivalent either.
-- ---------------------------------------------------------------------
insert into achievements (code, name, description, trigger_type, trigger_config, sort_order, is_active) values
  ('new_star', 'New Star', 'Achieved your first dream.', 'dreams_achieved', '{"count": 1}'::jsonb, 15, true),
  ('star_cluster', 'Star Cluster', 'Achieved ten dreams.', 'dreams_achieved', '{"count": 10}'::jsonb, 16, true)
on conflict (code) do nothing;

insert into avatar_presets (code, category, name, asset_ref, unlock_achievement_id, sort_order)
select 'pose_delighted', 'pose', 'Delighted', 'surprised', id, 14
from achievements where code = 'new_star'
on conflict (code) do nothing;

insert into avatar_presets (code, category, name, asset_ref, unlock_achievement_id, sort_order)
select 'accessory_star_cluster', 'accessory', 'Star Cluster', 'badge-star-cluster', id, 13
from achievements where code = 'star_cluster'
on conflict (code) do nothing;

do $$
declare n int;
begin
  select count(*) into n from achievements where is_active;
  assert n = 16, format('expected 16 active achievements, found %s', n);

  select count(*) into n from avatar_presets where code in ('pose_delighted', 'accessory_star_cluster');
  assert n = 2, format('expected 2 new avatar_presets rows, found %s', n);

  select count(*) into n
  from information_schema.columns
  where table_name = 'someday_items'
    and column_name in (
      'kind', 'image_source', 'storage_path', 'achieved_at', 'achieved_note',
      'achieved_storage_path', 'last_surfaced_at', 'snoozed_until', 'archived_at'
    );
  assert n = 9, format('expected 9 new someday_items columns, found %s', n);
end $$;
