-- P8.4: fixes a real, pre-existing gap in v_someday_progress, flagged
-- but deliberately left alone in P8.2 (see that package's own summary)
-- since nothing could set achieved_at yet, making it harmless in
-- practice. Now that P8.4 wires up the achieve action for real, it's no
-- longer harmless: `still_dreaming` only ever excluded promoted_at,
-- never achieved_at, so an achieved-but-never-promoted dream (the
-- common case per this package's own brief -- "you just bought the
-- shirt" -- stays counted as "still dreaming" forever, alongside
-- achieved_count correctly counting it as achieved too. The two
-- shouldn't overlap: an achieved dream isn't still being dreamed about.
--
-- CREATE OR REPLACE VIEW only allows changing an existing column's own
-- expression in place, never its name or position (0025/0033's own
-- comments already establish this) -- still_dreaming keeps its exact
-- name and position, only its FILTER predicate changes.
create or replace view v_someday_progress
with (security_invoker = true) as
select
  si.user_id,
  count(*)::integer as total_items,
  count(*) filter (where si.promoted_at is not null)::integer as promoted_count,
  count(*) filter (where si.promoted_at is null and si.achieved_at is null)::integer
    as still_dreaming,
  count(distinct si.country_code) filter (where si.country_code is not null)::integer
    as countries_wanted,
  count(*) filter (where si.achieved_at is not null)::integer as achieved_count,
  count(*) filter (where si.archived_at is not null)::integer as archived_count,
  coalesce(
    sum(round(si.rough_cost_minor::numeric * app.fx_rate(si.currency, p.base_currency)))
      filter (where si.achieved_at is null and si.archived_at is null and si.rough_cost_minor is not null),
    0::numeric
  )::bigint as unachieved_cost_minor_base
from someday_items si
join profiles p on p.id = si.user_id
where si.deleted_at is null
group by si.user_id, p.base_currency;

do $$
begin
  assert (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'v_someday_progress'
  ) = 8, 'expected v_someday_progress to still have exactly 8 columns';
end $$;
