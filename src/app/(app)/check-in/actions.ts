"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import { evaluateLlamaTriggers } from "@/lib/llamas/evaluate";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Every action below runs from an already-gated (app) route, so a missing
// session here means it expired mid-use, not a first visit — same
// convention as goals/actions.ts and money's action files.
async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

const SCORE_MIN = 1;
const SCORE_MAX = 5;

function validateScore(score: number): string | null {
  if (!Number.isInteger(score) || score < SCORE_MIN || score > SCORE_MAX) {
    return "Rating must be between 1 and 5.";
  }
  return null;
}

/**
 * Rates one goal within a check-in. Upserts on (check_in_id, goal_id,
 * user_id) — 0014's `goal_ratings_unique` index — so ratings that "save
 * as you go" (P4.1 brief) overwrite in place rather than accumulating
 * duplicates if the same goal is tapped more than once. `user_id` comes
 * from the session, never trusted from the caller; no extra ownership
 * filter is layered on top beyond that — `goal_ratings_insert`'s RLS
 * (`user_id = auth.uid() AND app.can_view_goal(goal_id)`) already is the
 * exact surface wanted (CLAUDE.md's per-table filter guidance).
 */
export async function saveGoalRating(
  checkInId: string,
  goalId: string,
  score: number,
  note: string,
): Promise<ActionResult> {
  const validationError = validateScore(score);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { error } = await supabase.from("goal_ratings").upsert(
    {
      check_in_id: checkInId,
      goal_id: goalId,
      user_id: userId,
      score,
      note: note.trim() || null,
    },
    { onConflict: "check_in_id,goal_id,user_id" },
  );

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/check-in");
  return { ok: true, data: undefined };
}

/**
 * The once-per-check-in capacity self-report. A plain update against
 * check_ins — `check_ins_all`'s RLS (`user_id = auth.uid()`) is already
 * the exact authorization surface, so this doesn't re-filter by user_id
 * itself; a checkInId belonging to someone else simply matches zero rows
 * rather than erroring, which is fine here since the client never has
 * another user's checkInId to pass in the first place.
 */
export async function saveCapacityRating(
  checkInId: string,
  capacityRating: number,
): Promise<ActionResult> {
  const validationError = validateScore(capacityRating);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase
    .from("check_ins")
    .update({ capacity_rating: capacityRating })
    .eq("id", checkInId);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/check-in");
  return { ok: true, data: undefined };
}

/** The optional overall note (check_ins.note) — same authorization reasoning as saveCapacityRating. */
export async function saveOverallNote(
  checkInId: string,
  note: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase
    .from("check_ins")
    .update({ note: note.trim() || null })
    .eq("id", checkInId);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/check-in");
  return { ok: true, data: undefined };
}

/**
 * The deliberate, separate act (P4.1 brief) — flips `submitted_at`,
 * which fires 0014's `check_ins_on_submit` trigger: snapshots RAG for
 * every goal rated in this check-in and clears any override that
 * predates this period. `.is("submitted_at", null)` makes a repeat call
 * (a stray double-click) a harmless no-op rather than an error or a
 * timestamp overwrite — the trigger itself already only fires on the
 * null -> not-null transition (0014), this just avoids the pointless
 * write. Nothing here requires every goal to have been rated first:
 * skipping is allowed and unremarked (P4.1 brief), so a check-in with
 * zero ratings is a valid, if uneventful, submission.
 */
export async function submitCheckIn(checkInId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { error } = await supabase
    .from("check_ins")
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", checkInId)
    .is("submitted_at", null);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  // P4.6: one of the two wired evaluation points (the other is dashboard
  // load). Runs after the trigger-driven RAG snapshot above so
  // goal_red/goal_amber/goal_green/goal_improved see this check-in's own
  // fresh snapshot, not the previous one. Subject to
  // evaluateLlamaTriggers's own hourly debounce — this call doesn't
  // force it to run, it just gives it a chance to. Never blocks the
  // submission itself: the check-in has already saved by this point.
  try {
    await evaluateLlamaTriggers(supabase, userId);
  } catch (evalError) {
    console.error("Llama evaluation failed after check-in submit", evalError);
  }

  revalidatePath("/check-in");
  return { ok: true, data: undefined };
}
