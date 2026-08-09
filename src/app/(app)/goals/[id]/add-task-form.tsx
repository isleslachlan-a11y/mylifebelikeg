"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toGoalOffset } from "@/lib/dates";
import type { Database } from "@/types/database";
import { createTask } from "./tasks-actions";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];

const NO_MILESTONE = "__none__";

/**
 * The new default for creating a task (P1.9, reversing P1.6): title,
 * owner, dates, and milestone all visible at creation, so save produces
 * a fully specified task with no follow-up trip into the edit panel.
 * Notes and estimated cost stay out — they belong to the edit panel;
 * putting them here would slow down the common case.
 */
export function AddTaskForm({
  goalId,
  goalStartDate,
  currentUserId,
  milestones,
  assignableUsers,
  lastDuration,
  onCreated,
  onClose,
}: {
  goalId: string;
  goalStartDate: string | null;
  currentUserId: string;
  milestones: Milestone[];
  assignableUsers: { id: string; display_name: string }[];
  /** Remembered in tasks-section.tsx's component state (in-memory, not
      web storage — CLAUDE.md rule 7), so five three-day tasks in a row
      only means typing "3" once. */
  lastDuration: number;
  onCreated: (task: Task, durationUsed: number) => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [milestoneId, setMilestoneId] = useState(NO_MILESTONE);
  const [startDate, setStartDate] = useState(goalStartDate ?? "");
  const [durationDays, setDurationDays] = useState(String(lastDuration));
  const titleRef = useRef<HTMLInputElement>(null);

  function handleSave(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title can't be empty.");
      return;
    }

    const duration = Number(durationDays);
    if (!Number.isInteger(duration) || duration < 0) {
      setError("Duration must be a whole number of days, zero or more.");
      return;
    }

    let offsetDays: number | undefined;
    if (goalStartDate) {
      if (!startDate) {
        setError("Pick a start date.");
        return;
      }
      offsetDays = toGoalOffset(startDate, goalStartDate);
      if (offsetDays < 0) {
        setError("Task can't start before the goal's start date.");
        return;
      }
    }

    startTransition(async () => {
      const result = await createTask(goalId, {
        title: trimmedTitle,
        ownerId,
        milestoneId: milestoneId === NO_MILESTONE ? null : milestoneId,
        durationDays: duration,
        ...(offsetDays !== undefined ? { offsetDays } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Reset just the title — owner, milestone, and duration stay as
      // they are, since entering several tasks for the same person/
      // milestone/duration in a row is the common case this is for.
      setTitle("");
      onCreated(result.data, duration);
      titleRef.current?.focus();
    });
  }

  return (
    <form
      onSubmit={handleSave}
      className="border-subtle bg-raised flex flex-col gap-3 rounded-lg border p-3 text-sm"
    >
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-task-title">Title</Label>
        <Input
          id="new-task-title"
          ref={titleRef}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-task-owner">Owner</Label>
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger id="new-task-owner">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {assignableUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-task-milestone">Milestone</Label>
          <Select value={milestoneId} onValueChange={setMilestoneId}>
            <SelectTrigger id="new-task-milestone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MILESTONE}>Unscheduled</SelectItem>
              {milestones.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {goalStartDate ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-task-start">Start date</Label>
            <Input
              id="new-task-start"
              type="date"
              min={goalStartDate}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-task-duration">Duration (days)</Label>
            <Input
              id="new-task-duration"
              type="number"
              min={0}
              step={1}
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-xs">
            This goal has no start date yet, so tasks can&rsquo;t be scheduled —
            dates would be fiction.{" "}
            <Link
              href={`/goals/${goalId}/edit`}
              className="text-primary underline-offset-4 hover:underline"
            >
              Set a start date
            </Link>{" "}
            to unlock scheduling.
          </p>
          <Label htmlFor="new-task-duration">Duration (days)</Label>
          <Input
            id="new-task-duration"
            type="number"
            min={0}
            step={1}
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            className="w-32"
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
