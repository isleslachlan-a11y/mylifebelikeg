/**
 * The eight selectable life-area colours. Not invented here — drawn from
 * what `app.seed_life_areas()` (the database trigger that seeds a new
 * profile's default areas) already uses: the six seeded category colours,
 * the seeded "Uncategorised" system colour, and `life_areas.colour`'s own
 * column default. Together that's exactly eight, so nothing was added.
 *
 * `life_areas.colour` is unconstrained `text` at the database level — the
 * eight-colour restriction is an application-level rule, enforced in
 * `actions.ts`, not a check constraint.
 */
export const LIFE_AREA_COLOURS = [
  { hex: "#8B7BD8", label: "Purple" }, // the column default
  { hex: "#7C6BC4", label: "Violet" },
  { hex: "#5B8DD9", label: "Blue" },
  { hex: "#4FB8A5", label: "Teal" },
  { hex: "#D9A05B", label: "Amber" },
  { hex: "#C97BA8", label: "Pink" },
  { hex: "#B85C8A", label: "Wine" },
  { hex: "#6B7280", label: "Grey" }, // the seeded Uncategorised colour
] as const;

export const DEFAULT_LIFE_AREA_COLOUR = LIFE_AREA_COLOURS[0].hex;

export function isLifeAreaColour(value: string): boolean {
  return LIFE_AREA_COLOURS.some((c) => c.hex === value);
}

export function lifeAreaColourLabel(hex: string): string {
  return LIFE_AREA_COLOURS.find((c) => c.hex === hex)?.label ?? hex;
}
