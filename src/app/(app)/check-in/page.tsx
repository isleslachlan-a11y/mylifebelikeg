import { redirect } from "next/navigation";

import {
  computeScheduleVariance,
  formatScheduleVariance,
} from "@/lib/schedule-variance";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { CheckInView } from "./check-in-view";
import type { CheckInGoal } from "./goal-rating-card";

/**
 * The weekly check-in (P4.1). On open, get-or-create this period's
 * check-in via `ensure_current_checkin` (0015's public wrapper over
 * 0014's `app.ensure_current_checkin`) — never an insert straight into
 * `check_ins`, and the period itself is never computed here: it's
 * derived server-side, in the database, from `check_in_day` and the
 * user's timezone (0014's `app.current_checkin_period`), which is the
 * whole reason that function exists rather than reusing dates.ts's
 * `todayInZone` plus some JS date math.
 *
 * "Editable until the period ends, then read-only" (P4.1 brief) falls
 * out of this for free rather than needing its own check: this page
 * always operates on whatever `ensure_current_checkin` returns, which by
 * construction is always the currently-open window. Once that window
 * closes, a reload here opens the *next* period's check-in instead —
 * there is no route in this package for reopening a past one for
 * editing, only for the current one.
 */
export default async function CheckInPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const { data: checkInId, error: ensureError } = await supabase.rpc(
    "ensure_current_checkin",
  );
  if (ensureError || !checkInId) {
    throw new Error(
      ensureError?.message ?? "Couldn't open this week's check-in.",
    );
  }

  const [
    { data: checkIn, error: checkInError },
    { data: streakRow },
    { data: goals, error: goalsError },
    { data: ratings, error: ratingsError },
  ] = await Promise.all([
    supabase.from("check_ins").select("*").eq("id", checkInId).single(),
    supabase
      .from("v_checkin_streak")
      .select("streak")
      .eq("user_id", userId)
      .maybeSingle(),
    // Active goals the viewer participates in — goals_select's RLS
    // (owner OR active goal_participants row) is exactly "am I a
    // participant on this goal" (P4.1 brief: "rate only goals where the
    // user is a participant"), so no extra owner_id filter goes on top —
    // same reasoning goals/page.tsx's shared-goals query documents.
    supabase
      .from("goals")
      .select("id, title, created_at, start_date, target_date")
      .eq("state", "active")
      .is("deleted_at", null)
      .order("target_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("goal_ratings")
      .select("goal_id, score, note")
      .eq("check_in_id", checkInId)
      .eq("user_id", userId),
  ]);

  if (checkInError || !checkIn) {
    throw new Error(
      checkInError?.message ?? "Couldn't load this week's check-in.",
    );
  }
  if (goalsError || !goals) {
    throw new Error(goalsError?.message ?? "Couldn't load your goals.");
  }
  if (ratingsError) {
    throw new Error(ratingsError.message);
  }

  // Task progress inputs for schedule variance — same flat-query-then-
  // tally pattern as goals/page.tsx, no progress view exists yet.
  const goalIds = goals.map((g) => g.id);
  const tasksByGoal: Record<
    string,
    {
      durationDays: number;
      status: Database["public"]["Enums"]["task_status"];
    }[]
  > = {};
  if (goalIds.length > 0) {
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("goal_id, status, duration_days")
      .in("goal_id", goalIds)
      .is("deleted_at", null);
    if (tasksError) {
      throw new Error(tasksError.message);
    }
    for (const task of tasks ?? []) {
      (tasksByGoal[task.goal_id] ??= []).push({
        durationDays: task.duration_days,
        status: task.status,
      });
    }
  }

  const ratingsByGoal = new Map((ratings ?? []).map((r) => [r.goal_id, r]));

  const checkInGoals: CheckInGoal[] = goals.map((goal) => {
    const variance = computeScheduleVariance({
      createdAt: goal.created_at,
      startDate: goal.start_date,
      targetDate: goal.target_date,
      tasks: tasksByGoal[goal.id] ?? [],
    });
    const existing = ratingsByGoal.get(goal.id);
    return {
      id: goal.id,
      title: goal.title,
      scheduleVarianceText:
        variance == null ? null : formatScheduleVariance(variance),
      initialScore: existing?.score ?? null,
      initialNote: existing?.note ?? "",
    };
  });

  return (
    <CheckInView
      checkInId={checkInId}
      periodEnd={checkIn.period_end}
      streak={streakRow?.streak ?? 0}
      goals={checkInGoals}
      initialCapacityRating={checkIn.capacity_rating}
      initialOverallNote={checkIn.note ?? ""}
      initiallySubmitted={checkIn.submitted_at != null}
    />
  );
}
