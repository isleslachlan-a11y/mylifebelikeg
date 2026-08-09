"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateRange } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";
import { TaskEditPanel } from "./task-edit-panel";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function TaskRow({
  task,
  timezone,
  canEdit,
  ownerName,
  goalId,
  goalStartDate,
  goalCurrency,
  milestones,
  assignableUsers,
  onToggleComplete,
  onStatusChange,
  onSaved,
  onDeleted,
}: {
  task: Task;
  timezone: string;
  canEdit: boolean;
  ownerName: string;
  goalId: string;
  goalStartDate: string | null;
  goalCurrency: string;
  milestones: Milestone[];
  assignableUsers: { id: string; display_name: string }[];
  onToggleComplete: (completed: boolean) => void;
  onStatusChange: (status: Exclude<TaskStatus, "done">) => void;
  onSaved: (task: Task) => void;
  onDeleted: () => void;
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

        <span
          className="font-display text-deep bg-primary-soft flex size-6 shrink-0 items-center justify-center rounded-full text-[0.65rem]"
          title={ownerName}
          aria-hidden
        >
          {initials(ownerName)}
        </span>

        <span className="text-muted-foreground hidden shrink-0 text-xs whitespace-nowrap sm:inline">
          {task.computed_start && task.computed_end
            ? formatDateRange(task.computed_start, task.computed_end, timezone)
            : "Unscheduled"}
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
          onSaved={(patch) => {
            onSaved(patch);
            setIsExpanded(false);
          }}
          onDeleted={onDeleted}
          onCancel={() => setIsExpanded(false)}
        />
      )}
    </li>
  );
}
