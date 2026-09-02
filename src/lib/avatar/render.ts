import { createAvatar } from "@dicebear/core";
import { avataaars } from "@dicebear/collection";

import {
  ACCESSORY_PRESETS,
  BACKDROP_PRESETS,
  BASE_PRESETS,
  DEFAULT_AVATAR,
  OUTFIT_PRESETS,
  PALETTE,
  POSE_PRESETS,
  type AccessoryKind,
  type BackdropKind,
} from "./presets";
import type { AvatarSelection } from "./types";

/**
 * Fills every slot from `DEFAULT_AVATAR` when missing *or* when the
 * stored code doesn't match a known preset (a stale reference — a
 * preset renamed or removed out from under an old `profiles.avatar`
 * value shouldn't ever crash rendering, just fall back quietly). This
 * is also the only place a raw `selection` value is looked up in a
 * preset dictionary rather than interpolated directly into SVG markup —
 * every string that actually reaches `renderAvatarSvg`'s output below
 * comes from `BASE_PRESETS`/`OUTFIT_PRESETS`/etc, never from the
 * caller's object itself, so an arbitrary `avatar` jsonb value (this
 * function doesn't assume `app.validate_avatar()` ran) can't inject
 * anything into the generated SVG.
 */
function resolveAvatar(selection: AvatarSelection): {
  base: string;
  outfit: string;
  pose: string;
  backdrop: string;
  accessory: string | undefined;
} {
  const base =
    selection.base && BASE_PRESETS[selection.base]
      ? selection.base
      : DEFAULT_AVATAR.base!;
  const outfit =
    selection.outfit && OUTFIT_PRESETS[selection.outfit]
      ? selection.outfit
      : DEFAULT_AVATAR.outfit!;
  const pose =
    selection.pose && POSE_PRESETS[selection.pose]
      ? selection.pose
      : DEFAULT_AVATAR.pose!;
  const backdrop =
    selection.backdrop && BACKDROP_PRESETS[selection.backdrop]
      ? selection.backdrop
      : DEFAULT_AVATAR.backdrop!;
  const accessory =
    selection.accessory && ACCESSORY_PRESETS[selection.accessory]
      ? selection.accessory
      : undefined;
  return { base, outfit, pose, backdrop, accessory };
}

/** Matches DiceBear's own `Result.toString()` output shape (a single
 * root `<svg viewBox="...">...</svg>`, confirmed against the installed
 * 9.4.3's real output, not assumed) so the character can be re-embedded
 * as a sized, positioned nested `<svg>` rather than pasted in at its own
 * native 280x280 scale. Falls back to embedding the untouched string if
 * DiceBear's output shape ever changes — degraded (unsized, unpositioned)
 * rather than broken. */
const SVG_ROOT_RE = /^<svg[^>]*\bviewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>$/;

function renderCharacterSvg(
  base: string,
  outfit: string,
  pose: string,
  seed: string,
): string {
  // Non-null: `base`/`outfit`/`pose` only ever reach this function via
  // `resolveAvatar`, which already validated each against these exact
  // dictionaries (falling back to DEFAULT_AVATAR otherwise) — TypeScript
  // just can't see that guarantee across the function boundary with a
  // plain `Record<string, T>` index signature.
  const b = BASE_PRESETS[base]!;
  const o = OUTFIT_PRESETS[outfit]!;
  const p = POSE_PRESETS[pose]!;
  const result = createAvatar(avataaars, {
    seed,
    style: ["default"],
    base: ["default"],
    skinColor: [b.skinColor],
    hairColor: [b.hairColor],
    // Not one of the app's five slots — fixed to a single neutral style
    // for every avatar so hats/hijabs/bald-scalps don't appear or vanish
    // at random between otherwise-identical avatars; a `hair`/`hat` slot
    // is a plausible future preset category, not this package's job.
    top: ["shortFlat"],
    topProbability: 100,
    clothing: [o.clothing],
    clothesColor: [o.clothesColor],
    // Only `outfit_stargazer` sets this — every other preset omits it,
    // which for any *other* `clothing` value is inert (the option is
    // only ever consulted for 'graphicShirt'). Explicit rather than
    // left to Avataaars' own random pick: an early render of
    // outfit_stargazer came back wearing a bat logo.
    ...(o.clothingGraphic ? { clothingGraphic: [o.clothingGraphic] } : {}),
    eyes: [p.eyes],
    mouth: [p.mouth],
    // Transparent: the backdrop is our own layer underneath, drawn
    // separately (see renderBackdrop) since Avataaars only offers a
    // flat single-colour background, not the shaped treatments below.
    backgroundColor: ["transparent"],
    // Deterministic per-preset-combination, not per-render: facial hair
    // and eyewear aren't one of the five slots either, and a randomly
    // appearing beard would make an otherwise-identical avatar look
    // different across sessions.
    facialHairProbability: 0,
    accessoriesProbability: 0,
  });
  return result.toString();
}

