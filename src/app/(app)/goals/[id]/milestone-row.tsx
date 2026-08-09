"use client";

import { useState } from "react";
import { Diamond, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTimeRemaining, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];

export function MilestoneRow({
  milestone,
  today,
  canEdit,
  onRename,
  onDueDateChange,
  onToggleComplete,
  onDelete,
}: {
  milestone: Milestone;
  /** Computed once per request via todayInZone — never new Date() here. */
  today: string;
  canEdit: boolean;
  onRename: (title: string) => void;
  onDueDateChange: (dueDate: string) => void;
  onToggleComplete: () => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(milestone.title);

  const completed = milestone.completed_at !== null;
  const overdue = !completed && isOverdue(milestone.due_date, today);

  function commitRename() {
    setIsEditing(false);
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== milestone.title) {
      onRename(trimmed);
    } else {
      setDraftTitle(milestone.title);
    }
  }

  return (
    <li className="flex items-center gap-2 py-1 text-sm">
      <button
        type="button"
        disabled={!canEdit}
        onClick={onToggleComplete}
        aria-pressed={completed}
        aria-label={completed ? "Mark incomplete" : "Mark complete"}
        className="shrink-0 disabled:cursor-not-allowed"
      >
        {/* A diamond marker, not a checkbox — milestones are zero-duration
            points, not tasks. Filled = complete; red outline = overdue
            and still incomplete. */}
        <Diamond
          className={cn(
            "size-4",
            completed
              ? "fill-primary text-primary"
              : overdue
                ? "text-rag-red fill-transparent"
                : "text-muted-foreground fill-transparent",
          )}
        />
      </button>

      {isEditing ? (
        <Input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            }
            if (e.key === "Escape") {
              setDraftTitle(milestone.title);
              setIsEditing(false);
            }
          }}
          className="h-6 flex-1"
        />
      ) : (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setIsEditing(true)}
          className={cn(
            "flex-1 truncate text-left",
            completed && "text-muted-foreground line-through",
            canEdit && "hover:underline",
          )}
        >
          {milestone.title}
        </button>
      )}

      <Input
        type="date"
        disabled={!canEdit}
        value={milestone.due_date}
        onChange={(e) => onDueDateChange(e.target.value)}
        className="h-6 w-36 shrink-0 text-xs"
      />

      {/* Always relative here, not describeTimeRemaining's threshold-swapped
          text — the date input above is already the persistent absolute
          display, so this slot's job is just the "how soon" annotation,
          regardless of distance (P1.10). */}
      <span
        className={cn(
          "shrink-0 text-right text-xs whitespace-nowrap",
          overdue ? "text-rag-red font-medium" : "text-muted-foreground",
        )}
      >
        {formatTimeRemaining(milestone.due_date, today)}
      </span>

      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete ${milestone.title}`}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </li>
  );
}
