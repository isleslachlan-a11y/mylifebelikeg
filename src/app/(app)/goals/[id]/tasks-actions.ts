"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import type { Database } from "@/types/database";
import type { ActionResult } from "../actions";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type TaskStatus = Database["public"]["Enums"]["task_status"];
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// tasks_write (RLS) is app.can_edit_goal(goal_id) — owner OR a
// collaborator-role participant, same surface as milestones_write in
// P1.5 — so, as there, no owner_id filter gets added on top; RLS is the
// actual gate.
async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/**
 * Owner isn't just handed through on create or update — the UI limits
 * the choice to the goal owner or a collaborator-role participant
 * (nothing in the schema enforces "task owner must be on the goal";
 * tasks_owner_id_fkey only requires *some* profiles row), so a crafted
 * request has to be checked the same way here, not just kept out of the
 * dropdown. Returns an error string, or null if ownerId is valid.
 */
async function validateTaskOwner(
  supabase: SupabaseServerClient,
  goalId: string,
  ownerId: string,
): Promise<string | null> {
  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("owner_id")
    .eq("id", goalId)
    .maybeSingle();
  if (goalError || !goal) {
    return "That goal couldn't be found.";
  }
  if (ownerId === goal.owner_id) {
    return null;
  }

  const { data: participant, error: participantError } = await supabase
    .from("goal_participants")
    .select("id")
    .eq("goal_id", goalId)
    .eq("user_id", ownerId)
    .eq("role", "collaborator")
    .is("removed_at", null)
    .maybeSingle();
  if (participantError) {
    return humanizeDbError(participantError);
  }
  return participant
    ? null
    : "Choose the goal owner or a collaborator on this goal.";
}

/**
 * Quick-add: title only, everything else rides the column defaults
 * (offset_days 0, duration_days 1, status not_started) — exactly the
 * "sensible defaults" the spec asks for, so there's nothing else to set.
 * As of P1.9 this is the hotkey path (bound to "t"), not the default —
 * real use showed the round trip back into each task to fix its dates
 * was the tedium, so createTask (below) is what "Add task" opens now.
 * Returns the created row (including trigger-derived computed_start/
 * computed_end) so the caller can render it immediately without a second
 * round trip or a full page refresh, which matters for quick-add's "no
 * mouse, no delay" ergonomics.
 */
export async function createTaskQuick(
  goalId: string,
  title: string,
): Promise<ActionResult<Task>> {
  const trimmed = title.trim();
  if (!trimmed) {
    return { ok: false, error: "Title can't be empty." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data, error } = await supabase
    .from("tasks")
    .insert({ goal_id: goalId, owner_id: userId, title: trimmed })
    .select()
    .single();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return { ok: true, data };
}

export type NewTaskInput = {
  title: string;
  ownerId: string;
  milestoneId: string | null;
  durationDays: number;
  /** Already converted from a real date via toGoalOffset — see add-task-form.tsx. Omitted entirely when the goal has no start_date (nothing to convert against). */
  offsetDays?: number;
};

/**
 * The new default (P1.9): title, owner, dates, and milestone all set in
 * one save — "Save creates a fully specified task with no follow-up edit
 * needed." Never touches computed_start/computed_end, same as
 * createTaskQuick/updateTask — those are trigger-derived.
 */
export async function createTask(
  goalId: string,
  input: NewTaskInput,
): Promise<ActionResult<Task>> {
  const trimmed = input.title.trim();
  if (!trimmed) {
    return { ok: false, error: "Title can't be empty." };
  }
  if (!Number.isInteger(input.durationDays) || input.durationDays < 0) {
    return {
      ok: false,
      error: "Duration must be a whole number of days, zero or more.",
    };
  }
  if (input.offsetDays !== undefined && input.offsetDays < 0) {
    return {
      ok: false,
      error: "A task can't start before the goal's start date.",
    };
  }

  const supabase = await createClient();
  await getUserId(supabase);

  const ownerError = await validateTaskOwner(supabase, goalId, input.ownerId);
  if (ownerError) {
    return { ok: false, error: ownerError };
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      goal_id: goalId,
      owner_id: input.ownerId,
      title: trimmed,
      milestone_id: input.milestoneId,
      duration_days: input.durationDays,
      ...(input.offsetDays !== undefined
        ? { offset_days: input.offsetDays }
        : {}),
    })
    .select()
    .single();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return { ok: true, data };
}

