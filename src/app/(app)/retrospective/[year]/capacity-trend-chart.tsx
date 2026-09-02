import type { MonthlyActiveCount } from "@/lib/retrospective/summary";

const WIDTH = 240;
const HEIGHT = 56;
const BAR_GAP = 3;

/**
 * "Capacity trend against goal limit changes" (brief) — the count half
 * of that (see `summary.ts`'s module doc for why the *limit* half can
 * only ever be `currentLimit`, a single value, not a real trend: no
 * changelog exists for `profiles.active_goal_limit`). The dashed line
 * is that one current value, drawn across every month for comparison —
 * not a claim that the limit was the same all year, just the only
 * number there is to compare against. A month whose count exceeds it
 * renders in the RAG red token rather than the primary bar colour, the
 * same "over" signal `/settings/capacity`'s own suggestion card uses.
 */
export function CapacityTrendChart({
  months,
  currentLimit,
}: {
  months: MonthlyActiveCount[];
  currentLimit: number;
}) {
  if (months.length === 0) {
    return null;
  }

  const barWidth = (WIDTH - BAR_GAP * (months.length - 1)) / months.length;
  const maxValue = Math.max(currentLimit, ...months.map((m) => m.count), 1);
  const yFor = (v: number) => HEIGHT - (v / maxValue) * HEIGHT;
  const limitY = yFor(currentLimit);

  return (
    <svg
      role="img"
      aria-label={`Active goal count by month, against a current limit of ${currentLimit}`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
    >
      <line
        x1={0}
        x2={WIDTH}
        y1={limitY}
        y2={limitY}
        className="stroke-rag-amber"
        strokeWidth={1}
        strokeDasharray="3 2"
      />
      {months.map((m, i) => {
        const x = i * (barWidth + BAR_GAP);
        const barY = yFor(m.count);
        const overLimit = m.count > currentLimit;
        return (
          <rect
            key={m.month}
            x={x}
            y={barY}
            width={barWidth}
            height={Math.max(HEIGHT - barY, 0.5)}
            className={overLimit ? "fill-rag-red" : "fill-primary"}
          >
            <title>{`${new Date(Date.UTC(2000, m.month - 1, 1)).toLocaleString("en-US", { month: "short" })}: ${m.count} active`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
