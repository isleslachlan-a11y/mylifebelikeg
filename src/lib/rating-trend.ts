/**
 * Pure logic for P4.4's rating trend and divergence callout — reads
 * `v_goal_rating_trend`'s raw (user_id, period_start, score) rows
 * (0018) and shapes them for the sparkline and the divergence sentence.
 * No React/DOM here, same convention as `src/lib/timeline/`.
 */

export type RatingPoint = {
  userId: string;
  periodStart: string;
  score: number;
};

export type ParticipantSeries = {
  userId: string;
  name: string;
  /** Sorted ascending by periodStart — oldest first, so a sparkline can draw left-to-right without re-sorting. */
  points: { periodStart: string; score: number }[];
};

const DEFAULT_MAX_PERIODS = 12;

export type RatingTrend = {
  /** Sorted ascending — the shared x-axis every participant's series maps onto, so a renderer can place a gap for a period one participant skipped without needing to re-derive the axis itself. */
  periods: string[];
  /** One entry per participant who has rated at all — a participant with zero ratings in the window simply doesn't get a series, rather than an empty one nobody would render meaningfully. */
  series: ParticipantSeries[];
};

/**
 * "Last 12 periods" (P4.4 brief) means the 12 most recent *calendar*
 * periods any participant rated in, not each participant's own most
 * recent 12 — so two participants missing different weeks still align
 * on the same shared x-axis (`periods`) rather than each compressing
 * their own gaps away.
 */
export function buildRatingTrend(
  points: RatingPoint[],
  names: Record<string, string>,
  maxPeriods: number = DEFAULT_MAX_PERIODS,
): RatingTrend {
  const distinctPeriods = [...new Set(points.map((p) => p.periodStart))].sort();
  const periods = distinctPeriods.slice(-maxPeriods);
  const recentPeriods = new Set(periods);

  const byUser = new Map<string, { periodStart: string; score: number }[]>();
  for (const p of points) {
    if (!recentPeriods.has(p.periodStart)) continue;
    const series = byUser.get(p.userId) ?? [];
    series.push({ periodStart: p.periodStart, score: p.score });
    byUser.set(p.userId, series);
  }

  const series = [...byUser.entries()].map(([userId, pts]) => ({
    userId,
    name: names[userId] ?? "Someone",
    points: pts.sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
  }));

  return { periods, series };
}

export type DivergenceEntry = {
  name: string;
  score: number;
  isYou: boolean;
};

/**
 * "You rated this 5, Sophia rated it 2." — states the two facts and
 * stops (P4.4 brief: "a prompt to talk, never as a problem to resolve
 * ... present, not deliver a verdict"). Generalises past two raters
 * (a goal can have more participants than that) by joining every
 * entry the same way, in whatever order they're given — sorting or
 * highlighting who's "worse" would itself be the editorialising this
 * is explicitly meant to avoid.
 */
export function describeDivergence(entries: DivergenceEntry[]): string {
  const phrases = entries.map((e) =>
    e.isYou ? `You rated this ${e.score}` : `${e.name} rated it ${e.score}`,
  );
  return `${phrases.join(", ")}.`;
}
