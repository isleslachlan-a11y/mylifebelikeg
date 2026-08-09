import { formatDateRange, isOverdue } from "@/lib/dates";
import { createTimelineScale } from "@/lib/timeline/scale";
import { stackedRowCount, stackIntervals } from "@/lib/timeline/stack";
import type { Database } from "@/types/database";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];

// A fixed logical width — the SVG viewBox, not real pixels. className
// "w-full h-auto" scales the whole thing (shapes and text together) down
// proportionally on narrow viewports, which is what "horizontal but
// compressed on mobile" means here: still one horizontal strip, not a
// switch to a vertical layout, and no JS resize/measurement needed.
const VIEW_WIDTH = 800;
const MILESTONE_ROW_H = 20;
const TASK_ROW_H = 14;
const ROW_GAP = 3;
const AXIS_H = 18;
const MIN_BAR_WIDTH = 4;
const MIN_GAP_PX = 4;
const PAD_FRACTION = 0.05;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A compact, fixed-domain timeline for one goal: its own span, its
 * milestones, and its tasks. No zoom, no drag, no lanes for other goals
 * — that's Phase 3 (see PHASE-3-REQUIREMENTS.MD). What this *does*
 * share with Phase 3, on purpose, is the date-scale module
 * (`src/lib/timeline/scale.ts`) and the collision-stacking algorithm
 * (`src/lib/timeline/stack.ts`) — both orientation/component-agnostic,
 * built once here rather than thrown away like the P0.8 spike.
 *
 * No inline text labels on bars/diamonds — titles are available on
 * hover (native SVG `<title>`) and in full in the Milestones/Tasks
 * sections below. That's what keeps this "compact" rather than a second
 * copy of those lists, and it's also what makes the mobile-compression
 * approach above safe: there's no label text to become illegible at
 * small scale, just coloured shapes.
 */
export function GoalTimeline({
  startDate,
  targetDate,
  today,
  tasks,
  milestones,
}: {
  startDate: string | null;
  targetDate: string | null;
  /** Computed once per request via todayInZone (P1.10) — never new Date() here. */
  today: string;
  tasks: Task[];
  milestones: Milestone[];
}) {
  if (!startDate || !targetDate) {
    return (
      <p className="text-muted-foreground text-sm">
        Set both a start date and a target date to see the timeline.
      </p>
    );
  }

  const start = new Date(startDate);
  const end = new Date(targetDate);
  const spanMs = Math.max(end.getTime() - start.getTime(), 0);
  const padMs = Math.max(spanMs * PAD_FRACTION, DAY_MS);
  const domainStart = new Date(start.getTime() - padMs);
  const domainEnd = new Date(end.getTime() + padMs);

  const scale = createTimelineScale([domainStart, domainEnd], [0, VIEW_WIDTH]);

  // Cancelled tasks are excluded — same precedent as P1.7's schedule
  // variance, which also treats them as not contributing. Anything
  // without both computed dates can't be placed (shouldn't happen once
  // the goal has a start_date, since the trigger derives them, but
  // guard rather than crash).
  const scheduledTasks = tasks.filter(
    (t): t is Task & { computed_start: string; computed_end: string } =>
      t.status !== "cancelled" &&
      t.computed_start !== null &&
      t.computed_end !== null,
  );

  // R4: overlap decided in pixels (not dates), with a minimum gap so
  // labels/edges don't visually collide, and sub-row height driven by
  // the actual maximum overlap depth.
  const stackedTasks = stackIntervals(
    scheduledTasks,
    (t) => scale.toPixel(new Date(t.computed_start)),
    (t) => scale.toPixel(new Date(t.computed_end)),
    { minWidth: MIN_BAR_WIDTH, minGap: MIN_GAP_PX },
  );
  const taskRowCount = stackedRowCount(stackedTasks);
  const taskAreaHeight =
    taskRowCount > 0
      ? taskRowCount * TASK_ROW_H + (taskRowCount - 1) * ROW_GAP
      : 0;

  const taskAreaY = MILESTONE_ROW_H + ROW_GAP;
  const axisY = taskAreaY + taskAreaHeight + ROW_GAP;
  const totalHeight = axisY + AXIS_H;

  const todayDate = new Date(today);
  const todayX = scale.toPixel(todayDate);
  const showTodayMarker = todayX >= 0 && todayX <= VIEW_WIDTH;

  const ticks = scale.ticks(6);

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${totalHeight}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Timeline, ${formatDateRange(startDate, targetDate, "UTC")}`}
    >
      {/* Milestones: one reserved row, never interleaved with task bars (R3). */}
      {milestones.map((m) => {
        const cx = scale.toPixel(new Date(m.due_date));
        const cy = MILESTONE_ROW_H / 2;
        const half = 5;
        return (
          <rect
            key={m.id}
            x={-half}
            y={-half}
            width={half * 2}
            height={half * 2}
            transform={`translate(${cx}, ${cy}) rotate(45)`}
            className={milestoneFill(m, today)}
          >
            <title>{m.title}</title>
          </rect>
        );
      })}

      {/* Task bars: anchored at computed_start, extending by duration — not centred (R3). */}
      {stackedTasks.map(({ item: task, row, x, width }) => (
        <rect
          key={task.id}
          x={x}
          y={taskAreaY + row * (TASK_ROW_H + ROW_GAP)}
          width={width}
          height={TASK_ROW_H}
          rx={2}
          className={taskFill(task, today)}
        >
          <title>{task.title}</title>
        </rect>
      ))}

      {showTodayMarker && (
        <line
          x1={todayX}
          x2={todayX}
          y1={0}
          y2={axisY}
          className="stroke-foreground/40"
          strokeWidth={1}
        />
      )}

      <g transform={`translate(0, ${axisY})`}>
        <line
          x1={0}
          x2={VIEW_WIDTH}
          y1={0}
          y2={0}
          className="stroke-border"
          strokeWidth={1}
        />
        {ticks.map((tick, i) => (
          <g
            key={tick.getTime()}
            transform={`translate(${scale.toPixel(tick)}, 0)`}
          >
            <line y1={0} y2={4} className="stroke-border" strokeWidth={1} />
            <text
              y={14}
              textAnchor="middle"
              className="fill-muted-foreground text-[8px]"
            >
              {tickLabel(tick, i === 0 ? null : ticks[i - 1]!)}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// Completed -> star; overdue and incomplete -> rag-red; everything else -> primary.
function taskFill(task: Task, today: string): string {
  if (task.status === "done") return "fill-star";
  if (isOverdue(task.computed_end!, today)) return "fill-rag-red";
  return "fill-primary";
}

function milestoneFill(milestone: Milestone, today: string): string {
  if (milestone.completed_at) return "fill-star";
  if (isOverdue(milestone.due_date, today)) return "fill-rag-red";
  return "fill-primary";
}

// Month, or "Mon YYYY" when the year changes from the previous tick.
function tickLabel(date: Date, previous: Date | null): string {
  const showYear =
    previous === null || date.getUTCFullYear() !== previous.getUTCFullYear();
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: showYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(date);
}
