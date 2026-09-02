import type { Options as AvataaarsOptions } from "@dicebear/avataaars";

import type { AvatarSelection, AvatarSlot } from "./types";

/** Element types pulled straight from the installed 9.4.3's own `Options`
 * interface — not retyped by hand — so a preset value that isn't
 * actually one Avataaars supports is a compile error here, not a
 * silently-broken render discovered later. */
type ClothingOption = NonNullable<AvataaarsOptions["clothing"]>[number];
type EyesOption = NonNullable<AvataaarsOptions["eyes"]>[number];
type MouthOption = NonNullable<AvataaarsOptions["mouth"]>[number];
type ClothingGraphicOption = NonNullable<
  AvataaarsOptions["clothingGraphic"]
>[number];

/**
 * The compiled render recipe for every avatar preset — one entry per
 * `avatar_presets.code`, mirroring migration 0027's `asset_ref` values
 * 1:1. Kept as a colocated, hand-synced constant rather than fetched
 * from `avatar_presets` at render time, same "small enum colocated in
 * code, independently re-declared" convention `taskFill`/`milestoneFill`/
 * `bookingStateFillClass` already follow elsewhere in this app — avatars
 * render in lists and need to be fast and synchronous, not wait on a
 * round trip for data that only changes when a migration does.
 *
 * `asset_ref` (from the database) is the source of truth for *which*
 * option a preset maps to; this file is that same mapping compiled into
 * TypeScript, plus the palette recolouring the database migration
 * deliberately doesn't own (see 0027's header comment). If a future
 * migration changes an `asset_ref`, this file needs the matching edit —
 * there's no automated check tying the two together, the same trust
 * `taskFill` already runs on for its own DB-adjacent enum.
 */

/** Six-digit hex, no leading '#' — the exact format Avataaars' own colour
 * options require (`^(transparent|[a-fA-F0-9]{6})$`, verified against
 * node_modules/@dicebear/avataaars/lib/schema.js for the installed
 * 9.4.3). Drawn from globals.css's night-sky palette so recoloured
 * pieces (clothing, custom backdrop/accessory layers) read as part of
 * this app rather than DiceBear's own defaults — skin tones are the one
 * deliberate exception, kept naturalistic rather than tinted purple.
 */
const PALETTE = {
  deep: "0a0918",
  surface: "14122e",
  raised: "1e1b3d",
  border: "2a2650",
  primary: "8b7bd8",
  primarySoft: "b9a9f5",
  star: "f5d89e",
  textPrimary: "edebfa",
  textMuted: "9b96c7",
  ragGreen: "4fb8a5",
  ragAmber: "d9a05b",
  llamaDerek: "b08655",
  llamaFluffy: "f3efe6",
} as const;

/** A resolved base preset: skin tone plus a matching, naturalistic hair
 * colour (kept out of the app-palette recolour, same reasoning as skin
 * tone itself — see PALETTE's own comment). */
export type BasePreset = { skinColor: string; hairColor: string };

export const BASE_PRESETS: Record<string, BasePreset> = {
  base_1: { skinColor: "614335", hairColor: "0c0a0a" }, // deep
  base_2: { skinColor: "ae5d29", hairColor: "2c1b0e" }, // brown-medium
  base_3: { skinColor: "d08b5b", hairColor: "4a3222" }, // tan
  base_4: { skinColor: "edb98a", hairColor: "a55728" }, // light
};

/** A resolved outfit preset: Avataaars' `clothing` shape plus a
 * `clothesColor` drawn from the app palette. Deliberately never one of
 * the palette's own near-background darks (`deep`/`raised`/`border`) —
 * a first render against the default `backdrop_plain` surface showed
 * exactly what you'd expect from clothing that close to the backdrop's
 * own colour: `outfit_formal` in particular was all but invisible.
 * Those three tones stay reserved for backdrops/badges, where they're
 * the point; every outfit here gets something the surface can't
 * swallow. */
export type OutfitPreset = {
  clothing: ClothingOption;
  clothesColor: string;
  /** Only meaningful when `clothing` is `'graphicShirt'` — Avataaars
   * otherwise picks a random one (bat/bear/skull/etc, none of them
   * fitting), confirmed the hard way: the first render of
   * `outfit_stargazer` came back wearing a bat logo. `'diamond'` is the
   * closest real option to a star. */
  clothingGraphic?: ClothingGraphicOption;
};

