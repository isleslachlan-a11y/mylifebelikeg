import { RAG_DOT_CLASS } from "@/components/rag-badge";
import { Sparkline } from "@/components/sparkline";
import { formatDate } from "@/lib/dates";
import { ragInputs, type GoalRag, type RagStatus } from "@/lib/rag";
import type { DivergenceEntry, RatingTrend } from "@/lib/rating-trend";
import { describeDivergence } from "@/lib/rating-trend";
import { cn } from "@/lib/utils";

export type RagHistoryPoint = {
  computedAt: string;
  overallStatus: RagStatus;
};

export type DivergenceCallout = {
  periodStart: string;
  entries: DivergenceEntry[];
};

/**
 * P4.4: "the payoff for storing two scores instead of one." Four
 * pieces, none of them computed here beyond formatting — all four read
 * straight from what P4.1/P4.2/0018 already wrote:
 *
 * - RAG history: `rag_snapshots`, one segment per submitted check-in —
 *   this is the whole reason snapshots exist rather than recomputing
 *   `app.compute_goal_rag` on read (that only ever gives you *today*).
 * - Rating trend: `v_goal_rating_trend` (0018), one sparkline line per
 *   participant — never an average, since divergence is the point.
 * - Divergence: `v_rating_divergence` (0018, fixed from its original
 *   always-empty-in-production form — see that migration's comment),
 *   surfaced as a plain sentence with no llama message — a fact to
 *   present, not a verdict to deliver.
 * - Momentum detail: `v_goal_rag`'s momentum_mean/inputs, same source
 *   `rag-breakdown.tsx`'s one-line summary already uses, but broken out
 *   here with the rating count and a stale warning made explicit
 *   (compute_goal_rag forces momentum red at 3+ consecutive missed
 *   check-ins — this names that reason instead of leaving the colour to
 *   speak for itself).
 */
export function MomentumSection({
  rag,
  ragHistory,
  trend,
  divergence,
  timezone,
}: {
  rag: GoalRag;
  ragHistory: RagHistoryPoint[];
  trend: RatingTrend;
  divergence: DivergenceCallout | null;
  timezone: string;
}) {
  const inputs = ragInputs(rag);
  // rating_count/missed_streak are only present in app.compute_goal_rag's
  // "normal" inputs object — the undefined-goal branch (0014) returns
  // just {reason, today}, even though momentum_status/momentum_mean
  // there are computed the same way either branch. So momentum_status
  // itself (never absent, and 'grey' precisely when rating_count < 3
  // regardless of branch) is the reliable "enough data?" signal — the
  // exact count is allowed to be genuinely unknown (undefined, not 0)
  // for an undefined goal, rather than fabricating a number that was
  // never actually in inputs.
  const ratingCount = inputs.rating_count;
  const missedStreak = inputs.missed_streak;
  const hasEnoughData = rag.momentum_status !== "grey";

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-medium">Momentum &amp; history</h2>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-muted-foreground text-xs font-medium">
          RAG history
        </h3>
        {ragHistory.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No history yet — a segment gets added here each time a
            check-in that rates this goal is submitted.
          </p>
        ) : (
          <div
            className="flex h-3 gap-px overflow-hidden rounded-full"
            role="img"
            aria-label="RAG status over time"
          >
            {ragHistory.map((point) => (
              <div
                key={point.computedAt}
                className={cn("h-full flex-1", RAG_DOT_CLASS[point.overallStatus])}
                title={`${formatDate(point.computedAt, timezone)}: ${point.overallStatus}`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-muted-foreground text-xs font-medium">
          Rating trend
        </h3>
        <Sparkline periods={trend.periods} series={trend.series} />
      </section>

      {divergence && (
        <section className="border-subtle rounded-lg border p-3">
          <p className="text-sm">{describeDivergence(divergence.entries)}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {formatDate(divergence.periodStart, timezone)} — worth a
            conversation, not a verdict.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-1">
        <h3 className="text-muted-foreground text-xs font-medium">
          Momentum detail
        </h3>
        {!hasEnoughData ? (
          <p className="text-sm">
            Not enough data yet
            {ratingCount != null
              ? ` — ${ratingCount} rating${ratingCount === 1 ? "" : "s"} so far, need 3 for a rolling average.`
              : "."}
          </p>
        ) : (
          <p className="text-sm">
            {rag.momentum_mean != null ? rag.momentum_mean.toFixed(1) : "—"}{" "}
            rolling average
            {ratingCount != null
              ? `, from ${ratingCount} rating${ratingCount === 1 ? "" : "s"}.`
              : "."}
          </p>
        )}
        {missedStreak != null && missedStreak >= 3 && (
          <p className="text-rag-red text-sm">
            Stale — no one has rated this goal in {missedStreak} check-ins
            in a row.
          </p>
        )}
      </section>
    </div>
  );
}
