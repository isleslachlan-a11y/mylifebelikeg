import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { NewGoalBadge, RagBadge } from "@/components/rag-badge";
import { describeTimeRemaining } from "@/lib/dates";
import { isGracePeriod, type GoalRag } from "@/lib/rag";
import { formatScheduleVariance } from "@/lib/schedule-variance";
import type { Database } from "@/types/database";
import { goalStateLabel } from "./goal-state-label";

type Goal = Database["public"]["Tables"]["goals"]["Row"];

export function GoalRow({
  goal,
  today,
  taskProgress,
  ownerName,
  scheduleVariance,
  rag,
}: {
  goal: Goal;
  /** Computed once per request via todayInZone — never new Date() here. */
  today: string;
  taskProgress: { done: number; total: number };
  /** Shown for goals in the "Shared with you" section — whose goal this actually is. */
  ownerName?: string;
  /** null means "nothing to show" (no start/target date, no tasks, or still in the grace period) — never render 0%. */
  scheduleVariance?: number | null;
  /** From v_goal_rag (P4.2) — undefined only if the row wasn't found (shouldn't happen for a real goal, but the map lookup is honest about it). */
  rag?: GoalRag;
}) {
  const targetDisplay = goal.target_date
    ? describeTimeRemaining(goal.target_date, today)
    : null;

  return (
    <li>
      <Link
        href={`/goals/${goal.id}`}
        className="hover:bg-raised flex items-center justify-between gap-3 rounded-lg p-2 transition-colors"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{goal.title}</span>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary" className="h-4 px-1.5 text-[0.65rem]">
              {goalStateLabel(goal.state)}
            </Badge>
            {rag &&
              (isGracePeriod(rag) ? (
                <NewGoalBadge className="h-4 px-1.5 text-[0.65rem]" />
              ) : (
                <RagBadge
                  status={rag.effective_status ?? "grey"}
                  className="h-4 px-1.5 text-[0.65rem]"
                />
              ))}
            {targetDisplay ? (
              <span>
                {targetDisplay.primary}{" "}
                <span className="opacity-70">({targetDisplay.secondary})</span>
              </span>
            ) : (
              <span>No target date</span>
            )}
            {ownerName && <span>Owned by {ownerName}</span>}
            {scheduleVariance != null && (
              <span>{formatScheduleVariance(scheduleVariance)}</span>
            )}
          </div>
        </div>
        {taskProgress.total > 0 && (
          <span className="text-muted-foreground shrink-0 text-xs">
            {taskProgress.done}/{taskProgress.total}
          </span>
        )}
      </Link>
    </li>
  );
}
