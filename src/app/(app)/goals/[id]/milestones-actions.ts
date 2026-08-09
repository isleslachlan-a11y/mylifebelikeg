"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import type { ActionResult } from "../actions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// milestones_write (RLS) is app.can_edit_goal(goal_id) — owner OR a
// collaborator-role participant — so unlike the goal-level actions in
// ../actions.ts, there's no owner_id filter to add on top here: RLS
// already matches the exact authorization surface this feature wants.
// This just confirms a session exists.
async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

export async function createMilestone(
  goalId: string,
  title: string,
  dueDate: string,
): Promise<ActionResult> {
  const trimmed = title.trim();
  if (!trimmed) {
    return { ok: false, error: "Title can't be empty." };
  }
  if (!dueDate) {
    return { ok: false, error: "Pick a due date." };
  }

  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase.from("milestones").insert({
    goal_id: goalId,
    title: trimmed,
    due_date: dueDate,
  });

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return { ok: true, data: undefined };
}

export async function updateMilestone(
  id: string,
  goalId: string,
  patch: { title?: string; dueDate?: string },
): Promise<ActionResult> {
  const update: { title?: string; due_date?: string } = {};
  if (patch.title !== undefined) {
    const trimmed = patch.title.trim();
    if (!trimmed) {
      return { ok: false, error: "Title can't be empty." };
    }
    update.title = trimmed;
  }
  if (patch.dueDate !== undefined) {
    if (!patch.dueDate) {
      return { ok: false, error: "Pick a due date." };
    }
    update.due_date = patch.dueDate;
  }

  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase
    .from("milestones")
    .update(update)
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return { ok: true, data: undefined };
}

export async function toggleMilestoneComplete(
  id: string,
  goalId: string,
  completed: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase
    .from("milestones")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return { ok: true, data: undefined };
}

/** Always soft (deleted_at), never a real DELETE — same convention as every other list in this app. */
export async function deleteMilestone(
  id: string,
  goalId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase
    .from("milestones")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return { ok: true, data: undefined };
}
