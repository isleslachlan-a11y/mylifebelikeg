import { LlamaMessage } from "@/components/llama-message";
import { NewGoalBadge, RagBadge } from "@/components/rag-badge";
import { getLlamaCopy } from "@/lib/llamas/copy";
import {
  describeBudgetDimension,
  describeMomentumDimension,
  describeScheduleDimension,
  hasScheduleMomentumMismatch,
  isGracePeriod,
  isUndefinedGoal,
  type GoalRag,
} from "@/lib/rag";
import type { Database } from "@/types/database";

type RagBreakdownProps = {
  rag: GoalRag;
  goalTitle: string;
  funding: Database["public"]["Enums"]["funding_type"];
  /** Raw task counts (done/total, cancelled excluded) — not inputs.task_weight_*, which are duration-weighted. */
  taskCounts: { done: number; total: number } | null;
};

/**
 * The goal detail page's RAG section (P4.2's centrepiece): the badge —
 * honouring any live override, per `effective_status` — then all three
 * dimensions with their contributing numbers. "A red dot with no
 * explanation is a red dot people learn to ignore" (P4.2 brief).
 *
 * Grace-period goals render neither the badge nor the breakdown: there's
 * nothing computed to explain yet (`app.compute_goal_rag` returns null
 * variances in that branch), so a breakdown here would just be three
 * "no data" lines under a colour that isn't earned regardless — "new"
 * is the whole story. An undefined goal (no tasks, no budget) still
 * gets the full breakdown below its badge and message, since momentum
 * is independent of tasks/budget and can carry real data even here
 * (`app.compute_goal_rag`'s own undefined-goal branch still computes
 * it) — only schedule/budget actually have nothing to report.
 */
export function RagBreakdown({
  rag,
  goalTitle,
  funding,
  taskCounts,
}: RagBreakdownProps) {
  if (isGracePeriod(rag)) {
    return <NewGoalBadge />;
  }

  const status = rag.effective_status ?? "grey";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <RagBadge status={status} />
        {rag.is_overridden && (
          <span className="text-muted-foreground text-xs">
            Manually set
          </span>
        )}
      </div>

      {isUndefinedGoal(rag) && (
        <LlamaMessage
          speaker="derek"
          body={getLlamaCopy("goal_undefined", { goalTitle })}
        />
      )}

      {hasScheduleMomentumMismatch(rag) && (
        <LlamaMessage
          speaker="derek"
          body={getLlamaCopy("schedule_momentum_mismatch", { goalTitle })}
        />
      )}

      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="flex flex-wrap items-baseline gap-2">
          <dt className="text-muted-foreground w-20 shrink-0">Schedule</dt>
          <dd>{describeScheduleDimension(rag, taskCounts)}</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <dt className="text-muted-foreground w-20 shrink-0">Budget</dt>
          <dd>{describeBudgetDimension(rag, funding)}</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <dt className="text-muted-foreground w-20 shrink-0">Momentum</dt>
          <dd>{describeMomentumDimension(rag)}</dd>
        </div>
      </dl>
    </div>
  );
}
