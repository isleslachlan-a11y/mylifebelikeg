-- P8.3: Price, and the question worth answering. Wires a dream's cost
-- into the same affordability machinery goals already use, and adds the
-- second promotion path (dream -> goal, alongside the existing P6.3
-- dream -> trip stop path, which this migration never touches).
--
-- ---------------------------------------------------------------------
-- Multi-currency: "store the currency as entered and stamp the FX rate
-- the same way the ledger does" (brief, verbatim). ledger_entries'
-- own shape (confirmed live: currency, base_currency, base_amount_minor,
-- fx_rate_applied, stamped by a BEFORE INSERT trigger,
-- app.stamp_ledger_base_amount) is the pattern to mirror -- prefixed
-- `cost_*` here since someday_items isn't a financial-ledger table with
-- one canonical "amount," just a rough_cost_minor/currency pair that
-- now also carries its own stamped conversion.
--
-- Two deliberate differences from the ledger's own trigger:
--   1. Ledger entries stamp once, at insert, and never again (there's no
--      re-stamp-on-update trigger for ledger_entries at all -- a
--      transaction's rate is fixed the moment it happened). A dream's
--      price is editable indefinitely, so this fires on UPDATE too, but
--      *only* when rough_cost_minor or currency actually changed --
--      editing the title doesn't quietly refresh the exchange-rate
--      snapshot to today's for no reason.
--   2. A missing FX rate degrades gracefully (null base columns) rather
--      than raising -- a dream is a wishlist entry, not a financial
--      transaction; the UI shows "conversion unavailable" rather than
--      refusing to save a price at all.
-- ---------------------------------------------------------------------
alter table someday_items
  add column cost_base_currency character(3),
  add column cost_base_minor bigint,
  add column cost_fx_rate_applied numeric(20,10),
  add constraint dream_cost_base_currency_check
    check (cost_base_currency is null or app.is_currency_code(cost_base_currency::text)),
  add constraint dream_cost_base_minor_check
    check (cost_base_minor is null or cost_base_minor >= 0),
  add constraint dream_cost_fx_rate_applied_check
    check (cost_fx_rate_applied is null or cost_fx_rate_applied > 0);

create function app.stamp_dream_cost_base() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'app'
    as $$
declare
  v_base char(3);
  v_rate numeric;
begin
  -- Nothing to re-stamp: cost/currency untouched by this update. Any
  -- column this UPDATE's own SET clause didn't mention already carries
  -- its prior value into NEW, so there's nothing to explicitly restore.
  if TG_OP = 'UPDATE'
     and new.rough_cost_minor is not distinct from old.rough_cost_minor
     and new.currency is not distinct from old.currency then
    return new;
  end if;

  if new.rough_cost_minor is null or new.currency is null then
    new.cost_base_currency := null;
    new.cost_base_minor := null;
    new.cost_fx_rate_applied := null;
    return new;
  end if;

  select base_currency into v_base from profiles where id = new.user_id;
  v_base := coalesce(v_base, 'AUD');
  v_rate := app.fx_rate(new.currency, v_base);

  if v_rate is null then
    new.cost_base_currency := null;
    new.cost_base_minor := null;
    new.cost_fx_rate_applied := null;
    return new;
  end if;

  new.cost_base_currency := v_base;
  new.cost_fx_rate_applied := v_rate;
  new.cost_base_minor := round(new.rough_cost_minor * v_rate);
  return new;
end;
$$;

create trigger someday_stamp_cost_base
  before insert or update on someday_items
  for each row execute function app.stamp_dream_cost_base();

-- ---------------------------------------------------------------------
-- v_dream_affordability, extended. Two real changes, not just added
-- columns:
--   1. months_to_afford now divides the *stamped* cost_base_minor by
--      capacity already in base currency -- no live FX conversion left
--      in the view at all (the old version converted monthly_capacity
--      *into the dream's own currency* on every read; the stamped
--      column makes that unnecessary and gives "show both the original
--      and the base-currency conversion" -- brief, verbatim -- for
--      free, since cost_base_minor/cost_base_currency *are* that
--      conversion).
--   2. Capacity collision: committed_monthly_minor (what the owner has
--      already pledged across their own active goals, base currency),
--      spare_capacity_minor (what's left), realistic_months_to_afford
--      (the honest figure, using only the *spare* capacity rather than
--      100% of it), and competing_goal_titles (what's actually
--      consuming that capacity). "If adding a dream's cost would push a
--      funded goal into amber, surface that... rather than silently"
--      (brief) -- deliberately does NOT claim to predict which specific
--      goal's RAG would flip: app.compute_goal_rag's schedule dimension
--      is driven by money already banked and elapsed time, not a
--      forward-looking pledge total, so no query can honestly say "goal
--      X will go amber." What's actually true and computable is that
--      months_to_afford (the top-line figure) assumes 100% of capacity
--      is free -- these columns surface how much of it *isn't*, and to
--      what, which is the real substance of "competes with your goals."
-- ---------------------------------------------------------------------
-- Column order matters here in a way it doesn't in most of this file:
-- `CREATE OR REPLACE VIEW` can only change an existing column's
-- expression in place, never its name or position (0025's own comment
-- already established this for v_timeline_items) -- the original seven
-- columns (dream_id ... months_to_afford) keep their exact name and
-- position, even though monthly_capacity_minor and months_to_afford's
-- own *expressions* change underneath; every genuinely new column is
-- appended after them.
create or replace view v_dream_affordability
with (security_invoker = true) as
select
  si.id as dream_id,
  si.user_id,
  si.title,
  si.currency,
  si.rough_cost_minor,
  -- Previously converted *into the dream's own currency* on every read;
  -- now the plain base-currency figure v_monthly_capacity already
  -- computes, since months_to_afford below compares it against the
  -- *stamped* cost_base_minor rather than doing a second live
  -- conversion of its own.
  mc.monthly_capacity_minor,
  app.months_to_afford(si.cost_base_minor, mc.monthly_capacity_minor)
    as months_to_afford,
  si.cost_base_currency,
  si.cost_base_minor,
  si.cost_fx_rate_applied,
  coalesce(committed.committed_monthly_minor, 0) as committed_monthly_minor,
  mc.monthly_capacity_minor - coalesce(committed.committed_monthly_minor, 0)
    as spare_capacity_minor,
  app.months_to_afford(
    si.cost_base_minor,
    greatest(mc.monthly_capacity_minor - coalesce(committed.committed_monthly_minor, 0), 0)
  ) as realistic_months_to_afford,
  coalesce(committed.goal_titles, array[]::text[]) as competing_goal_titles
from someday_items si
join v_monthly_capacity mc on mc.user_id = si.user_id
left join lateral (
  select
    sum(round(gp.monthly_allocation_minor * app.fx_rate(gp.pledged_currency, mc.base_currency)))::bigint
      as committed_monthly_minor,
    array_agg(distinct g.title order by g.title) as goal_titles
  from goal_participants gp
  join goals g on g.id = gp.goal_id
  where gp.user_id = si.user_id
    and gp.removed_at is null
    and gp.monthly_allocation_minor is not null
    and gp.monthly_allocation_minor > 0
    and g.deleted_at is null
    and g.state = 'active'
) committed on true
where si.deleted_at is null
  and si.achieved_at is null
  and si.archived_at is null
  and si.cost_base_minor is not null;

-- ---------------------------------------------------------------------
-- Promotion to goal. "A dream with a price and enough intent becomes a
-- goal: copy title, notes, image reference, and cost into a new goal,
-- set the dream's promoted_at, and keep the link both ways" (brief).
--
-- Deliberately a *second*, independent pair of columns from the
-- existing promoted_at/trip-stop path (0011-era, wired by
-- app.promote_someday_to_stop): "place-kind dreams keep the existing
-- promote_someday_to_stop path into a trip. Both promotions can apply;
-- do not make them exclusive" (brief, verbatim) -- reusing promoted_at
-- for goal-promotion too would make it impossible to tell "promoted to
-- a trip stop" from "promoted to a goal" from "both," so this is
-- promoted_goal_id/goal_promoted_at instead, untouched by (and never
-- touching) promoted_at itself.
--
-- "Image reference," not "image copy": the new goal gets no
-- image_source/storage_path columns of its own -- goals has never had
-- an image concept, and duplicating P8.1's whole upload/Unsplash
-- machinery onto a second table is exactly the kind of fork CLAUDE.md's
-- own P8 framing warns against ("building a parallel dreams table would
-- fork all of that"). goals.promoted_from_dream_id *is* the image
-- reference: a goal created this way can always resolve back to the
-- dream's own photo through it.
-- ---------------------------------------------------------------------
alter table someday_items
  add column promoted_goal_id uuid references goals(id) on delete set null,
  add column goal_promoted_at timestamptz,
  add constraint dream_goal_promotion_paired
    check ((promoted_goal_id is null) = (goal_promoted_at is null));

alter table goals
  add column promoted_from_dream_id uuid references someday_items(id) on delete set null;

create function app.promote_dream_to_goal(p_dream_id uuid) returns uuid
    language plpgsql security definer
    set search_path to 'public', 'app'
    as $$
declare
  v_user    uuid := auth.uid();
  d         record;
  v_goal_id uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select * into d from someday_items
   where id = p_dream_id and user_id = v_user and deleted_at is null;

  if not found then
    raise exception 'Dream not found' using errcode = 'no_data_found';
  end if;

  -- Guards a plain insert's own table constraints can't express
  -- (cross-row, or about *this dream's* prior state rather than the new
  -- goal row's own shape) -- funded_goals_need_target/goals_title_check/
  -- etc. below are trusted to do their own job on the insert itself,
  -- same "don't duplicate what the constraint already checks" reasoning
  -- app.create_trip_goal's own comment gives.
  if d.rough_cost_minor is null or d.currency is null then
    raise exception 'A dream needs a price before it can become a goal'
      using errcode = 'check_violation';
  end if;
  if d.promoted_goal_id is not null then
    raise exception 'This dream has already been promoted to a goal'
      using errcode = 'check_violation';
  end if;
  if d.achieved_at is not null then
    raise exception 'This dream has already been achieved'
      using errcode = 'check_violation';
  end if;
  if d.archived_at is not null then
    raise exception 'This dream is archived'
      using errcode = 'check_violation';
  end if;

  insert into goals (
    owner_id, life_area_id, kind, title, description, funding,
    currency, target_amount_minor, start_date, promoted_from_dream_id
  ) values (
    v_user, d.life_area_id, 'standard', d.title, d.notes, 'save_toward',
    d.currency, d.rough_cost_minor, app.today_for_user(v_user), d.id
  )
  returning id into v_goal_id;

  update someday_items
     set promoted_goal_id = v_goal_id,
         goal_promoted_at = now()
   where id = d.id;

  return v_goal_id;
end;
$$;

create function public.promote_dream_to_goal(dream_id uuid) returns uuid
    language sql
    set search_path to 'public', 'app'
    as $$
  select app.promote_dream_to_goal(dream_id);
$$;

do $$
begin
  assert (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'someday_items'
      and column_name in (
        'cost_base_currency', 'cost_base_minor', 'cost_fx_rate_applied',
        'promoted_goal_id', 'goal_promoted_at'
      )
  ) = 5, 'expected all five new someday_items columns to exist';

  assert (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'goals'
      and column_name = 'promoted_from_dream_id'
  ) = 1, 'expected goals.promoted_from_dream_id to exist';

  assert (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'v_dream_affordability'
      and column_name in (
        'cost_base_minor', 'committed_monthly_minor', 'spare_capacity_minor',
        'realistic_months_to_afford', 'competing_goal_titles'
      )
  ) = 5, 'expected v_dream_affordability to expose the new capacity columns';
end $$;
