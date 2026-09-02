-- P7.4: achievement copy, plus five new achievements for events that
-- were previously unrewarded. All nine existing `code` values are left
-- untouched (profiles.avatar validation, capacity/actions.ts's
-- grant_achievement('honest_reckoning') call, and the local test script
-- all reference codes, never names) — only name/description change, plus
-- two trigger_config thresholds (see below).
--
-- "Keep every achievement earnable by two people planning a move" (brief,
-- verbatim) is the reason two existing thresholds move: southern_cross
-- was 20 completed goals (under one every 2.6 weeks combined between two
-- people for a full year — the brief's own "twenty trips... will never
-- fire" example, almost to the letter) and well_travelled was 10
-- countries (world-traveller territory, not "planning a move" territory).
-- Lowered to 10 and 3 respectively — still the hardest tier of their own
-- three-step ladders (1/5/10 for goals, and 3 stands alone for
-- countries), just no longer clutter.

-- ---------------------------------------------------------------------
-- Renamed/rewritten copy for the nine existing achievements. Every name
-- now reads as navigation/night-sky, not just the three that already did
-- (First Light, Constellation, Southern Cross) — True North, Polaris,
-- Dead Reckoning, and Course Correction are all real navigation terms,
-- picked so the *meaning* lines up with what each one actually rewards
-- (Polaris: the star that's always there, for an unbroken half-year
-- streak; Dead Reckoning: precise navigation without landmarks, for
-- landing a goal on time *and* on budget; Course Correction: adjusting
-- heading deliberately, for choosing to lower your own limit).
--
-- `insert ... on conflict (code) do update`, not a plain `update`: the
-- original nine rows were never actually seeded by any committed
-- migration (0026 created the table and assumed the data already
-- existed — Schema.MD's "written ahead of the code" pattern, but for
-- data this time, not schema). A plain `update` against the real,
-- already-seeded production database silently does the right thing;
-- against a genuinely fresh database replayed from migration 0009
-- onward it matches zero rows and every one of these achievements
-- quietly ceases to exist — found by actually running the full
-- migration sequence against a fresh database (P7.5's own brief), not
-- by re-reading this file and assuming a plain `update` was fine. The
-- upsert makes this migration correct in both cases: rename where the
-- row exists, seed-with-final-values where it doesn't.
-- ---------------------------------------------------------------------
insert into achievements (code, name, description, trigger_type, trigger_config, sort_order, is_active) values
  ('first_light', 'First Light', 'Completed your first goal — start to finish.', 'goals_completed', '{"count": 1}'::jsonb, 1, true),
  ('constellation', 'Constellation', 'Completed five goals.', 'goals_completed', '{"count": 5}'::jsonb, 2, true),
  ('southern_cross', 'Southern Cross', 'Completed ten goals.', 'goals_completed', '{"count": 10}'::jsonb, 3, true),
  ('first_departure', 'First Departure', 'Completed your first trip.', 'trips_completed', '{"count": 1}'::jsonb, 4, true),
  ('well_travelled', 'Far Horizons', 'Visited three different countries.', 'countries_visited', '{"count": 3}'::jsonb, 5, true),
  ('steady_hand', 'True North', 'Four consecutive weekly check-ins.', 'checkin_streak', '{"weeks": 4}'::jsonb, 6, true),
  ('long_haul', 'Polaris', 'Twenty-six consecutive weekly check-ins.', 'checkin_streak', '{"weeks": 26}'::jsonb, 7, true),
  ('on_the_money', 'Dead Reckoning', 'Finished a goal on time and under budget.', 'goal_on_time', '{}'::jsonb, 8, true),
  ('honest_reckoning', 'Course Correction', 'Lowered your own goal limit after a hard month.', 'capacity_honesty', '{}'::jsonb, 9, true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  trigger_config = excluded.trigger_config;

do $$
declare n int;
begin
  select count(*) into n from achievements where code in (
    'first_light','constellation','southern_cross','first_departure',
    'well_travelled','steady_hand','long_haul','on_the_money','honest_reckoning'
  );
  assert n = 9, format('expected all nine existing codes to still exist, found %s', n);
end $$;

-- ---------------------------------------------------------------------
-- Five new trigger_types, all real conditions evaluated by
-- app.evaluate_achievements itself (not app-code "manual" grants) —
-- 'manual' stays reserved for honest_reckoning, the one genuine act of
-- judgement (P7.2's own reasoning); every one of these five is a plain
-- fact the database can check on its own. None of them need a new
-- polling site: goal_under_budget and checkin_tenure fire at the same
-- moments goal_on_time/steady_hand already do (goal completion, check-in
-- submit); shared_goal, trip_stop_booked, and someday_count fire
-- whenever any of the five existing trigger sites next runs for the
-- affected user — not instant for those three, but never lost, the same
-- trade-off `evaluateAchievementsDebounced`'s own dashboard-load poll
-- already accepts for anything that isn't a discrete event site.
-- ---------------------------------------------------------------------
alter table achievements drop constraint achievements_trigger_type_check;
alter table achievements add constraint achievements_trigger_type_check
  check (trigger_type = any (array[
    'goals_completed', 'trips_completed', 'checkin_streak', 'savings_milestone',
    'tasks_completed', 'countries_visited', 'goal_on_time', 'capacity_honesty',
    'manual', 'goal_under_budget', 'shared_goal', 'checkin_tenure',
    'trip_stop_booked', 'someday_count'
  ]));

insert into achievements (code, name, description, trigger_type, trigger_config, sort_order) values
  (
    'first_landfall', 'Landfall', 'Booked your first trip stop.',
    'trip_stop_booked', '{}'::jsonb, 10
  ),
  (
    'star_chart', 'Star Chart', 'Added ten places to your bucket list.',
    'someday_count', '{"count": 10}'::jsonb, 11
  ),
  (
    'fair_wind', 'Fair Wind', 'Completed a goal under budget.',
    'goal_under_budget', '{}'::jsonb, 12
  ),
  (
    'twin_stars', 'Twin Stars', 'Shared your first goal with someone else.',
    'shared_goal', '{}'::jsonb, 13
  ),
  (
    'full_orbit', 'Full Orbit', 'A year of showing up to check in.',
    'checkin_tenure', '{"count": 45}'::jsonb, 14
  );

-- ---------------------------------------------------------------------
-- app.evaluate_achievements, extended with the five new WHEN branches.
-- Full CREATE OR REPLACE, not a diff — everything above the new
-- branches is unchanged from 0026.
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

      -- P7.4: goal_under_budget is goal_on_time's own under-budget half,
      -- alone — no date condition. A goal with no target_amount_minor
      -- can't be "under budget" in any meaningful sense, so it never
      -- qualifies (same null-handling goal_on_time already applies, just
      -- without that clause's "or target_amount_minor is null" escape
      -- hatch, which only made sense paired with the date check).
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

      -- P7.4: "shared" means someone else is genuinely attached to the
      -- goal alongside p_user_id — either p_user_id owns it and at least
      -- one active participant exists, or p_user_id is an active
      -- participant and the goal has *some* other person on it (another
      -- participant, or an owner who isn't p_user_id themselves).
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

      -- P7.4: total submitted check-ins, not a live unbroken streak
      -- (that's checkin_streak's job, via Polaris/True North already) —
      -- deliberately forgiving of a handful of missed weeks over a year,
      -- since "showed up almost every week for a year" is a real,
      -- earnable thing, and an unbroken 52-week streak isn't.
      when 'checkin_tenure' then
        select count(*) into v_count
        from check_ins
        where user_id = p_user_id and submitted_at is not null;
        v_qualifies := v_count >= v_threshold;
        v_ctx := jsonb_build_object('count', v_count);

      -- P7.4: the first time any stop on one of this user's own trips
      -- moves out of 'idea'/'researching' into something actually
      -- locked in. Owner-scoped, matching every other per-goal trigger
      -- in this function (goals_completed, trips_completed, etc all read
      -- owner_id, not participants) rather than introducing a new,
      -- inconsistent participant-inclusive rule for just this one case.
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

      -- P7.4: mirrors src/lib/someday.ts's own isSomedayMilestone count
      -- exactly (non-deleted items, no distinction for promoted ones) —
      -- the achievement and the llama's "every tenth item" message read
      -- the same live count, just at different thresholds.
      when 'someday_count' then
        select count(*) into v_count
        from someday_items
        where user_id = p_user_id and deleted_at is null;
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
-- Two new avatar_presets, matching two of the five new achievements —
-- "every achievement need not unlock something; some can be flair
-- alone" (brief): first_landfall, star_chart, and fair_wind unlock
-- nothing here, deliberately. pose_serene uses a real Avataaars `eyes`
-- value ('closed') not yet used by any existing pose preset (P7.0's own
-- catalogue used default/happy/hearts/side/squint); accessory_twin_stars
-- is hand-drawn (src/lib/avatar/render.ts), same "no native match"
-- fallback the two existing accessory presets already use — a literal
-- pair of stars has no equivalent in Avataaars' eyewear-only accessories
-- option either.
-- ---------------------------------------------------------------------
insert into avatar_presets (code, category, name, asset_ref, unlock_achievement_id, sort_order)
select 'pose_serene', 'pose', 'Serene', 'closed', id, 13
from achievements where code = 'full_orbit';

insert into avatar_presets (code, category, name, asset_ref, unlock_achievement_id, sort_order)
select 'accessory_twin_stars', 'accessory', 'Twin Stars', 'badge-twin-stars', id, 12
from achievements where code = 'twin_stars';

do $$
declare n int;
begin
  select count(*) into n from achievements where is_active;
  assert n = 14, format('expected 14 active achievements, found %s', n);

  select count(*) into n from avatar_presets where code in ('pose_serene', 'accessory_twin_stars');
  assert n = 2, format('expected 2 new avatar_presets rows, found %s', n);
end $$;
