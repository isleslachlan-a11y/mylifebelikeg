-- P7.0: avatar library. Replaces every avatar_presets.asset_ref placeholder
-- with a real option value from the installed avatar library, per the
-- brief's own instruction to verify against "the library's own
-- documentation for the exact version you install" rather than memory.
--
-- Collection chosen: Avataaars (@dicebear/avataaars@9.4.3, pinned to match
-- @dicebear/core@9.4.3 — @dicebear/collection never published a 9.x-
-- compatible release past core's own 9.x line, and core's latest is
-- already on a 10.x major with no matching collection release, so this
-- is the newest mutually-compatible pair, not an arbitrary older pick).
-- Open Peeps was evaluated first, per the brief's own steer toward it for
-- "poses" — but the *installed* package's real `Options` type
-- (node_modules/@dicebear/open-peeps/lib/types.d.ts) has no body/posture
-- option at all in this version: only head, face, facialHair, mask,
-- accessories, plus three colour arrays. It's a bust portrait, same as
-- Avataaars, not the fuller-figure library the brief describes — that
-- description doesn't hold for 9.4.3. Avataaars was picked instead
-- because it has something Open Peeps genuinely doesn't: a `clothing`
-- option with 9 distinct real garment *shapes* (not just a colour), which
-- maps cleanly onto 9 outfit presets one-for-one. "Poses" become
-- expressions here too, via the `eyes` option (brief's own fallback for
-- exactly this case) — verified for real against
-- node_modules/@dicebear/avataaars/lib/types.d.ts, not assumed.
--
-- asset_ref stores the single real option value driving each slot's
-- *shape* (skin tone, clothing cut, expression) — bare 6-digit hex with
-- no leading '#' for skinColor, matching
-- node_modules/@dicebear/avataaars/lib/schema.js's own colour pattern
-- (`^(transparent|[a-fA-F0-9]{6})$`). Palette recolouring (clothing
-- colour, hair colour, custom-layer fills) is a separate rendering
-- concern owned by src/lib/avatar/presets.ts, not stored here — same
-- "small enum colocated in code, not fetched" convention taskFill/
-- bookingStateFillClass already follow, and consistent with this
-- migration only touching the *shape*-defining value per the brief's
-- "asset_ref from its placeholder_* value to the real option string."
--
-- backdrop and accessory have no native Avataaars concept (confirmed:
-- Avataaars only has a flat backgroundColor, no shaped backdrop; its
-- `accessories` option is eyewear-only — glasses/sunglasses/eyepatch —
-- nothing resembling a compass or telescope). Both get the brief's
-- explicit fallback ("render backdrops yourself as an SVG layer behind
-- the avatar"), extended the same way to the accessory slot: asset_ref
-- names a custom-rendered treatment (src/lib/avatar/render.ts), not a
-- DiceBear option. Every value below renders something visibly distinct
-- — nothing here is deleted, since every slot found a real mapping.
--
-- code values are left untouched throughout, per the brief: profiles.avatar
-- and the unlock wiring (validate_avatar, presets_unlocked_by) reference
-- code, never asset_ref.

-- ---- base: skin tone (skinColor), 4 free starter presets ------------------
update avatar_presets set asset_ref = '614335' where code = 'base_1'; -- deep
update avatar_presets set asset_ref = 'ae5d29' where code = 'base_2'; -- brown-medium
update avatar_presets set asset_ref = 'd08b5b' where code = 'base_3'; -- tan
update avatar_presets set asset_ref = 'edb98a' where code = 'base_4'; -- light

-- ---- outfit: clothing shape, 9 presets, one Avataaars garment each --------
update avatar_presets set asset_ref = 'shirtCrewNeck'   where code = 'outfit_tee';
update avatar_presets set asset_ref = 'hoodie'           where code = 'outfit_hoodie';
update avatar_presets set asset_ref = 'shirtVNeck'       where code = 'outfit_shirt';
update avatar_presets set asset_ref = 'collarAndSweater' where code = 'outfit_knit';
update avatar_presets set asset_ref = 'overall'          where code = 'outfit_explorer';  -- unlocked by first_departure
update avatar_presets set asset_ref = 'shirtScoopNeck'   where code = 'outfit_traveller'; -- unlocked by well_travelled
update avatar_presets set asset_ref = 'blazerAndShirt'   where code = 'outfit_formal';    -- unlocked by on_the_money
update avatar_presets set asset_ref = 'graphicShirt'     where code = 'outfit_stargazer'; -- unlocked by constellation
update avatar_presets set asset_ref = 'blazerAndSweater' where code = 'outfit_veteran';   -- unlocked by long_haul

-- ---- pose: expression via the `eyes` option, 5 presets --------------------
update avatar_presets set asset_ref = 'default' where code = 'pose_standing';
update avatar_presets set asset_ref = 'happy'    where code = 'pose_waving';
update avatar_presets set asset_ref = 'hearts'   where code = 'pose_celebrating';   -- unlocked by first_light
update avatar_presets set asset_ref = 'side'     where code = 'pose_thinking';      -- unlocked by honest_reckoning
update avatar_presets set asset_ref = 'squint'   where code = 'pose_triumphant';    -- unlocked by southern_cross

-- ---- backdrop: no native Avataaars concept, custom-rendered, 3 presets ----
update avatar_presets set asset_ref = 'solid'           where code = 'backdrop_plain';
update avatar_presets set asset_ref = 'starfield'       where code = 'backdrop_night';
update avatar_presets set asset_ref = 'gradient-summit' where code = 'backdrop_summit'; -- unlocked by steady_hand

-- ---- accessory: no native match either, custom-rendered badge, 2 presets --
update avatar_presets set asset_ref = 'badge-compass'   where code = 'accessory_compass';   -- unlocked by first_departure
update avatar_presets set asset_ref = 'badge-telescope' where code = 'accessory_telescope'; -- unlocked by constellation

-- ---- verify nothing was missed ---------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from avatar_presets where asset_ref like 'placeholder_%';
  assert n = 0, format('% preset(s) still have a placeholder asset_ref', n);
end $$;