export type TaskEditPatch = {
  title?: string;
  notes?: string | null;
  ownerId?: string;
  milestoneId?: string | null;
  /** Already converted from a real date via toGoalOffset — see task-row.tsx. Never a raw date string. */
  offsetDays?: number;
  durationDays?: number;
  estimatedCostMinor?: number | null;
  costCurrency?: string | null;
};

/**
 * Full edit. Never touches computed_start/computed_end — those are
 * trigger-derived (app.derive_task_dates, BEFORE INSERT/UPDATE) from
 * offset_days/duration_days + the goal's start_date. Writing them here
 * would just fight the trigger on the very next read.
 *
 * Returns the updated row (not just ok:true) for the same reason as
 * createTaskQuick: after an offset_days/duration_days change, the
 * trigger-derived computed_start/computed_end change too, and the only
 * way to show the *real* new dates without re-deriving that logic
 * client-side (which is exactly what "never write them" is guarding
 * against) is to read back what the trigger actually computed.
 */
export async function updateTask(
  id: string,
  goalId: string,
  patch: TaskEditPatch,
): Promise<ActionResult<Task>> {
  const update: Partial<Database["public"]["Tables"]["tasks"]["Update"]> = {};

  if (patch.title !== undefined) {
    const trimmed = patch.title.trim();
    if (!trimmed) {
      return { ok: false, error: "Title can't be empty." };
    }
    update.title = trimmed;
  }
  if (patch.notes !== undefined) {
    update.notes = patch.notes?.trim() || null;
  }
  if (patch.milestoneId !== undefined) {
    update.milestone_id = patch.milestoneId;
  }
  if (patch.offsetDays !== undefined) {
    update.offset_days = patch.offsetDays;
  }
  if (patch.durationDays !== undefined) {
    update.duration_days = patch.durationDays;
  }
  if (patch.estimatedCostMinor !== undefined) {
    update.estimated_cost_minor = patch.estimatedCostMinor;
  }
  if (patch.costCurrency !== undefined) {
    update.cost_currency = patch.costCurrency;
  }

  const supabase = await createClient();
  await getUserId(supabase);

  if (patch.ownerId !== undefined) {
    const ownerError = await validateTaskOwner(supabase, goalId, patch.ownerId);
    if (ownerError) {
      return { ok: false, error: ownerError };
    }
    update.owner_id = patch.ownerId;
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return { ok: true, data };
}

/** The four non-done statuses. Reaching or leaving 'done' goes through toggleTaskComplete instead. */
export async function setTaskStatus(
  id: string,
  goalId: string,
  status: Exclude<TaskStatus, "done">,
): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase
    .from("tasks")
    .update({ status, completed_at: null })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return { ok: true, data: undefined };
}

/**
 * Completing sets completed_at (done_tasks_have_timestamp requires it
 * whenever status = 'done'). Uncompleting clears it and returns status to
 * in_progress — not whatever it was before — "you're back to working on
 * it" is the natural resting state, mirroring toggleMilestoneComplete
 * from P1.5.
 */
export async function toggleTaskComplete(
  id: string,
  goalId: string,
  completed: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase
    .from("tasks")
    .update({
      status: completed ? "done" : "in_progress",
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return { ok: true, data: undefined };
}

/**
 * Reorders within one milestone group (or the Unscheduled group). Same
 * one-update-per-row approach as reorderLifeAreas (P1.1) — sort_order has
 * no unique constraint, and isn't scoped to a group at the database
 * level, but the app only ever compares it within a shared milestone_id,
 * so overlapping values across groups are fine.
 */
export async function reorderTasks(
  goalId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("tasks")
        .update({ sort_order: index })
        .eq("id", id)
        .is("deleted_at", null),
    ),
  );

  const failure = results.find((r) => r.error);
  if (failure?.error) {
    return { ok: false, error: humanizeDbError(failure.error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return { ok: true, data: undefined };
}

/** Always soft (deleted_at) — same convention as every other list in this app. */
export async function deleteTask(
  id: string,
  goalId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return { ok: true, data: undefined };
}
