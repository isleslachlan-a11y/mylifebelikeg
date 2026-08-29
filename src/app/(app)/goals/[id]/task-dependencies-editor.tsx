"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/types/database";
import {
  addDependency,
  removeDependency,
  updateDependency,
  type GoalScheduleData,
} from "./dependency-actions";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type TaskDependency = Database["public"]["Tables"]["task_dependencies"]["Row"];
type DependencyType = Database["public"]["Enums"]["dependency_type"];

const DEP_TYPE_LABELS: Record<DependencyType, string> = {
  fs: "Finish-to-start",
  ss: "Start-to-start",
  ff: "Finish-to-finish",
  sf: "Start-to-finish",
};
const DEP_TYPES: DependencyType[] = ["fs", "ss", "ff", "sf"];
const DEFAULT_DEP_TYPE: DependencyType = "fs";

function summarize(depType: DependencyType, lagDays: number): string {
  const label = DEP_TYPE_LABELS[depType];
  if (lagDays === 0) return label;
  return lagDays > 0
    ? `${label}, ${lagDays}-day lag`
    : `${label}, ${Math.abs(lagDays)}-day overlap`;
}

/**
 * "Depends on" (Phase 5 P5.0). Adding a predecessor is one select + one
 * click, always finish-to-start with zero lag — the brief's "keep the
 * common case one click" (fs/0 lag is the overwhelming majority).
 * Type/lag live behind each edge's own "Change" toggle instead of in
 * the add flow, editable after the fact rather than only at creation.
 * Every mutation replaces the *whole* task list via
 * `onGoalDataRefetched` — never a locally-patched one — because a
 * dependency change ripples to computed_start/computed_end/
 * total_float_days on tasks this panel never touched.
 */
export function TaskDependenciesEditor({
  task,
  goalId,
  allTasks,
  dependencies,
  onGoalDataRefetched,
}: {
  task: Task;
  goalId: string;
  allTasks: Task[];
  /** Every edge in the goal's network — filtered to this task's own predecessors below. */
  dependencies: TaskDependency[];
  onGoalDataRefetched: (data: GoalScheduleData) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedPredecessor, setSelectedPredecessor] = useState("");
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editType, setEditType] = useState<DependencyType>(DEFAULT_DEP_TYPE);
  const [editLag, setEditLag] = useState("0");

  const titleById = new Map(allTasks.map((t) => [t.id, t.title]));
  const myDependencies = dependencies.filter(
    (d) => d.successor_task_id === task.id,
  );
  const candidateTasks = allTasks.filter(
    (t) =>
      t.id !== task.id &&
      !myDependencies.some((d) => d.predecessor_task_id === t.id),
  );

  function openEditor(edge: TaskDependency) {
    setError(null);
    setEditingEdgeId(edge.id);
    setEditType(edge.dep_type);
    setEditLag(String(edge.lag_days));
  }

  function handleAdd() {
    if (!selectedPredecessor) return;
    setError(null);
    startTransition(async () => {
      const result = await addDependency(
        goalId,
        task.id,
        selectedPredecessor,
        DEFAULT_DEP_TYPE,
        0,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onGoalDataRefetched(result.data);
      setSelectedPredecessor("");
    });
  }

  function handleSaveEdit(edgeId: string) {
    const lag = Number(editLag);
    if (!Number.isInteger(lag)) {
      setError("Lag must be a whole number of days.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateDependency(edgeId, goalId, editType, lag);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onGoalDataRefetched(result.data);
      setEditingEdgeId(null);
    });
  }

  function handleRemove(edgeId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeDependency(edgeId, goalId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onGoalDataRefetched(result.data);
      if (editingEdgeId === edgeId) setEditingEdgeId(null);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs font-medium">Depends on</p>

      {myDependencies.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {myDependencies.map((edge) => (
            <li
              key={edge.id}
              className="border-subtle flex flex-col gap-1.5 rounded-lg border p-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {titleById.get(edge.predecessor_task_id) ?? "Unknown task"}
                  <span className="text-muted-foreground">
                    {" "}
                    — {summarize(edge.dep_type, edge.lag_days)}
                  </span>
                </span>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      editingEdgeId === edge.id
                        ? setEditingEdgeId(null)
                        : openEditor(edge)
                    }
                    className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleRemove(edge.id)}
                    className="text-destructive underline-offset-4 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {editingEdgeId === edge.id && (
                <div className="flex items-center gap-2 pt-1">
                  <Select
                    value={editType}
                    onValueChange={(v) => setEditType(v as DependencyType)}
                  >
                    <SelectTrigger size="sm" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEP_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {DEP_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step={1}
                    value={editLag}
                    onChange={(e) => setEditLag(e.target.value)}
                    aria-label="Lag in days"
                    className="w-20"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleSaveEdit(edge.id)}
                  >
                    Save
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {candidateTasks.length > 0 && (
        <div className="flex items-center gap-2">
          <Select
            value={selectedPredecessor}
            onValueChange={setSelectedPredecessor}
          >
            <SelectTrigger size="sm" className="flex-1">
              <SelectValue placeholder="Add a predecessor…" />
            </SelectTrigger>
            <SelectContent>
              {candidateTasks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending || !selectedPredecessor}
            onClick={handleAdd}
          >
            Add
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