/** The character's own generation (`createAvatar`, then a regex
 * extraction) is the one genuinely expensive step here — everything
 * else in `renderAvatarSvg` below is cheap string concatenation, so
 * only this piece is memoised. Cached by (base, outfit, pose) alone,
 * deliberately excluding backdrop/accessory: the character SVG doesn't
 * depend on either, so two avatars that differ only in backdrop still
 * share one cache entry. Module-scope and unbounded-but-small — at most
 * 4 bases × 9 outfits × 5 poses = 180 entries ever get generated, for
 * the process lifetime, so no eviction logic, same reasoning
 * src/lib/unsplash/server.ts's own module-scope cache already runs on. */
const characterMarkupCache = new Map<string, string>();

function characterCacheKey(base: string, outfit: string, pose: string): string {
  return `${base}|${outfit}|${pose}`;
}

function renderPositionedCharacter(
  base: string,
  outfit: string,
  pose: string,
): string {
  const key = characterCacheKey(base, outfit, pose);
  const cached = characterMarkupCache.get(key);
  if (cached) return cached;

  const character = renderCharacterSvg(base, outfit, pose, key);
  const match = character.match(SVG_ROOT_RE);
  const positioned = match
    ? `<svg x="10" y="6" width="80" height="90" viewBox="${match[1]}">${match[2]}</svg>`
    : character;

  characterMarkupCache.set(key, positioned);
  return positioned;
}

/** Fixed star positions (not random per render) so the same backdrop
 * always looks the same — a `Math.random()`-seeded starfield would read
 * as broken/flickering the moment the same avatar re-renders. */
const STARFIELD_DOTS: ReadonlyArray<readonly [number, number, number, number]> =
  [
    [12, 14, 1.1, 0.9],
    [28, 8, 0.7, 0.6],
    [46, 18, 0.9, 0.8],
    [64, 10, 0.6, 0.5],
    [82, 20, 1.0, 0.7],
    [92, 34, 0.7, 0.6],
    [8, 34, 0.6, 0.5],
    [20, 44, 0.9, 0.7],
  ];

/**
 * `uid` scopes every `id` this draws (gradient defs, the clip path) to
 * one call — never shared with the character-markup cache above, and
 * deliberately not derived from the preset combination: two avatars
 * with the same backdrop rendered side by side in a list (a very real
 * case — many users share the free `backdrop_plain` default) would
 * otherwise emit duplicate `id`s into the same HTML document, and
 * `url(#id)` resolution across duplicate ids is undefined per browser,
 * not merely a lint nitpick. `renderAvatarSvg` supplies this per call —
 * `<Avatar>` itself stays hookless (see its own comment) and just leans
 * on that default.
 */
function renderBackdrop(kind: BackdropKind, uid: string): string {
  switch (kind) {
    case "solid":
      return `<rect width="100" height="100" fill="#${PALETTE.surface}" />`;
    case "starfield": {
      const gradientId = `avatar-bg-night-${uid}`;
      const stars = STARFIELD_DOTS.map(
        ([x, y, r, o]) =>
          `<circle cx="${x}" cy="${y}" r="${r}" fill="#${PALETTE.star}" opacity="${o}" />`,
      ).join("");
      return `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#${PALETTE.deep}" />
          <stop offset="100%" stop-color="#${PALETTE.surface}" />
        </linearGradient></defs>
        <rect width="100" height="100" fill="url(#${gradientId})" />
        ${stars}`;
    }
    case "gradient-summit": {
      const gradientId = `avatar-bg-summit-${uid}`;
      return `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#${PALETTE.primary}" />
          <stop offset="100%" stop-color="#${PALETTE.deep}" />
        </linearGradient></defs>
        <rect width="100" height="100" fill="url(#${gradientId})" />
        <path d="M0,78 L22,52 L38,66 L58,34 L78,60 L100,46 L100,100 L0,100 Z"
          fill="#${PALETTE.raised}" opacity="0.85" />`;
    }
  }
}

