import type { ParticipantSeries } from "@/lib/rating-trend";

/**
 * The dataviz skill's reference categorical palette (`references/palette.md`),
 * first three slots verbatim — the ones that validate CVD-safe against
 * *every* pairing, not just adjacent ones (a sparkline shows every line
 * simultaneously, so every pair can be compared at once, unlike a
 * stacked/ordered chart where only neighbours are ever adjacent). Fixed
 * assignment order, never cycled/generated (a 4th participant folds to
 * the neutral fallback below rather than getting a 4th hue that was
 * never validated as part of this set) — colour identifies "whose line
 * is whose" here, so a participant keeps the same colour across
 * re-renders regardless of rating order. This app has no dark-mode
 * stylesheet yet (`globals.css` has no `prefers-color-scheme`/`.dark`
 * handling), so only the light-surface step of each hue is used.
 */
const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];
const FALLBACK_COLOR = "#8b8b86";

const VALUE_MIN = 1;
const VALUE_MAX = 5;
const WIDTH = 240;
const HEIGHT = 56;
const PADDING_X = 6;
const PADDING_Y = 6;

function yFor(score: number): number {
  const t = (score - VALUE_MIN) / (VALUE_MAX - VALUE_MIN);
  // Inverted: higher score draws higher (smaller SVG y), never a flipped chart.
  return HEIGHT - PADDING_Y - t * (HEIGHT - 2 * PADDING_Y);
}

function xFor(index: number, count: number): number {
  if (count <= 1) return WIDTH / 2;
  return PADDING_X + (index / (count - 1)) * (WIDTH - 2 * PADDING_X);
}

export type SparklineProps = {
  /** Shared x-axis, oldest first — from `buildRatingTrend`. */
  periods: string[];
  series: ParticipantSeries[];
};

/**
 * One line per participant, never an average (P4.4 brief: "divergence
 * is the point") — a period a participant didn't rate breaks their line
 * rather than interpolating across the gap, since a smooth line through
 * missing data would fabricate a rating that was never given. Colour
 * alone never carries identity: the legend beneath pairs every colour
 * with the participant's name (dataviz skill: "never colour alone"),
 * and each point's native `<title>` gives the exact score and period on
 * hover/focus — a lighter-weight interaction layer than a full
 * crosshair tooltip, proportionate to an inline sparkline rather than a
 * dedicated chart view.
 */
export function Sparkline({ periods, series }: SparklineProps) {
  if (periods.length === 0 || series.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Not enough rating history yet — after a few check-ins, each
        participant&apos;s trend shows up here.
      </p>
    );
  }

  const indexByPeriod = new Map(periods.map((p, i) => [p, i]));

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-14 w-full max-w-60"
        role="img"
        aria-label="Rating trend, one line per participant"
      >
        {series.map((s, seriesIndex) => {
          const color = SERIES_COLORS[seriesIndex] ?? FALLBACK_COLOR;
          const points = s.points
            .map((p) => ({
              index: indexByPeriod.get(p.periodStart),
              score: p.score,
              periodStart: p.periodStart,
            }))
            .filter(
              (p): p is { index: number; score: number; periodStart: string } =>
                p.index != null,
            );

          // Consecutive-only segments — a gap in period index breaks the
          // line rather than bridging it, so a skipped week reads as
          // "no data", not as a smooth transition that never happened.
          const segments: { index: number; score: number }[][] = [];
          for (const p of points) {
            const last = segments.at(-1);
            const prevPoint = last?.at(-1);
            if (last && prevPoint && p.index === prevPoint.index + 1) {
              last.push(p);
            } else {
              segments.push([p]);
            }
          }

          return (
            <g key={s.userId}>
              {segments.map((segment, i) => (
                <polyline
                  key={i}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  points={segment
                    .map(
                      (p) =>
                        `${xFor(p.index, periods.length)},${yFor(p.score)}`,
                    )
                    .join(" ")}
                />
              ))}
              {points.map((p) => (
                <circle
                  key={p.periodStart}
                  cx={xFor(p.index, periods.length)}
                  cy={yFor(p.score)}
                  r={2.5}
                  fill={color}
                >
                  <title>
                    {s.name}: {p.score} ({p.periodStart})
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {series.map((s, i) => (
          <li key={s.userId} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{
                backgroundColor: SERIES_COLORS[i] ?? FALLBACK_COLOR,
              }}
              aria-hidden
            />
            <span className="text-muted-foreground">{s.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
