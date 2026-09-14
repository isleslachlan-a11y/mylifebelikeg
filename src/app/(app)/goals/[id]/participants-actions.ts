"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { extractOpenTaskCount, humanizeDbError } from "@/lib/errors";
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
 * Goal sharing package: rewired onto `app.invite_by_handle` (migration
 * 0043) rather than the hand-rolled lookup-then-insert-then-set-
 * visibility this action used to do itself. That older version is
 * exactly the "two places setting the same field will disagree" bug
 * the brief warns about, verbatim -- it set `goals.visibility` here,
 * in application code, while `leave_goal` (also new) sets it back to
 * `private` from inside the database when the last participant leaves.
 * Only one of those two can be the source of truth; the database
 * function already had to own the "did the last participant just
 * leave" half (this action has no way to know that), so it owns the
 * "did a participant just get added" half too, for the same reason.
 * The handle lookup, self-check, duplicate check, and the
 * `goal_shared_with_you` notification now live entirely in that one
 * function as a result -- this action is just the RPC call and error
 * translation.
 */
export async function addParticipant(
  goalId: string,
  handle: string,
  role: AddableRole,
): Promise<ActionResult> {
  const trimmedHandle = handle.trim();
  if (!trimmedHandle) {
    return { ok: false, error: "Enter a handle." };
  }

  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase.rpc("invite_by_handle", {
    p_goal_id: goalId,
    p_handle: trimmedHandle,
    p_role: role,
  });

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
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
 *
 * Unchanged by the goal-sharing package -- there's no dedicated RPC for
 * this (the brief's own function table doesn't list one), and a plain
 * role UPDATE never touches `goals.visibility`, so none of the
 * two-places-disagreeing risk `addParticipant`/`removeParticipant` had
 * applies here.
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

export type LeaveGoalResult =
  | { ok: true; data: undefined }
  | { ok: false; error: string; openTaskCount: number | null };

/**
 * Rewired onto `app.leave_goal` (0043) -- the participant-id lookup
 * stays (the UI only ever has a `goal_participants.id` to hand this
 * action, from the row it's acting on), but the actual leave/remove,
 * the open-tasks check, the owner-can't-leave check, and clearing
 * `goals.visibility` back to `private` when the last participant goes
 * are now all the database function's job, not this action's.
 *
 * Returns `openTaskCount` alongside the message on failure -- "link to
 * the filtered task list" (S3, brief verbatim) needs the actual number
 * to build that link with, not just a pre-formatted sentence
 * containing it.
 */
export async function removeParticipant(
  participantId: string,
): Promise<LeaveGoalResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { data: participant, error: fetchError } = await supabase
    .from("goal_participants")
    .select("id, goal_id, user_id")
    .eq("id", participantId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: humanizeDbError(fetchError), openTaskCount: null };
  }
  if (!participant) {
    return {
      ok: false,
      error: "That participant couldn't be found.",
      openTaskCount: null,
    };
  }

  const { error } = await supabase.rpc("leave_goal", {
    p_goal_id: participant.goal_id,
    p_user_id: participant.user_id,
  });

  if (error) {
    return {
      ok: false,
      error: humanizeDbError(error),
      openTaskCount: extractOpenTaskCount(error),
    };
  }

  revalidatePath(`/goals/${participant.goal_id}`);
  revalidatePath("/goals");
  return { ok: true, data: undefined };
}

/**
 * Goal sharing package (S3): ownership transfer. The new owner must
 * already be an active participant -- `app.transfer_goal_ownership`
 * checks this itself and refuses otherwise; not re-checked here, same
 * "don't re-implement what the database already enforces" posture
 * every RPC-backed action in this file now takes.
 */
export async function transferGoalOwnership(
  goalId: string,
  newOwnerId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase.rpc("transfer_goal_ownership", {
    p_goal_id: goalId,
    p_new_owner_id: newOwnerId,
  });

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  revalidatePath("/goals");
  return { ok: true, data: undefined };
}
