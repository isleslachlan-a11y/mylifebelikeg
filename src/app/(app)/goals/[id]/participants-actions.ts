"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import type { Database } from "@/types/database";
import type { ActionResult } from "../actions";

type AddableRole = Extract<
  Database["public"]["Enums"]["participant_role"],
  "collaborator" | "viewer"
>;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/**
 * Adds a participant by handle. Deliberately does NOT pre-check
 * "is the caller the goal owner" — RLS's goal_participants_insert policy
 * (app.is_goal_owner) is the actual enforcement, and this just translates
 * its failure (Postgres 42501, insufficient_privilege) into copy that
 * doesn't read like a database error.
 */
export async function addParticipant(
  goalId: string,
  handle: string,
  role: AddableRole,
): Promise<ActionResult> {
  const trimmedHandle = handle.trim().toLowerCase();
  if (!trimmedHandle) {
    return { ok: false, error: "Enter a handle." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("handle", trimmedHandle)
    .maybeSingle();

  if (profileError) {
    return { ok: false, error: humanizeDbError(profileError) };
  }
  if (!profile) {
    return { ok: false, error: "No account found with that handle." };
  }
  if (profile.id === userId) {
    return { ok: false, error: "You can't add yourself." };
  }

  const { error } = await supabase.from("goal_participants").insert({
    goal_id: goalId,
    user_id: profile.id,
    role,
    invited_by: userId,
  });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "Only the goal owner can add people." };
    }
    return { ok: false, error: humanizeDbError(error) };
  }

  // A private goal with someone else attached to it doesn't make sense —
  // adding a participant is what makes it shared.
  const { error: visibilityError } = await supabase
    .from("goals")
    .update({ visibility: "shared" })
    .eq("id", goalId);
  if (visibilityError) {
    console.error("Failed to set goal visibility to shared", visibilityError);
  }

  revalidatePath(`/goals/${goalId}`);
  revalidatePath("/goals");
  return { ok: true, data: undefined };
}

/**
 * Owner-only, enforced here rather than left to RLS: goal_participants_update
 * permits a participant to update their own row (it's also how self-removal
 * works), so without this explicit check a participant could change their
 * own role through this same action. Fetching the goal and comparing
 * owner_id is what actually stops that.
 */
export async function changeParticipantRole(
  participantId: string,
  role: AddableRole,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data: participant, error: fetchError } = await supabase
    .from("goal_participants")
    .select("id, goal_id")
    .eq("id", participantId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: humanizeDbError(fetchError) };
  }
  if (!participant) {
    return { ok: false, error: "That participant couldn't be found." };
  }

  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("owner_id")
    .eq("id", participant.goal_id)
    .maybeSingle();

  if (goalError || !goal) {
    return { ok: false, error: "That goal couldn't be found." };
  }
  if (goal.owner_id !== userId) {
    return { ok: false, error: "Only the goal owner can change roles." };
  }

  const { error } = await supabase
    .from("goal_participants")
    .update({ role })
    .eq("id", participantId);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${participant.goal_id}`);
  return { ok: true, data: undefined };
}

/**
 * Always soft (removed_at), never a real DELETE — the partial unique
 * index on (goal_id, user_id) only covers removed_at IS NULL rows, so
 * re-adding the same person later still works.
 *
 * Blocks removal if the person still owns tasks on this goal.
 * tasks.owner_id is ON DELETE RESTRICT against profiles, but that FK
 * only fires on a real DELETE of the profile — nothing in the schema
 * stops a *removed participant* from still owning tasks, since removal
 * here is an UPDATE the FK never sees. This check is the only thing that
 * actually prevents it.
 */
export async function removeParticipant(
  participantId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data: participant, error: fetchError } = await supabase
    .from("goal_participants")
    .select("id, goal_id, user_id")
    .eq("id", participantId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: humanizeDbError(fetchError) };
  }
  if (!participant) {
    return { ok: false, error: "That participant couldn't be found." };
  }

  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("owner_id")
    .eq("id", participant.goal_id)
    .maybeSingle();

  if (goalError || !goal) {
    return { ok: false, error: "That goal couldn't be found." };
  }

  const isOwner = goal.owner_id === userId;
  const isSelf = participant.user_id === userId;
  if (!isOwner && !isSelf) {
    return { ok: false, error: "You can only remove yourself from this goal." };
  }

  const { count, error: tasksError } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("goal_id", participant.goal_id)
    .eq("owner_id", participant.user_id)
    .is("deleted_at", null);

  if (tasksError) {
    return { ok: false, error: humanizeDbError(tasksError) };
  }
  if (count && count > 0) {
    return {
      ok: false,
      error: `They still own ${count} task${count === 1 ? "" : "s"} on this goal — reassign ${count === 1 ? "it" : "them"} to someone else first.`,
    };
  }

  const { error } = await supabase
    .from("goal_participants")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", participantId);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${participant.goal_id}`);
  revalidatePath("/goals");
  return { ok: true, data: undefined };
}
