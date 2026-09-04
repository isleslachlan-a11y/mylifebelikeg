"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import { emitLlamaMessage } from "@/lib/llamas/emit";
import { evaluateAchievements } from "@/lib/achievements/evaluate";
import type { NewlyUnlockedAchievement } from "@/lib/achievements/types";
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

  const { data, error } = await supabase
    .from("goals")
    .insert({ ...toRow(input), owner_id: userId })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  // P6.6: "a small number of messages that only fire once, on first use
  // of a feature" (brief) — both checks are naturally idempotent (a
  // fresh count of 1 can only ever be true immediately after the very
  // first row), so neither needs `hasUndismissedMessage`-style dedupe
  // the way evaluate.ts's polled triggers do. goal-form.tsx no longer
  // lets `kind` be "trip" in create mode (P6.3), so every goal this
  // action creates is standard — first_goal firing here is never
  // ambiguous with first_trip (trips/actions.ts's own first-use check).
  const { count: goalCount, error: goalCountError } = await supabase
    .from("goals")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .is("deleted_at", null);
  if (goalCountError) {
    console.error("First-goal count failed", goalCountError);
  } else if (goalCount === 1) {
    await emitLlamaMessage(
      userId,
      "first_goal",
      { goalTitle: input.title.trim() },
      { type: "goal", id: data.id },
    );
  }

  if (input.funding !== "none") {
    const { count: fundedCount, error: fundedCountError } = await supabase
      .from("goals")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .is("deleted_at", null)
      .neq("funding", "none");
    if (fundedCountError) {
      console.error("First-budget count failed", fundedCountError);
    } else if (fundedCount === 1) {
      await emitLlamaMessage(
        userId,
        "first_budget_set",
        { goalTitle: input.title.trim() },
        { type: "goal", id: data.id },
      );
    }
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
/** One dream this completion could reasonably mean was achieved — see `findOfferableAchieveDreams` below. */
export type OfferableAchieveDream = { id: string; title: string };

/**
 * "Achieved is not promoted... when a linked goal or trip completes,
 * offer to mark the dream achieved rather than doing it silently; the
 * user may disagree about what counted" (P8.3/P8.4 briefs). Two
 * independent link shapes, both checked: a dream promoted *directly* to
 * this goal (`someday_items.promoted_goal_id`, P8.3), and — for a
 * trip-kind goal specifically — every place-kind dream promoted into
 * one of *this trip's* stops (`trip_stops.someday_item_id`, the P6.1
 * path). "The trip completes" is read here as the trip's own goal
 * reaching `state = 'completed'`, not any individual stop's
 * `booking_state` — a trip is a goal with `kind = 'trip'` (CLAUDE.md),
 * so both cases really are "a goal completes," just two different ways
 * a dream can be linked to the goal that just did. Already-achieved
 * dreams are excluded — nothing to offer for those.
 */
async function findOfferableAchieveDreams(
  supabase: SupabaseServerClient,
  goal: { id: string; kind: string; promoted_from_dream_id: string | null },
): Promise<OfferableAchieveDream[]> {
  const dreamIds = new Set<string>();
  if (goal.promoted_from_dream_id) {
    dreamIds.add(goal.promoted_from_dream_id);
  }

  if (goal.kind === "trip") {
    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .select("id")
      .eq("goal_id", goal.id)
      .maybeSingle();
    if (tripError) {
      console.error("findOfferableAchieveDreams: trip lookup failed", tripError);
    } else if (trip) {
      const { data: stops, error: stopsError } = await supabase
        .from("trip_stops")
        .select("someday_item_id")
        .eq("trip_id", trip.id)
        .not("someday_item_id", "is", null);
      if (stopsError) {
        console.error(
          "findOfferableAchieveDreams: trip stops lookup failed",
          stopsError,
        );
      } else {
        for (const stop of stops ?? []) {
          if (stop.someday_item_id) dreamIds.add(stop.someday_item_id);
        }
      }
    }
  }

  if (dreamIds.size === 0) return [];

  const { data: dreams, error: dreamsError } = await supabase
    .from("someday_items")
    .select("id, title")
    .in("id", [...dreamIds])
    .is("deleted_at", null)
    .is("achieved_at", null);
  if (dreamsError) {
    console.error("findOfferableAchieveDreams: dream lookup failed", dreamsError);
    return [];
  }
  return dreams ?? [];
}

export async function transitionGoalState(
  id: string,
  targetState: GoalState,
  abandonReason?: string,
): Promise<
  ActionResult<{
    unlockedAchievements: NewlyUnlockedAchievement[];
    offerAchieveDreams: OfferableAchieveDream[];
  }>
> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data: goal, error: fetchError } = await supabase
    .from("goals")
    .select("id, title, state, owner_id, kind, promoted_from_dream_id")
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
  // silent too, nothing in the registry calls for them. P6.6: a
  // trip-kind goal gets trip_completed *instead of* goal_completed, not
  // both — one celebration per completion, just in the voice that fits
  // what was actually completed.
  let unlockedAchievements: NewlyUnlockedAchievement[] = [];
  let offerAchieveDreams: OfferableAchieveDream[] = [];
  if (targetState === "completed") {
    if (goal.kind === "trip") {
      await emitLlamaMessage(
        userId,
        "trip_completed",
        { tripTitle: goal.title },
        { type: "goal", id: goal.id },
      );
    } else {
      await emitLlamaMessage(
        userId,
        "goal_completed",
        { goalTitle: goal.title },
        { type: "goal", id: goal.id },
      );
    }

    // P7.2: goal completion *and* trip completion are the same code
    // path here (branched above only on which llama message to send),
    // so this one call covers both of the brief's "goal completion" and
    // "trip completion" triggers — there's nothing trip-specific about
    // which achievements this could unlock that needs a second call.
    // Never blocks the transition itself, which has already committed
    // by this point.
    try {
      unlockedAchievements = await evaluateAchievements(supabase, userId);
    } catch (evalError) {
      console.error(
        "Achievement evaluation failed after goal completion",
        evalError,
      );
    }

    // P8.4: "offer to mark the dream achieved rather than doing it
    // silently; the user may disagree about what counted" (brief,
    // verbatim) — this only ever *surfaces* the offer (goal-state-actions.tsx
    // renders it, the user taps or ignores it); nothing here marks any
    // dream achieved on its own. Never blocks the transition, which has
    // already committed.
    try {
      offerAchieveDreams = await findOfferableAchieveDreams(supabase, goal);
    } catch (offerError) {
      console.error(
        "Finding offerable achieve-dreams failed after goal completion",
        offerError,
      );
    }
  }

  revalidatePath("/goals");
  revalidatePath(`/goals/${id}`);
  return { ok: true, data: { unlockedAchievements, offerAchieveDreams } };
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
