import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { CapacitySettings } from "./capacity-settings";
import { CapacitySuggestion } from "./capacity-suggestion";

const MIN_HISTORY_FOR_SUGGESTIONS = 3;

/**
 * Capacity management (P4.5) — the number, the count, the recent
 * capacity mean, and (advisory, always dismissable, never a block —
 * P1.7's over-limit warning stays exactly as soft as it always was)
 * app.suggest_goal_limit_change's raise/lower suggestion.
 *
 * "Don't invent a suggestion" when there's under 3 periods of history
 * (brief, verbatim) means two genuinely different kinds of "nothing"
 * have to be told apart: app.suggest_goal_limit_change returns no rows
 * both when there isn't enough history *and* when there's plenty of
 * history and nothing worth suggesting (capacity's been fine, nothing's
 * slipping). Only the first case gets a message — the second renders
 * nothing at all, since "you're fine" isn't advice, it's silence.
 */
export default async function CapacitySettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [
    { data: capacity, error: capacityError },
    { data: suggestionRows, error: suggestionError },
    { data: periodRows, error: periodError },
    { count: capacityRatingCount, error: historyError },
  ] = await Promise.all([
    supabase
      .from("v_user_capacity")
      .select("active_goal_count, active_goal_limit, recent_capacity_mean")
      .eq("user_id", userId)
      .maybeSingle(),
    // app.suggest_goal_limit_change, via 0019's public wrapper — app
    // schema isn't PostgREST-reachable directly.
    supabase.rpc("suggest_goal_limit_change"),
    supabase.rpc("current_checkin_period"),
    // Distinguishes "not enough history" from "nothing to suggest" —
    // see this file's own doc comment. Mirrors
    // app.suggest_goal_limit_change's own definition of "history": the
    // last 3 *submitted* check-ins with a capacity_rating, not just any
    // check-in row.
    supabase
      .from("check_ins")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("submitted_at", "is", null)
      .not("capacity_rating", "is", null),
  ]);

  if (capacityError) {
    throw new Error(capacityError.message);
  }
  if (suggestionError) {
    throw new Error(suggestionError.message);
  }
  if (periodError) {
    throw new Error(periodError.message);
  }
  if (historyError) {
    throw new Error(historyError.message);
  }

  const suggestion = suggestionRows?.[0] ?? null;
  const period = periodRows?.[0] ?? null;

  let dismissed = false;
  if (suggestion && period) {
    const { data: dismissal, error: dismissalError } = await supabase
      .from("capacity_suggestion_dismissals")
      .select("id")
      .eq("user_id", userId)
      .eq("period_start", period.period_start)
      .maybeSingle();
    if (dismissalError) {
      throw new Error(dismissalError.message);
    }
    dismissed = dismissal != null;
  }

  // Only fetched when actually needed — a "raise" suggestion has no
  // picker, and there may be no live suggestion at all most of the time.
  let activeGoals: { id: string; title: string }[] = [];
  if (suggestion?.direction === "lower" && !dismissed) {
    const { data: goals, error: goalsError } = await supabase
      .from("goals")
      .select("id, title")
      .eq("owner_id", userId)
      .eq("state", "active")
      .is("deleted_at", null)
      .order("title", { ascending: true });
    if (goalsError) {
      throw new Error(goalsError.message);
    }
    activeGoals = goals ?? [];
  }

  const hasEnoughHistory =
    (capacityRatingCount ?? 0) >= MIN_HISTORY_FOR_SUGGESTIONS;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Capacity</h1>
        <p className="text-muted-foreground text-sm">
          How many active goals you take on at once, and what your recent
          check-ins say about whether that number is right.
        </p>
      </div>

      {capacity && (
        <CapacitySettings
          activeGoalCount={capacity.active_goal_count ?? 0}
          activeGoalLimit={capacity.active_goal_limit ?? 5}
          recentCapacityMean={capacity.recent_capacity_mean}
        />
      )}

      {suggestion && !dismissed ? (
        <CapacitySuggestion
          direction={suggestion.direction === "raise" ? "raise" : "lower"}
          reason={suggestion.reason}
          currentLimit={suggestion.current_limit}
          activeGoals={activeGoals}
        />
      ) : !hasEnoughHistory ? (
        <p className="text-muted-foreground text-sm">
          Not enough check-in history yet to suggest anything — needs at
          least {MIN_HISTORY_FOR_SUGGESTIONS} weeks of capacity ratings.
        </p>
      ) : null}
    </div>
  );
}
