import { redirect } from "next/navigation";

import { surfaceDreamForCheckin } from "@/app/(app)/dreams/actions";
import { deriveThumbPath } from "@/lib/storage/dream-photos";
import { getSignedDreamPhotoUrl } from "@/lib/storage/dream-photos-server";
import {
  computeScheduleVariance,
  formatScheduleVariance,
} from "@/lib/schedule-variance";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { CheckInView } from "./check-in-view";
import type { CheckInGoal } from "./goal-rating-card";
import type { SurfacedDream } from "./dream-prompt";

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
    [
      { data: checkIn, error: checkInError },
      { data: streakRow },
      { data: goals, error: goalsError },
      { data: ratings, error: ratingsError },
    ],
    surfacedDreamResult,
  ] = await Promise.all([
    Promise.all([
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
    ]),
    // P8.5: "weekly, as part of the check-in, one dream surfaced" —
    // fetched alongside everything else above rather than after it, so
    // this doesn't add its own extra round trip's worth of latency to
    // the page.
    surfaceDreamForCheckin(checkInId),
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

  // The surfaced dream's own photo -- resolved server-side, same
  // "signed once, handed down as a plain prop" shape dreams/page.tsx's
  // own grid thumbnails already use, rather than a client-side fetch.
  //
  // P8.7: a failed `surfaceDreamForCheckin` degrades to "no dream
  // surfaced" rather than failing the whole check-in page -- the prompt
  // is a bonus on top of the check-in's real purpose (rating goals), not
  // core to it. Logged rather than silently dropped either way, matching
  // this app's standing "log failures, don't swallow them invisibly"
  // rule -- found live with nothing here to catch a real RPC/query
  // failure and leave a trace of it.
  if (!surfacedDreamResult.ok) {
    console.error(
      "surfaceDreamForCheckin failed",
      surfacedDreamResult.error,
    );
  }
  let surfacedDream: SurfacedDream | null = null;
  if (surfacedDreamResult.ok && surfacedDreamResult.data) {
    const dream = surfacedDreamResult.data;
    let photoUrl: string | null = null;
    if (dream.image_source === "upload" && dream.storage_path) {
      photoUrl = await getSignedDreamPhotoUrl(
        supabase,
        deriveThumbPath(dream.storage_path),
      );
    } else if (dream.unsplash_thumb_url) {
      photoUrl = dream.unsplash_thumb_url;
    }
    surfacedDream = {
      id: dream.id,
      title: dream.title,
      roughCostMinor: dream.rough_cost_minor,
      currency: dream.currency,
      photoUrl,
    };
  }

  return (
    <CheckInView
      checkInId={checkInId}
      periodEnd={checkIn.period_end}
      streak={streakRow?.streak ?? 0}
      goals={checkInGoals}
      initialCapacityRating={checkIn.capacity_rating}
      initialOverallNote={checkIn.note ?? ""}
      initiallySubmitted={checkIn.submitted_at != null}
      surfacedDream={surfacedDream}
    />
  );
}
