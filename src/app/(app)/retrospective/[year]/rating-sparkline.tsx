import type { MonthlyAverage } from "@/lib/retrospective/summary";

const WIDTH = 240;
const HEIGHT = 48;
const PADDING = 4;
const SCORE_MIN = 1;
const SCORE_MAX = 5;

/**
 * "Average rating by month as a sparkline" (brief, verbatim) — a plain
 * SVG polyline through whichever months actually have ratings,
 * server-rendered like every other visualization this app builds
 * (`goal-timeline.tsx`, `constellation-figure.tsx`) rather than a
 * charting library. Months with no ratings (`average: null` —
 * `averageRatingByMonth`'s own doc explains why that's null, not zero)
 * simply have no point and no line segment reaching them — a gap in the
 * sparkline, not a dip to the bottom of the scale.
 */
export function RatingSparkline({ months }: { months: MonthlyAverage[] }) {
  const rated = months.filter((m) => m.average != null);
  if (rated.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No ratings yet this year.</p>
    );
  }

  const xFor = (i: number) => PADDING + (i / 11) * (WIDTH - PADDING * 2);
  const yFor = (score: number) =>
    HEIGHT -
    PADDING -
    ((score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * (HEIGHT - PADDING * 2);

  const points = months
    .map((m, i) => (m.average != null ? `${xFor(i)},${yFor(m.average)}` : null))
    .filter((p): p is string => p != null)
    .join(" ");

  return (
    <svg
      role="img"
      aria-label="Average check-in rating by month"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
    >
      <polyline
        points={points}
        fill="none"
        className="stroke-star"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {months.map(
        (m, i) =>
          m.average != null && (
            <circle
              key={m.month}
              cx={xFor(i)}
              cy={yFor(m.average)}
              r={2.2}
              className="fill-star"
            >
              <title>{`${new Date(Date.UTC(2000, m.month - 1, 1)).toLocaleString("en-US", { month: "short" })}: ${m.average.toFixed(1)}`}</title>
            </circle>
          ),
      )}
    </svg>
  );
}
