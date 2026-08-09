import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatDate, relativeDays } from "@/lib/dates";
import type { Database } from "@/types/database";
import { goalStateLabel } from "./goal-state-label";

type Goal = Database["public"]["Tables"]["goals"]["Row"];

export function GoalRow({
  goal,
  timezone,
  taskProgress,
}: {
  goal: Goal;
  timezone: string;
  taskProgress: { done: number; total: number };
}) {
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
            {goal.target_date ? (
              <span>
                {formatDate(goal.target_date, timezone)} ·{" "}
                {relativeDays(goal.target_date, timezone)}
              </span>
            ) : (
              <span>No target date</span>
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
