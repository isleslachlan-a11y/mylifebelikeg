"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import type { Database } from "@/types/database";
import type { ActionResult } from "../actions";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type TaskDependency = Database["public"]["Tables"]["task_dependencies"]["Row"];
type DependencyType = Database["public"]["Enums"]["dependency_type"];
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type GoalScheduleData = {
  tasks: Task[];
  dependencies: TaskDependency[];
};

// task_dependencies_write's RLS is app.can_edit_goal via the
// *predecessor* task's goal — same owner-or-collaborator surface as
// tasks_write, so no extra check is layered on top of it here. What RLS
// can't express is "same goal on both sides" (Phase 5 brief: "not in
// scope: dependencies across goals") — that's checked explicitly below,
// since nothing in the schema enforces it and a crafted request could
// otherwise pair tasks from two different goals.
async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/**
 * Every non-deleted task plus every dependency edge among them, for the
 * goal — the read-back every mutation below returns instead of the row
 * it just wrote. A dependency change ripples via trigger to
 * computed_start/computed_end/total_float_days/is_critical on tasks the
 * caller never touched (Phase 5 brief: "refetch... optimistic local
 * updates will be wrong"), so there's no single row that could stand in
 * for "what changed" the way updateTask's returned row does. Both lists
 * are refetched together, not just tasks, so the edit panel's own
 * "Depends on" list — a plain client-side patch would work for it alone,
 * since edges don't ripple to *other* edges — stays the same
 * one-source-of-truth shape as everything else here.
 */
async function fetchGoalSchedule(
  supabase: SupabaseServerClient,
  goalId: string,
): Promise<ActionResult<GoalScheduleData>> {
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .eq("goal_id", goalId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (tasksError) {
    return { ok: false, error: humanizeDbError(tasksError) };
  }

  const taskIds = (tasks ?? []).map((t) => t.id);
  let dependencies: TaskDependency[] = [];
  if (taskIds.length > 0) {
    const { data, error } = await supabase
      .from("task_dependencies")
      .select("*")
      .in("successor_task_id", taskIds);
    if (error) {
      return { ok: false, error: humanizeDbError(error) };
    }
    dependencies = data ?? [];
  }

  return { ok: true, data: { tasks: tasks ?? [], dependencies } };
}

async function bothTasksInGoal(
  supabase: SupabaseServerClient,
  goalId: string,
  taskIds: string[],
): Promise<boolean> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id")
    .in("id", taskIds)
    .eq("goal_id", goalId)
    .is("deleted_at", null);
  return !error && (data?.length ?? 0) === taskIds.length;
}

/**
 * Adds a predecessor edge. Cycle rejection is entirely
 * `prevent_dependency_cycle`'s job (Phase 5 brief: "don't attempt cycle
 * detection in application code") — this only translates that trigger's
 * raised exception into copy via humanizeDbError, never re-implements
 * the check. No uniqueness guard exists at the database level for
 * (predecessor, successor) pairs, so this checks for an existing
 * identical edge itself before inserting — not for correctness (a
 * duplicate edge doesn't corrupt the CPM maths, `max`/`min` over
 * identical values is a no-op), purely to keep the edit panel's list
 * from showing the same predecessor twice.
 */
export async function addDependency(
  goalId: string,
  successorTaskId: string,
  predecessorTaskId: string,
  depType: DependencyType,
  lagDays: number,
): Promise<ActionResult<GoalScheduleData>> {
  if (!Number.isInteger(lagDays)) {
    return { ok: false, error: "Lag must be a whole number of days." };
  }
  if (predecessorTaskId === successorTaskId) {
    return { ok: false, error: "A task can't depend on itself." };
  }

  const supabase = await createClient();
  await getUserId(supabase);

  const sameGoal = await bothTasksInGoal(supabase, goalId, [
    successorTaskId,
    predecessorTaskId,
  ]);
  if (!sameGoal) {
    return { ok: false, error: "Both tasks must be on this goal." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("task_dependencies")
    .select("id")
    .eq("successor_task_id", successorTaskId)
    .eq("predecessor_task_id", predecessorTaskId)
    .maybeSingle();
  if (existingError) {
    return { ok: false, error: humanizeDbError(existingError) };
  }
  if (existing) {
    return { ok: false, error: "That dependency already exists." };
  }

  const { error } = await supabase.from("task_dependencies").insert({
    predecessor_task_id: predecessorTaskId,
    successor_task_id: successorTaskId,
    dep_type: depType,
    lag_days: lagDays,
  });
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return fetchGoalSchedule(supabase, goalId);
}

/** Type/lag on an existing edge — behind the edit panel's disclosure, not the add flow (Phase 5 brief: "keep the common case one click"). */
export async function updateDependency(
  id: string,
  goalId: string,
  depType: DependencyType,
  lagDays: number,
): Promise<ActionResult<GoalScheduleData>> {
  if (!Number.isInteger(lagDays)) {
    return { ok: false, error: "Lag must be a whole number of days." };
  }

  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase
    .from("task_dependencies")
    .update({ dep_type: depType, lag_days: lagDays })
    .eq("id", id);
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return fetchGoalSchedule(supabase, goalId);
}

export async function removeDependency(
  id: string,
  goalId: string,
): Promise<ActionResult<GoalScheduleData>> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase
    .from("task_dependencies")
    .delete()
    .eq("id", id);
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return fetchGoalSchedule(supabase, goalId);
}
