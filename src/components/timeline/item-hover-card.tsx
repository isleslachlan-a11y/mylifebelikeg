import { NewGoalBadge, RagBadge } from "@/components/rag-badge";
import { describeTimeRemaining, formatDateRange } from "@/lib/dates";
import { isGracePeriod, type GoalRag } from "@/lib/rag";
import { formatScheduleVariance } from "@/lib/schedule-variance";
import {
  classifyItemStatus,
  type ItemVisualStatus,
} from "@/lib/timeline/item-status";
import type { DisplayTimelineItem } from "./timeline-item-adapter";

const STATUS_LABEL: Record<ItemVisualStatus, string> = {
  completed: "Completed",
  in_progress: "In progress",
  overdue: "Overdue",
  not_started: "Not started",
};

export type ItemHoverCardProps = {
  item: DisplayTimelineItem;
  /** Timezone-resolved, computed once per request by the caller (R2) — never `new Date()` in this component. */
  today: string;
  ownerName?: string;
  /**
   * Percentage points, `computeScheduleVariance`'s output — only shown
   * for `item_type: "goal"` rows, and only when a caller actually
   * supplies it. `v_timeline_items` doesn't carry what that calculation
   * needs (created_at, every task's duration/status), so this can't be
   * computed in here; a real page would look it up per goal alongside
   * `ownerNames`/`goalTitles`. `undefined`/`null` both mean "no signal",
   * shown as an absent row, never as 0 — same convention
   * `formatScheduleVariance`'s own caller contract already uses.
   */
  scheduleVariancePp?: number | null;
  /**
   * From `v_goal_rag` (P4.2) — only meaningful for `item_type: "goal"`
   * rows, same caller-supplied contract as `scheduleVariancePp`. When
   * present, replaces the generic date-derived Status row with the real
   * RAG badge for that goal; absent (map not supplied, or a non-goal
   * item) falls back to the classifyItemStatus-derived label, same as
   * before P4.2.
   */
  rag?: GoalRag;
};

/**
 * P3.7's hover/tap card: title, dates in P1.10's relative format, owner,
 * status, and — goals only — schedule variance. Rendered by
 * `TimelineView` as a fixed corner panel (not a cursor-following
 * tooltip) whenever an item is hovered or focused, which keeps this
 * component itself free of any positioning math; `pointer-events-none`
 * so the card is never what captures a click meant for the item behind
 * it.
 *
 * P4.2: for a goal item with `rag` supplied, the Status row becomes the
 * real RAG badge (colour + label, never colour alone) instead of the
 * generic completed/overdue/in-progress/not-started classification —
 * this is the one place besides the goal bands themselves where that
 * classification gets replaced for goals specifically.
 */
export function ItemHoverCard({
  item,
  today,
  ownerName,
  scheduleVariancePp,
  rag,
}: ItemHoverCardProps) {
  const status = classifyItemStatus(item, today);
  const isPoint = item.starts_on === item.ends_on;
  const showRag = item.item_type === "goal" && rag != null;

  return (
    <div
      role="status"
      className="border-subtle bg-surface pointer-events-none flex max-w-xs flex-col gap-2 rounded-xl border p-3 shadow-lg"
    >
      <div>
        <p className="font-display text-foreground text-sm">{item.title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {isPoint
            ? describeTimeRemaining(item.starts_on, today).primary
            : formatDateRange(item.starts_on, item.ends_on, "UTC")}
        </p>
      </div>

      <dl className="flex flex-col gap-0.5 text-xs">
        {ownerName && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="text-foreground">{ownerName}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="text-foreground">
            {showRag && rag ? (
              isGracePeriod(rag) ? (
                <NewGoalBadge />
              ) : (
                <RagBadge status={rag.effective_status ?? "grey"} />
              )
            ) : (
              STATUS_LABEL[status]
            )}
          </dd>
        </div>
        {item.item_type === "goal" && scheduleVariancePp != null && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Schedule</dt>
            <dd className="text-foreground">
              {formatScheduleVariance(scheduleVariancePp)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
