"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { Avatar } from "@/components/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatDateRange,
  formatTimeRemaining,
  isRelativeTimePrimary,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Database, Json } from "@/types/database";
import type { GoalScheduleData } from "./dependency-actions";
import { TaskEditPanel } from "./task-edit-panel";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type TaskDependency = Database["public"]["Tables"]["task_dependencies"]["Row"];
type TaskStatus = Database["public"]["Enums"]["task_status"];

const NON_DONE_STATUSES: Exclude<TaskStatus, "done">[] = [
  "not_started",
  "in_progress",
  "blocked",
  "cancelled",
];

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export function TaskRow({
  task,
  today,
  canEdit,
  ownerName,
  ownerAvatar,
  goalId,
  goalStartDate,
  goalCurrency,
  milestones,
  assignableUsers,
  allTasks,
  dependencies,
  onToggleComplete,
  onStatusChange,
  onSaved,
  onDeleted,
  onGoalDataRefetched,
}: {
  task: Task;
  /** Computed once per request via todayInZone — never new Date() here. */
  today: string;
  canEdit: boolean;
  ownerName: string;
  ownerAvatar: Json;
  goalId: string;
  goalStartDate: string | null;
  goalCurrency: string;
  milestones: Milestone[];
  assignableUsers: { id: string; display_name: string }[];
  allTasks: Task[];
  dependencies: TaskDependency[];
  onToggleComplete: (completed: boolean) => void;
  onStatusChange: (status: Exclude<TaskStatus, "done">) => void;
  onSaved: (task: Task) => void;
  onDeleted: () => void;
  onGoalDataRefetched: (data: GoalScheduleData) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });
  const [isExpanded, setIsExpanded] = useState(false);

  const style = { transform: CSS.Transform.toString(transform), transition };
  const completed = task.status === "done";

  // "Time remaining" for a range is anchored to computed_end — the
  // deadline-ish end of it — while the absolute side shows the full
  // range rather than just that one date, since the range is the actual
  // context a task row needs (P1.10 applies the threshold rule to task
  // date ranges, but a range has no single "the date" to pair with).
  let datePrimary = "Unscheduled";
  let dateSecondary: string | null = null;
  if (task.computed_start && task.computed_end) {
    const { computed_start, computed_end } = task;
    const range = formatDateRange(computed_start, computed_end, "UTC");
    const relative = formatTimeRemaining(computed_end, today);
    if (isRelativeTimePrimary(computed_end, today)) {
      datePrimary = relative;
      dateSecondary = range;
    } else {
      datePrimary = range;
      dateSecondary = relative;
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card ring-foreground/10 flex flex-col gap-2 rounded-lg p-2 ring-1",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2">
        {canEdit && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${task.title}`}
            className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
        )}

        <input
          type="checkbox"
          checked={completed}
          disabled={!canEdit}
          onChange={(e) => onToggleComplete(e.target.checked)}
          aria-label={completed ? "Mark incomplete" : "Mark complete"}
          className="accent-primary size-4 shrink-0"
        />

        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className={cn(
              "truncate text-sm",
              completed && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </span>
        </button>

        {/* P10.0: `title` alone only ever showed the owner's name on
            desktop mouse hover — nothing a tap could reach. Same
            native-title-for-hover-plus-Popover-for-tap shape P7.1's
            avatar editor already established for its own locked-preset
            hint, applied here for the same reason. */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={ownerName}
              aria-label={ownerName}
              className="shrink-0"
            >
              <Avatar avatar={ownerAvatar} size={24} className="rounded-full" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto px-3 py-1.5 text-sm">
            {ownerName}
          </PopoverContent>
        </Popover>

        <span className="text-muted-foreground hidden shrink-0 text-xs whitespace-nowrap sm:inline">
          {datePrimary}
          {dateSecondary && (
            <span className="opacity-70"> ({dateSecondary})</span>
          )}
        </span>

        {completed ? (
          <span className="text-muted-foreground w-28 shrink-0 text-right text-xs">
            Done
          </span>
        ) : (
          <Select
            value={task.status}
            onValueChange={(v) =>
              onStatusChange(v as Exclude<TaskStatus, "done">)
            }
          >
            <SelectTrigger
              size="sm"
              disabled={!canEdit}
              className="w-28 shrink-0 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NON_DONE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isExpanded && canEdit && (
        <TaskEditPanel
          task={task}
          goalId={goalId}
          goalStartDate={goalStartDate}
          goalCurrency={goalCurrency}
          milestones={milestones}
          assignableUsers={assignableUsers}
          allTasks={allTasks}
          dependencies={dependencies}
          onSaved={(patch) => {
            onSaved(patch);
            setIsExpanded(false);
          }}
          onDeleted={onDeleted}
          onCancel={() => setIsExpanded(false)}
          onGoalDataRefetched={onGoalDataRefetched}
        />
      )}
    </li>
  );
}
