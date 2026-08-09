"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toGoalOffset } from "@/lib/dates";
import type { Database } from "@/types/database";
import { AddTaskForm } from "./add-task-form";
import {
  createTaskQuick,
  deleteTask,
  reorderTasks,
  setTaskStatus,
  toggleTaskComplete,
} from "./tasks-actions";
import { TaskRow } from "./task-row";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type TaskStatus = Database["public"]["Enums"]["task_status"];
type SortMode = "manual" | "urgency";

const UNSCHEDULED = "__unscheduled__";

function sortByOrder(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Days remaining ascending, overdue first (P1.10) — anchored to
 * computed_end, same as the row's own urgency display. Tasks with no
 * computed_end (unscheduled, or the goal has no start_date) sort last,
 * since there's no days-remaining signal to rank them by.
 */
function sortByUrgency(tasks: Task[], today: string): Task[] {
  return [...tasks].sort((a, b) => {
    const aOffset = a.computed_end
      ? toGoalOffset(a.computed_end, today)
      : Infinity;
    const bOffset = b.computed_end
      ? toGoalOffset(b.computed_end, today)
      : Infinity;
    return aOffset - bOffset;
  });
}

/**
 * Owns the task list as client state, same shape as P1.1/P1.4/P1.5's
 * list managers: every mutation applies optimistically and reverts on a
 * server error. The one thing this can't do optimistically is guess
 * computed_start/computed_end after an offset_days/duration_days change
 * — those are trigger-derived, so createTaskQuick/updateTask return the
 * real row instead of this component ever computing dates itself.
 */
export function TasksSection({
  goalId,
  today,
  canEdit,
  currentUserId,
  goalStartDate,
  goalCurrency,
  milestones,
  assignableUsers,
  ownerNames,
  initialTasks,
}: {
  goalId: string;
  /** Computed once per request via todayInZone — never new Date() here. */
  today: string;
  canEdit: boolean;
  currentUserId: string;
  goalStartDate: string | null;
  goalCurrency: string;
  milestones: Milestone[];
  assignableUsers: { id: string; display_name: string }[];
  ownerNames: Record<string, string>;
  initialTasks: Task[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const quickAddRef = useRef<HTMLInputElement>(null);
  // "Urgency" flattens across milestone groups into one computed order —
  // dragging (sort_order) doesn't apply there, since the order isn't
  // stored, it's derived fresh from today + computed_end each render.
  const [sortMode, setSortMode] = useState<SortMode>("manual");

  // The full "Add task" form is the default now (P1.9); quick-add is the
  // hotkey path, hidden until "t" reveals it — see the effect below.
  const [showAddForm, setShowAddForm] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  // Remembered in plain component state, not web storage (CLAUDE.md rule
  // 7) — "within a session" just means "for as long as this page is
  // open", which in-memory state already gives for free.
  const [lastDuration, setLastDuration] = useState(1);

  useEffect(() => {
    if (!canEdit) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "t" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const active = document.activeElement;
      const isTyping =
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable);
      if (isTyping) return;

      event.preventDefault();
      setShowQuickAdd(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canEdit]);

  function updateOne(id: string, next: Task) {
    setTasks((prev) => prev.map((t) => (t.id === id ? next : t)));
  }

  function handleToggleComplete(task: Task, completed: boolean) {
    const previous = tasks;
    updateOne(task.id, {
      ...task,
      status: completed ? "done" : "in_progress",
      completed_at: completed ? new Date().toISOString() : null,
    });
    setError(null);
    startTransition(async () => {
      const result = await toggleTaskComplete(task.id, goalId, completed);
      if (!result.ok) {
        setTasks(previous);
        setError(result.error);
      }
    });
  }

  function handleStatusChange(task: Task, status: Exclude<TaskStatus, "done">) {
    const previous = tasks;
    updateOne(task.id, { ...task, status, completed_at: null });
    setError(null);
    startTransition(async () => {
      const result = await setTaskStatus(task.id, goalId, status);
      if (!result.ok) {
        setTasks(previous);
        setError(result.error);
      }
    });
  }

  function handleDelete(id: string) {
    const previous = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setError(null);
    startTransition(async () => {
      const result = await deleteTask(id, goalId);
      if (!result.ok) {
        setTasks(previous);
        setError(result.error);
      }
    });
  }

  function handleReorder(
    groupTasks: Task[],
    oldIndex: number,
    newIndex: number,
  ) {
    const reorderedGroup = arrayMove(groupTasks, oldIndex, newIndex);
    const groupIds = new Set(groupTasks.map((t) => t.id));
    const previous = tasks;

    // Splice the reordered group back into the full list, in its new
    // internal order, leaving every other group untouched.
    let cursor = 0;
    const next = tasks.map((t) =>
      groupIds.has(t.id) ? reorderedGroup[cursor++]! : t,
    );
    setTasks(next);
    setError(null);

    startTransition(async () => {
      const result = await reorderTasks(
        goalId,
        reorderedGroup.map((t) => t.id),
      );
      if (!result.ok) {
        setTasks(previous);
        setError(result.error);
      }
    });
  }

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setError(null);

    startTransition(async () => {
      const result = await createTaskQuick(goalId, title);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTasks((prev) => [...prev, result.data]);
      setNewTitle("");
      quickAddRef.current?.focus();
    });
  }

  const groups = [
    ...milestones.map((m) => ({
      key: m.id,
      label: m.title,
      tasks: sortByOrder(tasks.filter((t) => t.milestone_id === m.id)),
    })),
    {
      key: UNSCHEDULED,
      label: "Unscheduled",
      tasks: sortByOrder(tasks.filter((t) => t.milestone_id === null)),
    },
  ].filter((g) => g.tasks.length > 0);

  function renderRow(task: Task) {
    return (
      <TaskRow
        key={task.id}
        task={task}
        today={today}
        canEdit={canEdit}
        ownerName={ownerNames[task.owner_id] ?? "Unknown"}
        goalId={goalId}
        goalStartDate={goalStartDate}
        goalCurrency={goalCurrency}
        milestones={milestones}
        assignableUsers={assignableUsers}
        onToggleComplete={(completed) => handleToggleComplete(task, completed)}
        onStatusChange={(status) => handleStatusChange(task, status)}
        onSaved={(saved) => updateOne(task.id, saved)}
        onDeleted={() => handleDelete(task.id)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {tasks.length > 0 && (
        <Select
          value={sortMode}
          onValueChange={(v) => setSortMode(v as SortMode)}
        >
          <SelectTrigger size="sm" aria-label="Sort tasks" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">By milestone</SelectItem>
            <SelectItem value="urgency">By urgency</SelectItem>
          </SelectContent>
        </Select>
      )}

      {tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">No tasks yet.</p>
      ) : sortMode === "urgency" ? (
        <ul className="flex flex-col gap-1.5">
          {sortByUrgency(tasks, today).map(renderRow)}
        </ul>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <TaskGroup
              key={group.key}
              label={group.label}
              tasks={group.tasks}
              onReorder={(oldIndex, newIndex) =>
                handleReorder(group.tasks, oldIndex, newIndex)
              }
              renderRow={renderRow}
            />
          ))}
        </div>
      )}

      {canEdit && showAddForm && (
        <AddTaskForm
          goalId={goalId}
          goalStartDate={goalStartDate}
          currentUserId={currentUserId}
          milestones={milestones}
          assignableUsers={assignableUsers}
          lastDuration={lastDuration}
          onCreated={(task, durationUsed) => {
            setTasks((prev) => [...prev, task]);
            setLastDuration(durationUsed);
          }}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {canEdit && showQuickAdd && (
        <form onSubmit={handleAdd} className="flex items-center gap-2 pt-1">
          <Input
            ref={quickAddRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowQuickAdd(false);
              }
            }}
            placeholder="Quick-add a task and press Enter"
            aria-label="New task title"
            disabled={isPending}
            autoFocus
          />
          <Button
            type="submit"
            size="sm"
            disabled={isPending || !newTitle.trim()}
          >
            Add
          </Button>
        </form>
      )}

      {canEdit && !showAddForm && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(true)}
          >
            Add task
          </Button>
          <span className="text-muted-foreground text-xs">
            or press <kbd className="font-sans">t</kbd> to quick-add a title
            only
          </span>
        </div>
      )}
    </div>
  );
}

/** One milestone's (or Unscheduled's) tasks, as their own drag surface — a drag can never cross group boundaries. */
function TaskGroup({
  label,
  tasks,
  onReorder,
  renderRow,
}: {
  label: string;
  tasks: Task[];
  onReorder: (oldIndex: number, newIndex: number) => void;
  renderRow: (task: Task) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(oldIndex, newIndex);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-muted-foreground text-xs font-medium">{label}</h3>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-1.5">{tasks.map(renderRow)}</ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
