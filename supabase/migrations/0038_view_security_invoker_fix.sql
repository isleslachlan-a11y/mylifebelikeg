-- P9.0: found while building the isolation suite's own structural check
-- ("security_invoker = true is asserted per view as a schema check, not
-- inferred from behaviour, because a view can appear to behave
-- correctly while the flag is missing" -- brief, verbatim, and this
-- view is exactly that: it happens to still compute the right answer
-- for every caller today, for reasons specific to how it's written, not
-- because the flag doesn't matter).
--
-- `v_available_presets` (0026) is the one view in the whole schema
-- missing `security_invoker = true` -- confirmed live, not a
-- reconstruction artifact of this phase's own baseline work. Every
-- other view in this project sets it; this one was missed.
--
-- It has not actually been leaking, and the reason is narrow enough to
-- be worth writing down rather than trusting by eye a second time: its
-- own `is_unlocked` column already does its own explicit
-- `ua.user_id = auth.uid()` comparison inside an EXISTS subquery against
-- `user_achievements`, rather than depending on that table's RLS policy
-- to pre-filter rows to the caller. `auth.uid()` reads the session's JWT
-- claim regardless of which privileges the query executes under, so the
-- subquery only ever matches the *calling* user's own achievement rows
-- whether or not RLS is actually being enforced underneath it. The
-- other two tables it reads (`avatar_presets`, `achievements`) are
-- global catalogs, readable by any signed-in user via their own RLS
-- regardless -- there's no per-user row to leak there either.
--
-- That's an accident of how this particular view happens to be
-- written, not a property of the flag being unnecessary -- the next
-- column added to this view that leans on RLS instead of its own
-- explicit filter (the normal, correct way to write a view under
-- security_invoker) would leak silently. Fixed the same way as every
-- other view in this schema, via CREATE OR REPLACE (adding the option
-- doesn't require dropping the view -- unlike a column, an option
-- change is not restricted to append-only).
create or replace view public.v_available_presets
with (security_invoker = true) as
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
  (
    ap.unlock_achievement_id is null
    or exists (
      select 1 from user_achievements ua
      where ua.user_id = auth.uid() and ua.achievement_id = ap.unlock_achievement_id
    )
  ) as is_unlocked
from avatar_presets ap
left join achievements ac on ac.id = ap.unlock_achievement_id
where ap.is_active;

do $$
begin
  assert (
    select (c.reloptions is not null and 'security_invoker=true' = any(c.reloptions))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'v_available_presets'
  ), 'v_available_presets should have security_invoker=true after this migration';
end $$;
