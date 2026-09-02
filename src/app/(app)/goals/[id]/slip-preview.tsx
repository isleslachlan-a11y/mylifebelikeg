"use client";

import { useState, useTransition, type FormEvent } from "react";

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
import { previewTaskSlip } from "./schedule-actions";

export type SlipPreviewProps = {
  /**
   * Critical tasks only (brief: "on a critical task") — a task with
   * slack already has spare days to absorb before the goal's own
   * projected finish moves at all, so there's nothing distinctive to
   * preview for one; the goal's projection only ever moves with the
   * critical chain.
   */
  criticalTasks: { id: string; title: string }[];
  /** The goal's real, current projected end (`v_goal_projected_end`) — shown for comparison; this component never mutates it. */
  currentProjectedEnd: string | null;
  formatDate: (date: string) => string;
};

/**
 * "What happens if this takes N days longer?" (P5.2's own framing,
 * verbatim in the brief) — the one interactive piece of P5.2, everything
 * else on the page is a server-rendered sentence. Calls
 * `previewTaskSlip` (`schedule-actions.ts`), which runs the real CPM
 * scheduler in Postgres against a temporarily-mutated duration and rolls
 * that back internally (`app.preview_task_slip`, 0023) — this component
 * never computes a projected date itself, only displays what came back.
 * Never calls `router.refresh()`/revalidates anything after a preview:
 * a preview changes nothing server-side, so there is nothing to
 * refresh — the acceptance criterion is explicitly that the underlying
 * data stays untouched.
 */
export function SlipPreview({
  criticalTasks,
  currentProjectedEnd,
  formatDate,
}: SlipPreviewProps) {
  const [isPending, startTransition] = useTransition();
  const [taskId, setTaskId] = useState(criticalTasks[0]?.id ?? "");
  const [extraDays, setExtraDays] = useState("7");
  const [previewedEnd, setPreviewedEnd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (criticalTasks.length === 0) {
    return null;
  }

  function handlePreview(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPreviewedEnd(null);

    if (!taskId) {
      setError("Pick a task.");
      return;
    }
    const days = Number(extraDays);
    if (!Number.isInteger(days)) {
      setError("Enter a whole number of days.");
      return;
    }

    startTransition(async () => {
      const result = await previewTaskSlip(taskId, days);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreviewedEnd(result.data);
    });
  }

  const selectedTaskTitle = criticalTasks.find((t) => t.id === taskId)?.title;

  return (
    <div className="border-subtle bg-raised flex flex-col gap-3 rounded-lg border p-3 text-sm">
      <div>
        <p className="font-medium">Slip preview</p>
        <p className="text-muted-foreground text-xs">
          See what a delay on a critical task would do to the goal&rsquo;s
          projected finish — nothing here is saved.
        </p>
      </div>

      <form onSubmit={handlePreview} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slip-preview-task">Critical task</Label>
          <Select value={taskId} onValueChange={setTaskId}>
            <SelectTrigger id="slip-preview-task" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {criticalTasks.map((task) => (
                <SelectItem key={task.id} value={task.id}>
                  {task.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slip-preview-days">Takes this many days longer</Label>
          <Input
            id="slip-preview-days"
            type="number"
            step={1}
            value={extraDays}
            onChange={(e) => setExtraDays(e.target.value)}
            className="w-28"
          />
        </div>

        <Button type="submit" size="sm" disabled={isPending}>
          Preview
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}

      {previewedEnd && (
        <p className="text-sm">
          If <span className="font-medium">{selectedTaskTitle}</span> slips, the
          goal projects to <strong>{formatDate(previewedEnd)}</strong>
          {currentProjectedEnd && (
            <span className="text-muted-foreground">
              {" "}
              — currently projected {formatDate(currentProjectedEnd)}
            </span>
          )}
          . Nothing was saved.
        </p>
      )}
    </div>
  );
}
