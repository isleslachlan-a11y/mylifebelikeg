import {
  hashToUnit,
  layoutConstellation,
  type ConstellationPoint,
} from "@/lib/constellations/layout";

export type { ConstellationPoint };

export type ConstellationFigureProps = {
  points: ConstellationPoint[];
  /**
   * The goal's life-area colour (a hex string, straight from
   * `life_areas.colour`) — the constellation's own hue, per the brief.
   * `null` for an abandoned goal: unlit means no colour, not a dimmed
   * version of one, so a `lit={false}` figure ignores this entirely and
   * renders in a fixed muted grey instead (see `UNLIT_COLOUR` below).
   */
  colour: string | null;
  /** Completed goals are lit (coloured, twinkling); abandoned ones are unlit outlines (brief, verbatim) — static, no glow, no twinkle. */
  lit: boolean;
  /** Rendered `width`/`height` in px — square viewBox, so this is the figure's full size. */
  size: number;
  /** Accessible label for the whole figure — the goal's title, read by a screen reader in place of the decorative SVG shapes. */
  title: string;
};

// Fixed, not derived from `--text-muted` at render time (this is a
// server component; there's no CSS custom property resolution available
// here) — chosen to sit visibly below the muted-foreground text colour
// used for the caption around it, so an unlit constellation still reads
// as *part of* the sky rather than invisible against it.
const UNLIT_COLOUR = "#4a4570";

const BRIGHT_RADIUS = 2.4;
const NORMAL_RADIUS = 1.5;

/**
 * P5.3's pure rendering piece: one constellation, drawn as an SVG in a
 * fixed `0 0 100 100` viewBox (matching `layoutConstellation`'s own
 * coordinate space) at whatever pixel `size` the caller wants — the
 * gallery grid (`constellation-tile.tsx`) uses this small, the detail
 * page (`/constellations/[id]`) uses it large, same component either
 * way. No `Link`, no caption, no depth/recede styling — those are the
 * caller's job (gallery tiles wrap this in a link and a depth
 * transform; the detail page just renders it bare).
 *
 * Twinkle is plain CSS (`.constellation-star`, defined in
 * `globals.css`, `prefers-reduced-motion`-gated there) with a
 * per-star `animationDelay`/`animationDuration` derived from the same
 * id hash `layoutConstellation` already uses for `cy` — deterministic,
 * so this stays a server component with no client JS: the variety comes
 * from seeding, not from anything computed at render time. Unlit
 * (`lit={false}`) figures skip the class entirely — an abandoned goal
 * never twinkles, only completed ones do.
 */
export function ConstellationFigure({
  points,
  colour,
  lit,
  size,
  title,
}: ConstellationFigureProps) {
  const { points: positioned, pathOrder } = layoutConstellation(points);
  const strokeColour = lit ? (colour ?? UNLIT_COLOUR) : UNLIT_COLOUR;
  const byId = new Map(positioned.map((p) => [p.id, p]));
  const polylinePoints = pathOrder
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map((p) => `${p.cx},${p.cy}`)
    .join(" ");

  return (
    <svg
      role="img"
      aria-label={title}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className="overflow-visible"
    >
      {polylinePoints && (
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={strokeColour}
          strokeWidth={0.4}
          strokeOpacity={lit ? 0.55 : 0.35}
          strokeLinejoin="round"
        />
      )}
      {positioned.map((point, i) => {
        const radius =
          point.brightness === "bright" ? BRIGHT_RADIUS : NORMAL_RADIUS;
        // The same well-mixed hash `layoutConstellation` uses for `cy`
        // (`hashToUnit`, `layout.ts`) — salted with a fixed suffix so
        // this "which second am I offset by" seed doesn't come out
        // identical to cy's "where am I vertically" seed for the same
        // point, even though both ultimately trace back to one id.
        const seed = hashToUnit(`${point.id}:twinkle`);
        return (
          <circle
            key={point.id}
            cx={point.cx}
            cy={point.cy}
            r={radius}
            fill={strokeColour}
            fillOpacity={lit ? (point.brightness === "bright" ? 1 : 0.85) : 0.5}
            className={lit ? "constellation-star" : undefined}
            style={
              lit
                ? {
                    animationDelay: `${(seed * 4).toFixed(2)}s`,
                    animationDuration: `${(2.5 + seed * 2).toFixed(2)}s`,
                  }
                : undefined
            }
          >
            {/* A single template-string child, not adjacent text/expression
                children — SVG's <title> (unlike most elements) requires
                exactly one string child; React warns and drops the extra
                nodes otherwise (caught by actually rendering this via
                renderToStaticMarkup, not by tsc/lint, which don't model
                SVG's own children constraints). */}
            <title>{`${point.title}${
              i === 0
                ? " (first)"
                : i === positioned.length - 1
                  ? " (last)"
                  : ""
            }`}</title>
          </circle>
        );
      })}
    </svg>
  );
}