export const OUTFIT_PRESETS: Record<string, OutfitPreset> = {
  outfit_tee: { clothing: "shirtCrewNeck", clothesColor: PALETTE.textMuted },
  outfit_hoodie: { clothing: "hoodie", clothesColor: PALETTE.primary },
  outfit_shirt: { clothing: "shirtVNeck", clothesColor: PALETTE.llamaFluffy },
  outfit_knit: { clothing: "collarAndSweater", clothesColor: PALETTE.ragAmber },
  outfit_explorer: { clothing: "overall", clothesColor: PALETTE.llamaDerek },
  outfit_traveller: {
    clothing: "shirtScoopNeck",
    clothesColor: PALETTE.ragGreen,
  },
  outfit_formal: {
    clothing: "blazerAndShirt",
    clothesColor: PALETTE.textPrimary,
  },
  outfit_stargazer: {
    clothing: "graphicShirt",
    clothesColor: PALETTE.primarySoft,
    clothingGraphic: "diamond",
  },
  outfit_veteran: {
    clothing: "blazerAndSweater",
    clothesColor: PALETTE.star,
  },
};

/** A resolved pose preset: Avataaars' `eyes` value drives the expression
 * (the brief's own fallback for a collection with no body posture —
 * confirmed true of Avataaars in this installed version, see 0027's
 * header); `mouth` stays fixed at 'default' throughout so eyes alone
 * carry the "pose" reading without the two fighting each other. */
export type PosePreset = { eyes: EyesOption; mouth: MouthOption };

export const POSE_PRESETS: Record<string, PosePreset> = {
  pose_standing: { eyes: "default", mouth: "default" },
  pose_waving: { eyes: "happy", mouth: "default" },
  pose_celebrating: { eyes: "hearts", mouth: "default" },
  pose_thinking: { eyes: "side", mouth: "default" },
  pose_triumphant: { eyes: "squint", mouth: "default" },
  // P7.4: full_orbit's unlock — a full year of showing up, so a calm,
  // settled expression rather than an excited one. 'closed' wasn't used
  // by any of the original five poses.
  pose_serene: { eyes: "closed", mouth: "default" },
};

/** Backdrop has no native Avataaars concept (confirmed: only a flat
 * `backgroundColor`, no shaped backdrop) — every value here names a
 * treatment `render.ts` draws by hand, per the brief's explicit
 * fallback. */
export type BackdropKind = "solid" | "starfield" | "gradient-summit";

export const BACKDROP_PRESETS: Record<string, BackdropKind> = {
  backdrop_plain: "solid",
  backdrop_night: "starfield",
  backdrop_summit: "gradient-summit",
};

/** Accessory has no native match either — Avataaars' own `accessories`
 * option is eyewear only (glasses/sunglasses/eyepatch), nothing
 * resembling a travel badge — so these are hand-drawn corner badges too,
 * same fallback extended one slot further. */
export type AccessoryKind = "compass" | "telescope" | "twin_stars";

export const ACCESSORY_PRESETS: Record<string, AccessoryKind> = {
  accessory_compass: "compass",
  accessory_telescope: "telescope",
  // P7.4: twin_stars' unlock — two people sharing a goal, so a literal
  // pair of stars. Same no-native-match fallback as the other two.
  accessory_twin_stars: "twin_stars",
};

/** What every slot falls back to when a profile's `avatar` doesn't set
 * it — free, always-unlocked presets only (accessory has no default:
 * going without one is a valid, unlocked "look"). */
export const DEFAULT_AVATAR: AvatarSelection = {
  base: "base_1",
  outfit: "outfit_tee",
  pose: "pose_standing",
  backdrop: "backdrop_plain",
};

export { PALETTE };

/** Every known preset code for a slot — used by the styleguide page to
 * render the full catalogue, and a cheap existence check for
 * `render.ts`'s per-slot fallback. */
export const PRESET_CODES_BY_SLOT: Record<AvatarSlot, string[]> = {
  base: Object.keys(BASE_PRESETS),
  outfit: Object.keys(OUTFIT_PRESETS),
  pose: Object.keys(POSE_PRESETS),
  backdrop: Object.keys(BACKDROP_PRESETS),
  accessory: Object.keys(ACCESSORY_PRESETS),
};
