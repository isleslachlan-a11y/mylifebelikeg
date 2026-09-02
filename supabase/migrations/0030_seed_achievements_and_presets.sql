-- P7.5: the original twenty-one `avatar_presets` rows were never
-- actually captured by any committed migration — 0026 created the
-- table and assumed the seed data already existed (Schema.MD's usual
-- "written ahead of the code" pattern, but for data this time, not
-- schema); 0029 only ever INSERTs the two presets it introduces. The
-- nine original achievements had the identical gap, fixed directly in
-- 0029 itself (its `insert ... on conflict do update` upsert, see that
-- migration's own comment) rather than here, since that's also where
-- the *rename* half of the fix already had to live.
--
-- Found the hard way: running `supabase/local/*` against a genuinely
-- fresh database (P7.5's own "run all suites against a fresh database"
-- brief) left `avatar_presets` completely empty after 0026 ran.
--
-- Seeded with the *real, current* `asset_ref` values (614335,
-- shirtCrewNeck, etc — 0027's own end state), not the `placeholder_*`
-- ones 0027 replaced, and deliberately so: 0027 is numbered *before*
-- this migration, so on a fresh replay it runs against a still-empty
-- table (its own UPDATEs correctly match zero rows, and its closing
-- assertion — "no placeholder_ values remain" — trivially holds when
-- there are no rows at all to have one) before this migration ever
-- seeds anything. Seeding with placeholders here would leave them
-- stuck forever, since 0027 — the only migration that ever converts
-- placeholder_ to real values — has already run by this point and
-- won't run again. Seeding with the real values directly is what
-- actually leaves a fresh database in the same end state as the real
-- project, where this insert is a pure no-op (`on conflict do nothing`,
-- every row already exists with these exact values).
insert into avatar_presets (code, category, name, asset_ref, unlock_achievement_id, sort_order, is_active)
values
  ('base_1', 'base', 'Base 1', '614335', null, 1, true),
  ('base_2', 'base', 'Base 2', 'ae5d29', null, 2, true),
  ('base_3', 'base', 'Base 3', 'd08b5b', null, 3, true),
  ('base_4', 'base', 'Base 4', 'edb98a', null, 4, true),
  ('outfit_tee', 'outfit', 'Plain tee', 'shirtCrewNeck', null, 1, true),
  ('outfit_hoodie', 'outfit', 'Hoodie', 'hoodie', null, 2, true),
  ('outfit_shirt', 'outfit', 'Button shirt', 'shirtVNeck', null, 3, true),
  ('outfit_knit', 'outfit', 'Knit jumper', 'collarAndSweater', null, 4, true),
  ('pose_standing', 'pose', 'Standing', 'default', null, 1, true),
  ('pose_waving', 'pose', 'Waving', 'happy', null, 2, true),
  ('backdrop_night', 'backdrop', 'Night sky', 'starfield', null, 1, true),
  ('backdrop_plain', 'backdrop', 'Plain', 'solid', null, 2, true)
on conflict (code) do nothing;

-- The locked/unlockable presets, in a second statement: unlock_achievement_id
-- is resolved by code against achievements — which 0029's own upsert
-- guarantees exist by the time this runs, whether this is a fresh
-- database or the already-migrated real one.
insert into avatar_presets (code, category, name, asset_ref, unlock_achievement_id, sort_order, is_active)
select v.code, v.category, v.name, v.asset_ref, ac.id, v.sort_order, true
from (values
  ('accessory_compass', 'accessory', 'Compass', 'badge-compass', 'first_departure', 10),
  ('accessory_telescope', 'accessory', 'Telescope', 'badge-telescope', 'constellation', 11),
  ('backdrop_summit', 'backdrop', 'Summit', 'gradient-summit', 'steady_hand', 10),
  ('outfit_explorer', 'outfit', 'Explorer jacket', 'overall', 'first_departure', 10),
  ('outfit_traveller', 'outfit', 'Traveller coat', 'shirtScoopNeck', 'well_travelled', 11),
  ('outfit_formal', 'outfit', 'Something smart', 'blazerAndShirt', 'on_the_money', 12),
  ('outfit_stargazer', 'outfit', 'Stargazer cloak', 'graphicShirt', 'constellation', 13),
  ('outfit_veteran', 'outfit', 'Well-worn kit', 'blazerAndSweater', 'long_haul', 14),
  ('pose_celebrating', 'pose', 'Celebrating', 'hearts', 'first_light', 10),
  ('pose_thinking', 'pose', 'Thinking', 'side', 'honest_reckoning', 11),
  ('pose_triumphant', 'pose', 'Triumphant', 'squint', 'southern_cross', 12)
) as v(code, category, name, asset_ref, unlock_code, sort_order)
join achievements ac on ac.code = v.unlock_code
on conflict (code) do nothing;

do $$
declare n int;
begin
  select count(*) into n from avatar_presets where code in (
    'base_1','base_2','base_3','base_4','outfit_tee','outfit_hoodie','outfit_shirt',
    'outfit_knit','pose_standing','pose_waving','backdrop_night','backdrop_plain',
    'accessory_compass','accessory_telescope','backdrop_summit','outfit_explorer',
    'outfit_traveller','outfit_formal','outfit_stargazer','outfit_veteran',
    'pose_celebrating','pose_thinking','pose_triumphant'
  );
  assert n = 23, format('expected all 23 original avatar_presets rows to exist, found %s', n);

  select count(*) into n from avatar_presets where asset_ref like 'placeholder_%';
  assert n = 0, format('%s preset(s) still have a placeholder asset_ref', n);
end $$;
