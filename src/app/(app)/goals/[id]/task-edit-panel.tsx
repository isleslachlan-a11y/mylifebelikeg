"use client";

import { useState, useTransition, type FormEvent } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { fromGoalOffset, toGoalOffset } from "@/lib/dates";
import { COMMON_CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import type { Database } from "@/types/database";
import type { GoalScheduleData } from "./dependency-actions";
import { TaskDependenciesEditor } from "./task-dependencies-editor";
import { deleteTask, updateTask, type TaskEditPatch } from "./tasks-actions";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type TaskDependency = Database["public"]["Tables"]["task_dependencies"]["Row"];

/**
 * "3 days of slack" / "on the critical path" at zero float / "no
 * dependency network" when float is null (Phase 5 P5.0 brief, verbatim:
 * "null float means the goal has no dependency network at all — say
 * that rather than showing '0'"). total_float_days/is_critical are
 * trigger-derived (app.recompute_goal_schedule) — this only formats
 * them, never computes anything.
 */
function describeFloat(task: Task): string {
  if (task.total_float_days == null) {
    return "No dependency network yet — dates come from duration alone.";
  }
  if (task.is_critical) {
    return "On the critical path — no slack.";
  }
  return `${task.total_float_days} day${task.total_float_days === 1 ? "" : "s"} of slack.`;
}

const NO_MILESTONE = "__none__";
const CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * The date-translation layer for one task: offset_days/duration_days are
 * what's stored, but this form works entirely in real dates —
 * toGoalOffset/fromGoalOffset (P1.0) convert at the boundary. Never
 * touches computed_start/computed_end; those are trigger-derived.
 */
export function TaskEditPanel({
  task,
  goalId,
  goalStartDate,
  goalCurrency,
  milestones,
  assignableUsers,
  allTasks,
  dependencies,
  onSaved,
  onDeleted,
  onCancel,
  onGoalDataRefetched,
}: {
  task: Task;
  goalId: string;
  goalStartDate: string | null;
  goalCurrency: string;
  milestones: Milestone[];
  assignableUsers: { id: string; display_name: string }[];
  /** Every task on the goal (including this one) — TaskDependenciesEditor's candidate list and predecessor-title lookup. */
  allTasks: Task[];
  /** Every edge in the goal's network, not just this task's own. */
  dependencies: TaskDependency[];
  onSaved: (task: Task) => void;
  onDeleted: () => void;
  onCancel: () => void;
  /** Replaces the whole tasks+dependencies pair after a dependency change ripples beyond this one task — see dependency-actions.ts's own doc. */
  onGoalDataRefetched: (data: GoalScheduleData) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [ownerId, setOwnerId] = useState(task.owner_id);
  const [milestoneId, setMilestoneId] = useState(
    task.milestone_id ?? NO_MILESTONE,
  );
  const [startDate, setStartDate] = useState(
    goalStartDate ? fromGoalOffset(task.offset_days, goalStartDate) : "",
  );
  const [durationDays, setDurationDays] = useState(String(task.duration_days));
  const initialCurrency = task.cost_currency ?? goalCurrency;
  const [costCurrency, setCostCurrency] = useState(initialCurrency);
  const [estimatedCost, setEstimatedCost] = useState(
    task.estimated_cost_minor != null
      ? formatMoney(task.estimated_cost_minor, initialCurrency)
      : "",
  );

  const currencyOptions = Array.from(
    new Set<string>([...COMMON_CURRENCIES, goalCurrency, costCurrency]),
  );

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

    let estimatedCostMinor: number | null = null;
    if (estimatedCost.trim()) {
      if (!CURRENCY_RE.test(costCurrency)) {
        setError("Currency must be a 3-letter code.");
        return;
      }
      try {
        estimatedCostMinor = parseMoney(estimatedCost, costCurrency);
      } catch {
        setError("Enter a valid estimated cost.");
        return;
      }
      if (estimatedCostMinor < 0) {
        setError("Estimated cost can't be negative.");
        return;
      }
    }

    const patch: TaskEditPatch = {
      title: trimmedTitle,
      notes: notes.trim() || null,
      ownerId,
      milestoneId: milestoneId === NO_MILESTONE ? null : milestoneId,
      durationDays: duration,
      estimatedCostMinor,
      costCurrency: estimatedCostMinor != null ? costCurrency : null,
    };
    if (offsetDays !== undefined) {
      patch.offsetDays = offsetDays;
    }

    startTransition(async () => {
      const result = await updateTask(task.id, goalId, patch);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The returned row carries the trigger-derived computed_start/
      // computed_end for the new offset_days/duration_days — using that,
      // rather than assembling a patch by hand, is what keeps this from
      // needing to know how derive_task_dates actually computes them.
      onSaved(result.data);
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTask(task.id, goalId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDeleted();
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
        <Label htmlFor={`task-title-${task.id}`}>Title</Label>
        <Input
          id={`task-title-${task.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`task-notes-${task.id}`}>Notes</Label>
        <Textarea
          id={`task-notes-${task.id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`task-owner-${task.id}`}>Owner</Label>
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger id={`task-owner-${task.id}`}>
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
          <Label htmlFor={`task-milestone-${task.id}`}>Milestone</Label>
          <Select value={milestoneId} onValueChange={setMilestoneId}>
            <SelectTrigger id={`task-milestone-${task.id}`}>
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
            <Label htmlFor={`task-start-${task.id}`}>Start date</Label>
            <Input
              id={`task-start-${task.id}`}
              type="date"
              min={goalStartDate}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`task-duration-${task.id}`}>Duration (days)</Label>
            <Input
              id={`task-duration-${task.id}`}
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
          <Label htmlFor={`task-duration-${task.id}`}>Duration (days)</Label>
          <Input
            id={`task-duration-${task.id}`}
            type="number"
            min={0}
            step={1}
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            className="w-32"
          />
        </div>
      )}

      <p className="text-muted-foreground text-xs">{describeFloat(task)}</p>

      <TaskDependenciesEditor
        task={task}
        goalId={goalId}
        allTasks={allTasks}
        dependencies={dependencies}
        onGoalDataRefetched={onGoalDataRefetched}
      />

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={`task-cost-${task.id}`}>Estimated cost</Label>
          <Input
            id={`task-cost-${task.id}`}
            inputMode="decimal"
            placeholder="0.00"
            value={estimatedCost}
            onChange={(e) => setEstimatedCost(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`task-currency-${task.id}`}>Currency</Label>
          <Select value={costCurrency} onValueChange={setCostCurrency}>
            <SelectTrigger id={`task-currency-${task.id}`} className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencyOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={handleDelete}
        >
          Delete
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Close
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