/** Small corner badge, drawn by hand since neither preset resembles
 * anything Avataaars' own (eyewear-only) `accessories` option offers. */
/** A small 4-point sparkle, the same shape the night-sky theme already
 * implies elsewhere (the `--star` token itself) — used twice, offset, for
 * the `twin_stars` badge below. */
function sparkle(cx: number, cy: number, r: number): string {
  return `<path d="M${cx} ${cy - r} L${cx + r * 0.35} ${cy - r * 0.35} L${cx + r} ${cy} L${cx + r * 0.35} ${cy + r * 0.35} L${cx} ${cy + r} L${cx - r * 0.35} ${cy + r * 0.35} L${cx - r} ${cy} L${cx - r * 0.35} ${cy - r * 0.35} Z" fill="#${PALETTE.star}" stroke="none" />`;
}

function renderAccessoryBadge(kind: AccessoryKind | undefined): string {
  if (!kind) return "";
  const cx = 82;
  const cy = 82;
  const ring = `<circle cx="${cx}" cy="${cy}" r="14" fill="#${PALETTE.deep}" stroke="#${PALETTE.star}" stroke-width="2" />`;

  let glyph: string;
  switch (kind) {
    case "compass":
      glyph = `<g stroke="#${PALETTE.star}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="${cx}" cy="${cy}" r="8" />
          <path d="M${cx} ${cy - 6} L${cx + 3} ${cy + 2} L${cx} ${cy + 6} L${cx - 3} ${cy - 2} Z" fill="#${PALETTE.star}" stroke="none" />
        </g>`;
      break;
    case "telescope":
      glyph = `<g stroke="#${PALETTE.star}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-30 ${cx} ${cy})">
          <rect x="${cx - 7}" y="${cy - 2}" width="14" height="4" rx="2" />
          <circle cx="${cx - 6}" cy="${cy}" r="2.4" fill="#${PALETTE.star}" stroke="none" />
        </g>`;
      break;
    case "twin_stars":
      // P7.4: two, deliberately — a pair of stars for a goal shared with
      // someone else, different sizes so they read as two distinct
      // points, not one blob.
      glyph = sparkle(cx - 4, cy - 3, 5) + sparkle(cx + 4, cy + 3, 3.5);
      break;
  }
  return ring + glyph;
}

let anonymousUidCounter = 0;

/**
 * Renders a `profiles.avatar` selection to a complete, standalone SVG
 * string at the given pixel size. Pure and synchronous — no network, no
 * DOM — so it's safe to call from a Server Component too, not just
 * `<Avatar>`'s own client-side memoisation.
 *
 * `uid` scopes this render's internal `id`s (gradients, clip path) so
 * multiple avatars on one page never collide — pass a stable, page-unique
 * value if the caller has one (e.g. the profile id). Omitted entirely by
 * `<Avatar>` (deliberately hookless, see its own comment) and by any
 * other caller that doesn't have one handy: falls back to a private,
 * module-scope counter that's unique within one render pass, which is
 * all uniqueness this actually needs.
 */
export function renderAvatarSvg(
  selection: AvatarSelection,
  size: number,
  uid?: string,
): string {
  const resolved = resolveAvatar(selection);
  const instanceId = uid ?? `anon-${++anonymousUidCounter}`;
  const clipId = `avatar-clip-${instanceId}`;

  const character = renderPositionedCharacter(
    resolved.base,
    resolved.outfit,
    resolved.pose,
  );
  const backdrop = renderBackdrop(
    // Non-null: same resolveAvatar guarantee as renderCharacterSvg's own.
    BACKDROP_PRESETS[resolved.backdrop]!,
    instanceId,
  );
  const accessory = renderAccessoryBadge(
    resolved.accessory ? ACCESSORY_PRESETS[resolved.accessory] : undefined,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="Avatar">
    <clipPath id="${clipId}"><rect width="100" height="100" rx="14" /></clipPath>
    <g clip-path="url(#${clipId})">${backdrop}${character}${accessory}</g>
  </svg>`;
}
