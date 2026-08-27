"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import { transitionGoalState } from "../../goals/actions";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/**
 * Moved here from profile/actions.ts (P4.5 consolidates capacity
 * management at /settings/capacity, same "Manage life areas" ->
 * /settings/life-areas pattern /profile already uses). Unchanged
 * otherwise: profiles_active_goal_limit_check already enforces 1–20 at
 * the database level, this just skips the round trip on an obviously
 * bad value. The limit is always directly editable regardless of any
 * suggestion (P4.5 brief: "the user can always change the limit
 * directly") — this is that path.
 */
export async function updateActiveGoalLimit(
  limit: number,
): Promise<ActionResult> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    return { ok: false, error: "Choose a number between 1 and 20." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { error } = await supabase
    .from("profiles")
    .update({ active_goal_limit: limit })
    .eq("id", userId);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/settings/capacity");
  revalidatePath("/profile");
  revalidatePath("/goals");
  return { ok: true, data: undefined };
}

/** One-tap accept for a "raise" suggestion — sets the limit to exactly currentLimit + 1, never a bigger jump than app.suggest_goal_limit_change actually earned. */
export async function acceptRaiseSuggestion(
  currentLimit: number,
): Promise<ActionResult> {
  return updateActiveGoalLimit(currentLimit + 1);
}

/**
 * Accepting a "lower" suggestion (P4.5 brief): moves one specific active
 * goal to someday or archived *and* lowers the limit together, so the
 * user is never left over their own new limit — not just decrementing a
 * number. Reuses transitionGoalState (goals/actions.ts) rather than
 * duplicating the lifecycle-transition logic; if that fails, the limit
 * is left untouched rather than lowering it out from under a goal that
 * didn't actually move.
 */
export async function lowerLimitByMovingGoal(
  goalId: string,
  targetState: "someday" | "archived",
  currentLimit: number,
): Promise<ActionResult> {
  const moveResult = await transitionGoalState(goalId, targetState);
  if (!moveResult.ok) {
    return moveResult;
  }
  return updateActiveGoalLimit(Math.max(1, currentLimit - 1));
}

/**
 * "Dismissing a suggestion means it doesn't reappear for that period"
 * (P4.5 brief) — period meaning the current check-in period
 * (app.current_checkin_period, via 0019's public wrapper), not a fixed
 * calendar week, so it lines up with whatever check_in_day the user has
 * set. app.suggest_goal_limit_change's advice itself is untouched by
 * this — only this page's decision to show it is.
 */
export async function dismissCapacitySuggestion(): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data: period, error: periodError } = await supabase
    .rpc("current_checkin_period")
    .single();
  if (periodError || !period) {
    return {
      ok: false,
      error: periodError?.message ?? "Couldn't resolve the current period.",
    };
  }

  const { error } = await supabase
    .from("capacity_suggestion_dismissals")
    .upsert(
      { user_id: userId, period_start: period.period_start },
      { onConflict: "user_id,period_start" },
    );

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/settings/capacity");
  return { ok: true, data: undefined };
}
