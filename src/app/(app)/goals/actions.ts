"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import { emitLlamaMessage } from "@/lib/llamas/emit";
import type { Database } from "@/types/database";
import { ALLOWED_GOAL_TRANSITIONS, type GoalState } from "./goal-transitions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

export type GoalFormInput = {
  title: string;
  description: string | null;
  lifeAreaId: string | null;
  kind: Database["public"]["Enums"]["goal_kind"];
  funding: Database["public"]["Enums"]["funding_type"];
  currency: string;
  targetAmountMinor: number | null;
  startDate: string | null;
  targetDate: string | null;
  visibility: Database["public"]["Enums"]["visibility_level"];
};

// Every action below runs from an already-gated (app) route, so a missing
// session here means it expired mid-use, not a first visit — send back to
// /login the same way proxy.ts would, rather than surfacing a form error.
async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

// capacity_exceeded used to be emitted inline right here (checked after
// every goal create/reactivate) — removed in P4.6: that path had no
// dedup at all, so creating several goals in a row while over the limit
// stacked up that many identical messages. The trigger is real (P1.7's
// warning itself is untouched, still a UI-level check, still never a
// block) but now lives in the evaluate() route handler
// (src/lib/llamas/evaluate.ts), which checks for an existing
// undismissed message before inserting and runs on check-in submit and
// dashboard load rather than on every mutation.

// No `state` here — createGoal/updateGoal never touch it. Every goal is
// created and stays 'active' at the database default; moving it through
// its lifecycle is transitionGoalState's job below, not this form.
function toRow(input: GoalFormInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    life_area_id: input.lifeAreaId,
    kind: input.kind,
    funding: input.funding,
    currency: input.currency,
    // funded_goals_need_target only requires this when funding isn't
    // 'none' — but "none" clearing whatever was typed before switching
    // funding type is a deliberate app-level choice, not something the
    // constraint itself demands.
    target_amount_minor:
      input.funding === "none" ? null : input.targetAmountMinor,
    start_date: input.startDate,
    target_date: input.targetDate,
    visibility: input.visibility,
  };
}

export async function createGoal(input: GoalFormInput): Promise<ActionResult> {
  if (!input.title.trim()) {
    return { ok: false, error: "Title can't be empty." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { error } = await supabase
    .from("goals")
    .insert({ ...toRow(input), owner_id: userId });

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/goals");
  redirect("/goals");
}

export async function updateGoal(
  id: string,
  input: GoalFormInput,
): Promise<ActionResult> {
  if (!input.title.trim()) {
    return { ok: false, error: "Title can't be empty." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  // NOTE (stale as of P1.4): this owner_id filter was correct when
  // written, because participants didn't exist yet and app.can_edit_goal
  // (the RLS policy's real gate) only ever resolved true for the owner.
  // P1.4 added real collaborator-role participants, for whom
  // app.can_edit_goal now also returns true — so this filter is now
  // actively *more* restrictive than RLS allows, blocking a collaborator
  // from editing the goal form even though they're allowed to edit its
  // milestones (see [id]/milestones-actions.ts, which correctly defers
  // to RLS instead of re-scoping to owner_id). Deliberately left as-is
  // here — fixing goal-form/state-transition access for collaborators is
  // its own change, not something to fold into an unrelated package.
  const { data, error } = await supabase
    .from("goals")
    .update(toRow(input))
    .eq("id", id)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That goal couldn't be found." };
  }

  revalidatePath("/goals");
  revalidatePath(`/goals/${id}`);
  redirect(`/goals/${id}`);
}

/**
 * Moves a goal through its lifecycle. No database trigger enforces the
 * transition graph or stamps these timestamps (checked: only
 * abandoned_needs_reason exists, nothing ties completed_at/archived_at to
 * state) — this function is the actual gate, not a UI nicety layered on
 * top of one.
 */
export async function transitionGoalState(
  id: string,
  targetState: GoalState,
  abandonReason?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data: goal, error: fetchError } = await supabase
    .from("goals")
    .select("id, title, state, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: humanizeDbError(fetchError) };
  }
  if (!goal) {
    return { ok: false, error: "That goal couldn't be found." };
  }
  if (!ALLOWED_GOAL_TRANSITIONS[goal.state].includes(targetState)) {
    return {
      ok: false,
      error: `A ${goal.state} goal can't move to ${targetState}.`,
    };
  }
  if (targetState === "abandoned" && !abandonReason?.trim()) {
    return { ok: false, error: "Tell us why you're abandoning this goal." };
  }

  const now = new Date().toISOString();
  const patch: Pick<
    Database["public"]["Tables"]["goals"]["Update"],
    "state" | "completed_at" | "archived_at" | "abandoned_at" | "abandon_reason"
  > = { state: targetState };

  if (targetState === "active") {
    // Reopening: clear every end-state field regardless of which one was
    // actually set — a goal only ever has one meaningfully set at a time,
    // so unconditionally clearing all three is simpler than branching on
    // where it's reopening from, and always correct.
    patch.completed_at = null;
    patch.archived_at = null;
    patch.abandoned_at = null;
    patch.abandon_reason = null;
  } else if (targetState === "completed") {
    patch.completed_at = now;
  } else if (targetState === "archived") {
    patch.archived_at = now;
  } else if (targetState === "abandoned") {
    patch.abandoned_at = now;
    patch.abandon_reason = abandonReason!.trim();
  }
  // 'someday' has no timestamp column — it's a state, not an end state
  // with a "when" worth recording.

  const { data: updated, error } = await supabase
    .from("goals")
    .update(patch)
    .eq("id", id)
    .eq("owner_id", userId)
    .eq("state", goal.state) // lightweight optimistic-concurrency guard
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!updated) {
    return {
      ok: false,
      error: "This goal's state changed elsewhere — refresh and try again.",
    };
  }

  // Fluffy celebrates a completion; abandoning gets no llama commentary
  // on a decision to stop (see P1.3's notes) — every other transition is
  // silent too, nothing in the registry calls for them.
  if (targetState === "completed") {
    await emitLlamaMessage(
      userId,
      "goal_completed",
      { goalTitle: goal.title },
      { type: "goal", id: goal.id },
    );
  }

  revalidatePath("/goals");
  revalidatePath(`/goals/${id}`);
  return { ok: true, data: undefined };
}

/** Always a soft delete (deleted_at) — never a hard DELETE, and distinct from archiving. */
export async function deleteGoal(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data, error } = await supabase
    .from("goals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That goal couldn't be found." };
  }

  revalidatePath("/goals");
  redirect("/goals");
}
