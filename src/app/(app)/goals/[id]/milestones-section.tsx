"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Database } from "@/types/database";
import {
  createMilestone,
  deleteMilestone,
  toggleMilestoneComplete,
  updateMilestone,
} from "./milestones-actions";
import { MilestoneRow } from "./milestone-row";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];

function sortByDueDate(milestones: Milestone[]): Milestone[] {
  return [...milestones].sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export function MilestonesSection({
  goalId,
  timezone,
  canEdit,
  initialMilestones,
}: {
  goalId: string;
  timezone: string;
  canEdit: boolean;
  initialMilestones: Milestone[];
}) {
  const router = useRouter();
  const [milestones, setMilestones] = useState(() =>
    sortByDueDate(initialMilestones),
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState("");

  // Same "adjust state during render" sync as ParticipantsSection (P1.4)
  // — router.refresh() re-runs the server component with a fresh
  // initialMilestones prop, but this component's own useState won't pick
  // that up on its own after the first mount.
  const [prevInitial, setPrevInitial] = useState(initialMilestones);
  if (initialMilestones !== prevInitial) {
    setPrevInitial(initialMilestones);
    setMilestones(sortByDueDate(initialMilestones));
  }

  function handleRename(id: string, title: string) {
    const previous = milestones;
    setMilestones((prev) =>
      prev.map((m) => (m.id === id ? { ...m, title } : m)),
    );
    setError(null);
    startTransition(async () => {
      const result = await updateMilestone(id, goalId, { title });
      if (!result.ok) {
        setMilestones(previous);
        setError(result.error);
      }
    });
  }

  function handleDueDateChange(id: string, dueDate: string) {
    const previous = milestones;
    setMilestones((prev) =>
      sortByDueDate(
        prev.map((m) => (m.id === id ? { ...m, due_date: dueDate } : m)),
      ),
    );
    setError(null);
    startTransition(async () => {
      const result = await updateMilestone(id, goalId, { dueDate });
      if (!result.ok) {
        setMilestones(previous);
        setError(result.error);
      }
    });
  }

  function handleToggleComplete(id: string) {
    const target = milestones.find((m) => m.id === id);
    if (!target) return;
    const nowCompleted = target.completed_at === null;
    const previous = milestones;
    setMilestones((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              completed_at: nowCompleted ? new Date().toISOString() : null,
            }
          : m,
      ),
    );
    setError(null);
    startTransition(async () => {
      const result = await toggleMilestoneComplete(id, goalId, nowCompleted);
      if (!result.ok) {
        setMilestones(previous);
        setError(result.error);
      }
    });
  }

  function handleDelete(id: string) {
    const previous = milestones;
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    setError(null);
    startTransition(async () => {
      const result = await deleteMilestone(id, goalId);
      if (!result.ok) {
        setMilestones(previous);
        setError(result.error);
      }
    });
  }

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!newTitle.trim() || !newDueDate) {
      setError(!newDueDate ? "Pick a due date." : "Title can't be empty.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createMilestone(goalId, newTitle, newDueDate);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNewTitle("");
      setNewDueDate("");
      // The new row's id isn't known client-side without another round
      // trip — router.refresh() re-runs the server component (already
      // fresh via createMilestone's revalidatePath).
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {milestones.length === 0 ? (
        <p className="text-muted-foreground text-sm">No milestones yet.</p>
      ) : (
        <ul className="flex flex-col">
          {milestones.map((m) => (
            <MilestoneRow
              key={m.id}
              milestone={m}
              timezone={timezone}
              canEdit={canEdit}
              onRename={(title) => handleRename(m.id, title)}
              onDueDateChange={(dueDate) => handleDueDateChange(m.id, dueDate)}
              onToggleComplete={() => handleToggleComplete(m.id)}
              onDelete={() => handleDelete(m.id)}
            />
          ))}
        </ul>
      )}

      {canEdit && (
        <form onSubmit={handleAdd} className="flex items-center gap-2 pt-1">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New milestone"
            aria-label="New milestone title"
            className="h-7 flex-1"
            disabled={isPending}
          />
          <Input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            aria-label="New milestone due date"
            className="h-7 w-36"
            disabled={isPending}
          />
          <Button
            type="submit"
            size="sm"
            disabled={isPending || !newTitle.trim() || !newDueDate}
          >
            Add
          </Button>
        </form>
      )}
    </div>
  );
}
