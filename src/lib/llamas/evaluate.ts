import type { PostgrestError } from "@supabase/supabase-js";

import type { createClient } from "@/lib/supabase/server";
import { isOverdue, toGoalOffset, todayInZone } from "@/lib/dates";
import { isUndefinedGoal } from "@/lib/rag";
import { computeElapsedPercent } from "@/lib/schedule-variance";
import { emitLlamaMessage } from "./emit";
import type { TriggerCode } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const DEBOUNCE_MS = 60 * 60 * 1000; // one hour, per brief
const STREAK_MILESTONES = [4, 12, 26, 52];
const SEVERITY: Record<string, number> = { green: 1, amber: 2, red: 3 };

/**
 * P5.5's Supabase-call audit: every query below already treats a
 * failure as "found nothing" (a bare `?? []` or `if (!x) return`)
 * rather than crashing — the right behaviour for a best-effort
 * background pass that must never block whatever real action (a
 * check-in submit, a dashboard load) triggered it. What was missing was
 * any record that a failure happened at all: a silently-empty result
 * and a genuinely-empty one were indistinguishable server-side. This
 * wraps every query so a real failure is at least observable, without
 * changing what the caller does with the result — `logged(...)` is a
 * drop-in replacement for reading `.data` off the awaited query.
 */
function logged<T>(
  result: { data: T; error: PostgrestError | null },
  context: string,
): T {
  if (result.error) {
    console.error(`evaluateLlamaTriggers: ${context} failed`, result.error);
  }
  return result.data;
}

/**
 * The whole reason the inbox doesn't fill with sixty copies of the same
 * overdue task (brief, verbatim): a message for this exact
 * (trigger, resource) pair already exists and hasn't been dismissed —
 * skip. This is the dedupe rule for the *level*-triggered conditions
 * (goal_undefined, task_overdue, budget_exceeded, checkin_due,
 * checkin_streak, capacity_exceeded), which stay true continuously
 * rather than firing on a discrete transition — once dismissed, a
 * still-true condition is free to notify again later, which is the
 * right behaviour for an ongoing problem (a task overdue for a month
 * probably should remind you again after you've dismissed it once).
 */
async function hasUndismissedMessage(
  supabase: SupabaseServerClient,
  userId: string,
  trigger: TriggerCode,
  resourceType: string,
  resourceId: string,
): Promise<boolean> {
  const data = logged(
    await supabase
      .from("llama_messages")
      .select("id")
      .eq("user_id", userId)
      .eq("trigger_code", trigger)
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .is("dismissed_at", null)
      .limit(1)
      .maybeSingle(),
    "hasUndismissedMessage",
  );
  return data != null;
}

/**
 * The dedupe rule for the *edge*-triggered conditions (goal_red/amber/
 * green/improved) — these compare the two most recent rag_snapshots, so
 * re-running the same comparison (e.g. a dashboard load minutes after
 * the message was dismissed, with no new check-in in between) would
 * otherwise re-detect the identical, already-reported transition.
 * "Already reported" here means any message of this trigger family for
 * this goal was created at or after the newest snapshot being compared
 * — regardless of dismissed state, unlike hasUndismissedMessage above.
 * A genuinely later transition (a newer snapshot from a subsequent
 * check-in) always has a newer `computed_at` than that message's
 * `created_at`, so it's never blocked by this.
 */
async function hasReportedSince(
  supabase: SupabaseServerClient,
  userId: string,
  triggers: TriggerCode[],
  resourceType: string,
  resourceId: string,
  sinceIso: string,
): Promise<boolean> {
  const data = logged(
    await supabase
      .from("llama_messages")
      .select("id")
      .eq("user_id", userId)
      .in("trigger_code", triggers)
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .gte("created_at", sinceIso)
      .limit(1)
      .maybeSingle(),
    "hasReportedSince",
  );
  return data != null;
}

/**
 * goal_red / goal_amber (worsened) and goal_green / goal_improved
 * (improved) — compares each active goal's two most recent
 * rag_snapshots (P4.4: "this is why snapshots exist rather than
 * computing on read alone"). Grey is excluded from the comparison
 * entirely: it isn't a rank on the same scale as green/amber/red
 * (goal_undefined is its own separate trigger for that), and a pair
 * involving it has no well-defined "worse"/"better" direction.
 */
async function evaluateGoalStatusChanges(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const goals = logged(
    await supabase
      .from("goals")
      .select("id, title")
      .eq("state", "active")
      .is("deleted_at", null),
    "evaluateGoalStatusChanges: goals",
  );

  for (const goal of goals ?? []) {
    const snapshots = logged(
      await supabase
        .from("rag_snapshots")
        .select("computed_at, overall_status")
        .eq("goal_id", goal.id)
        .order("computed_at", { ascending: false })
        .limit(2),
      "evaluateGoalStatusChanges: snapshots",
    );

    if (!snapshots || snapshots.length < 2) continue;
    const latest = snapshots[0]!;
    const previous = snapshots[1]!;

    const newSeverity = SEVERITY[latest.overall_status];
    const oldSeverity = SEVERITY[previous.overall_status];
    if (
      newSeverity == null ||
      oldSeverity == null ||
      newSeverity === oldSeverity
    ) {
      continue;
    }

    const worsened = newSeverity > oldSeverity;
    const trigger: TriggerCode = worsened
      ? latest.overall_status === "red"
        ? "goal_red"
        : "goal_amber"
      : latest.overall_status === "green"
        ? "goal_green"
        : "goal_improved";

    const alreadyReported = await hasReportedSince(
      supabase,
      userId,
      ["goal_red", "goal_amber", "goal_green", "goal_improved"],
      "goal",
      goal.id,
      latest.computed_at,
    );
    if (alreadyReported) continue;

    await emitLlamaMessage(
      userId,
      trigger,
      { goalTitle: goal.title },
      { type: "goal", id: goal.id },
    );
  }
}

/** goal_undefined — grey overall_status, which app.compute_goal_rag only ever produces for a goal already past its 14-day grace period (P4.2's rag.ts doc), so no separate age check is needed here. */
async function evaluateGoalUndefined(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const goals = logged(
    await supabase
      .from("goals")
      .select("id, title")
      .eq("state", "active")
      .is("deleted_at", null),
    "evaluateGoalUndefined: goals",
  );
  if (!goals || goals.length === 0) return;

  const ragRows = logged(
    await supabase
      .from("v_goal_rag")
      .select("goal_id, inputs")
      .in(
        "goal_id",
        goals.map((g) => g.id),
      ),
    "evaluateGoalUndefined: ragRows",
  );
  const ragByGoal = new Map(
    (ragRows ?? [])
      .filter((r) => r.goal_id != null)
      .map((r) => [r.goal_id as string, r]),
  );

  for (const goal of goals) {
    const rag = ragByGoal.get(goal.id);
    if (!rag || !isUndefinedGoal(rag)) continue;

    if (
      await hasUndismissedMessage(
        supabase,
        userId,
        "goal_undefined",
        "goal",
        goal.id,
      )
    ) {
      continue;
    }
    await emitLlamaMessage(
      userId,
      "goal_undefined",
      { goalTitle: goal.title },
      { type: "goal", id: goal.id },
    );
  }
}

/** task_overdue — incomplete, past computed_end, on an active goal, assigned to this user. */
async function evaluateTaskOverdue(
  supabase: SupabaseServerClient,
  userId: string,
  today: string,
): Promise<void> {
  const [tasksResult, activeGoalsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, goal_id, status, computed_end")
      .eq("owner_id", userId)
      .is("deleted_at", null)
      .not("computed_end", "is", null),
    supabase
      .from("goals")
      .select("id")
      .eq("state", "active")
      .is("deleted_at", null),
  ]);
  const tasks = logged(tasksResult, "evaluateTaskOverdue: tasks");
  const activeGoals = logged(
    activeGoalsResult,
    "evaluateTaskOverdue: activeGoals",
  );

  const activeGoalIds = new Set((activeGoals ?? []).map((g) => g.id));

  for (const task of tasks ?? []) {
    if (!activeGoalIds.has(task.goal_id)) continue;
    if (task.status === "done" || task.status === "cancelled") continue;
    if (!task.computed_end || !isOverdue(task.computed_end, today)) continue;

    if (
      await hasUndismissedMessage(
        supabase,
        userId,
        "task_overdue",
        "task",
        task.id,
      )
    ) {
      continue;
    }
    const daysOverdue = toGoalOffset(today, task.computed_end);
    await emitLlamaMessage(
      userId,
      "task_overdue",
      { taskTitle: task.title, daysOverdue },
      { type: "task", id: task.id },
    );
  }
}

/**
 * budget_exceeded — a spend_against goal whose actual spend has gone
 * past its target (Schema.MD's "forced red" list: "spend already over
 * target"). Deliberately doesn't also cover v_allocation_summary's
 * over_allocated (P2.4): that one is rendered live from real data on
 * every load by design (funding-section.tsx/money/page.tsx's own
 * comments — "so it can't be hidden while still true"), and persisting
 * a dismissable message for the same fact would undo exactly that.
 */
async function evaluateBudgetExceeded(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const goals = logged(
    await supabase
      .from("goals")
      .select(
        "id, title, target_amount_minor, created_at, start_date, target_date",
      )
      .eq("state", "active")
      .eq("funding", "spend_against")
      .is("deleted_at", null),
    "evaluateBudgetExceeded: goals",
  );
  if (!goals || goals.length === 0) return;

  const fundingRows = logged(
    await supabase
      .from("v_goal_funding")
      .select("goal_id, spent_minor")
      .in(
        "goal_id",
        goals.map((g) => g.id),
      ),
    "evaluateBudgetExceeded: fundingRows",
  );
  const fundingByGoal = new Map(
    (fundingRows ?? [])
      .filter(
        (f): f is { goal_id: string; spent_minor: number | null } =>
          f.goal_id != null,
      )
      .map((f) => [f.goal_id, f]),
  );

  for (const goal of goals) {
    if (goal.target_amount_minor == null) continue;
    const spentMinor = fundingByGoal.get(goal.id)?.spent_minor;
    if (spentMinor == null || spentMinor <= goal.target_amount_minor) continue;

    const elapsedPct = computeElapsedPercent({
      createdAt: goal.created_at,
      startDate: goal.start_date,
      targetDate: goal.target_date,
    });
    if (elapsedPct == null) continue;

    if (
      await hasUndismissedMessage(
        supabase,
        userId,
        "budget_exceeded",
        "goal",
        goal.id,
      )
    ) {
      continue;
    }
    await emitLlamaMessage(
      userId,
      "budget_exceeded",
      {
        goalTitle: goal.title,
        spentPercent: Math.round((spentMinor / goal.target_amount_minor) * 100),
        elapsedPercent: Math.round(elapsedPct),
      },
      { type: "goal", id: goal.id },
    );
  }
}

/**
 * goal_projected_late (P5.2) — `v_goal_projected_end` (0021/0023's
 * `app.goal_projected_end`, the CPM scheduler's own honest read of
 * where the tasks actually land) run past the goal's own `target_date`.
 * The schedule/money pair to `budget_exceeded`'s money-side trigger:
 * same "the number says so, plainly" shape, one dimension over. A goal
 * with no `target_date` has nothing to be late against and is skipped —
 * "projected end" alone isn't a problem, only "later than what was
 * promised" is.
 */
async function evaluateGoalProjectedLate(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const goals = logged(
    await supabase
      .from("goals")
      .select("id, title, target_date")
      .eq("state", "active")
      .is("deleted_at", null)
      .not("target_date", "is", null),
    "evaluateGoalProjectedLate: goals",
  );
  if (!goals || goals.length === 0) return;

  const projectedRows = logged(
    await supabase
      .from("v_goal_projected_end")
      .select("goal_id, projected_end")
      .in(
        "goal_id",
        goals.map((g) => g.id),
      ),
    "evaluateGoalProjectedLate: projectedRows",
  );
  const projectedByGoal = new Map(
    (projectedRows ?? [])
      .filter(
        (r): r is { goal_id: string; projected_end: string } =>
          r.goal_id != null && r.projected_end != null,
      )
      .map((r) => [r.goal_id, r.projected_end]),
  );

  for (const goal of goals) {
    if (!goal.target_date) continue;
    const projectedEnd = projectedByGoal.get(goal.id);
    if (!projectedEnd) continue; // no tasks yet, or none with dates — nothing projected

    const daysLate = toGoalOffset(projectedEnd, goal.target_date);
    if (daysLate <= 0) continue;

    if (
      await hasUndismissedMessage(
        supabase,
        userId,
        "goal_projected_late",
        "goal",
        goal.id,
      )
    ) {
      continue;
    }
    await emitLlamaMessage(
      userId,
      "goal_projected_late",
      { goalTitle: goal.title, daysLate },
      { type: "goal", id: goal.id },
    );
  }
}

/** checkin_due — the current period is open, unsubmitted, and ends within 2 days. */
async function evaluateCheckinDue(
  supabase: SupabaseServerClient,
  userId: string,
  today: string,
): Promise<void> {
  const periodRows = logged(
    await supabase.rpc("current_checkin_period"),
    "evaluateCheckinDue: periodRows",
  );
  const period = periodRows?.[0];
  if (!period) return;

  const daysLeft = toGoalOffset(period.period_end, today);
  if (daysLeft < 0 || daysLeft > 2) return;

  const checkIn = logged(
    await supabase
      .from("check_ins")
      .select("submitted_at")
      .eq("user_id", userId)
      .eq("period_start", period.period_start)
      .maybeSingle(),
    "evaluateCheckinDue: checkIn",
  );
  if (checkIn?.submitted_at) return;

  if (
    await hasUndismissedMessage(
      supabase,
      userId,
      "checkin_due",
      "profile",
      userId,
    )
  ) {
    return;
  }
  await emitLlamaMessage(
    userId,
    "checkin_due",
    { daysLeft },
    { type: "profile", id: userId },
  );
}

/** checkin_streak — hits exactly 4, 12, 26, or 52 (app.checkin_streak via v_checkin_streak, 0015). */
async function evaluateCheckinStreak(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const streakRow = logged(
    await supabase
      .from("v_checkin_streak")
      .select("streak")
      .eq("user_id", userId)
      .maybeSingle(),
    "evaluateCheckinStreak: streakRow",
  );
  const streak = streakRow?.streak;
  if (streak == null || !STREAK_MILESTONES.includes(streak)) return;

  if (
    await hasUndismissedMessage(
      supabase,
      userId,
      "checkin_streak",
      "profile",
      userId,
    )
  ) {
    return;
  }
  await emitLlamaMessage(
    userId,
    "checkin_streak",
    { weeks: streak },
    { type: "profile", id: userId },
  );
}

/** capacity_exceeded — active goal count at or over the limit (P1.7's `>=`, not v_user_capacity.over_limit's strict `>` — see this file's history in goals/actions.ts). */
async function evaluateCapacityExceeded(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const capacity = logged(
    await supabase
      .from("v_user_capacity")
      .select("active_goal_count, active_goal_limit")
      .eq("user_id", userId)
      .maybeSingle(),
    "evaluateCapacityExceeded: capacity",
  );
  if (!capacity) return;

  const count = capacity.active_goal_count ?? 0;
  const limit = capacity.active_goal_limit ?? 0;
  if (limit <= 0 || count < limit) return;

  if (
    await hasUndismissedMessage(
      supabase,
      userId,
      "capacity_exceeded",
      "profile",
      userId,
    )
  ) {
    return;
  }
  const percentOver = Math.round(((count - limit) / limit) * 100);
  await emitLlamaMessage(
    userId,
    "capacity_exceeded",
    { percentOver },
    { type: "profile", id: userId },
  );
}

type ActiveTripGoal = {
  goalId: string;
  tripId: string;
  title: string;
  targetAmountMinor: number | null;
};

/**
 * Shared by all three trip evaluators below (P6.6) — same two-query,
 * in-memory-join shape `evaluateGoalUndefined` already uses for
 * goals-plus-a-related-table, rather than a PostgREST embedded-resource
 * filter (not a pattern used elsewhere in this codebase — see
 * CLAUDE.md). No `userId` parameter: the request-scoped `supabase`
 * client is already authenticated as that user, so `goals_select`'s RLS
 * scopes this correctly on its own, same as every other goal-level
 * evaluator in this file.
 */
async function fetchActiveTripGoals(
  supabase: SupabaseServerClient,
): Promise<ActiveTripGoal[]> {
  const goals = logged(
    await supabase
      .from("goals")
      .select("id, title, target_amount_minor")
      .eq("kind", "trip")
      .eq("state", "active")
      .is("deleted_at", null),
    "fetchActiveTripGoals: goals",
  );
  if (!goals || goals.length === 0) return [];

  const trips = logged(
    await supabase
      .from("trips")
      .select("id, goal_id")
      .in(
        "goal_id",
        goals.map((g) => g.id),
      )
      .is("deleted_at", null),
    "fetchActiveTripGoals: trips",
  );

  const goalById = new Map(goals.map((g) => [g.id, g]));
  const result: ActiveTripGoal[] = [];
  for (const trip of trips ?? []) {
    const goal = trip.goal_id ? goalById.get(trip.goal_id) : undefined;
    if (!goal) continue;
    result.push({
      goalId: goal.id,
      tripId: trip.id,
      title: goal.title,
      targetAmountMinor: goal.target_amount_minor,
    });
  }
  return result;
}

const TRIP_BOOKED_STATES = new Set(["booked", "done"]);

/**
 * trip_booked (P6.6) — every stop *and* every leg on an active trip is
 * `booking_state` 'booked' or 'done'. A trip with no stops and no legs
 * yet is excluded on purpose: vacuously "everything is booked" (because
 * there's nothing to book) isn't the same as actually locked in.
 */
async function evaluateTripBooked(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const trips = await fetchActiveTripGoals(supabase);
  if (trips.length === 0) return;
  const tripIds = trips.map((t) => t.tripId);

  const [stopsResult, legsResult] = await Promise.all([
    supabase
      .from("trip_stops")
      .select("trip_id, booking_state")
      .in("trip_id", tripIds)
      .is("deleted_at", null),
    supabase
      .from("trip_legs")
      .select("trip_id, booking_state")
      .in("trip_id", tripIds)
      .is("deleted_at", null),
  ]);
  const stops = logged(stopsResult, "evaluateTripBooked: stops");
  const legs = logged(legsResult, "evaluateTripBooked: legs");

  for (const trip of trips) {
    const tripStops = (stops ?? []).filter((s) => s.trip_id === trip.tripId);
    const tripLegs = (legs ?? []).filter((l) => l.trip_id === trip.tripId);
    if (tripStops.length === 0 && tripLegs.length === 0) continue;

    const allBooked =
      tripStops.every((s) => TRIP_BOOKED_STATES.has(s.booking_state)) &&
      tripLegs.every((l) => TRIP_BOOKED_STATES.has(l.booking_state));
    if (!allBooked) continue;

    if (
      await hasUndismissedMessage(
        supabase,
        userId,
        "trip_booked",
        "goal",
        trip.goalId,
      )
    ) {
      continue;
    }
    await emitLlamaMessage(
      userId,
      "trip_booked",
      { tripTitle: trip.title },
      { type: "goal", id: trip.goalId },
    );
  }
}

/**
 * trip_over_budget (P6.6) — `v_trip_estimates.total_estimate_minor`
 * (every stop and leg, converted to the goal's own currency — see
 * that view's own doc) past the trip goal's `target_amount_minor`. The
 * stops/legs-aware sibling of `budget_exceeded`, which only ever reads
 * `v_goal_funding`'s ledger-derived spend.
 */
async function evaluateTripOverBudget(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const trips = (await fetchActiveTripGoals(supabase)).filter(
    (t) => t.targetAmountMinor != null,
  );
  if (trips.length === 0) return;

  const estimates = logged(
    await supabase
      .from("v_trip_estimates")
      .select("trip_id, total_estimate_minor, currency")
      .in(
        "trip_id",
        trips.map((t) => t.tripId),
      ),
    "evaluateTripOverBudget: estimates",
  );
  const estimateByTrip = new Map(
    (estimates ?? [])
      .filter((e) => e.trip_id != null)
      .map((e) => [e.trip_id as string, e]),
  );

  for (const trip of trips) {
    const estimate = estimateByTrip.get(trip.tripId);
    if (
      !estimate ||
      estimate.total_estimate_minor == null ||
      !estimate.currency
    ) {
      continue;
    }
    if (estimate.total_estimate_minor <= trip.targetAmountMinor!) continue;

    if (
      await hasUndismissedMessage(
        supabase,
        userId,
        "trip_over_budget",
        "goal",
        trip.goalId,
      )
    ) {
      continue;
    }
    await emitLlamaMessage(
      userId,
      "trip_over_budget",
      {
        tripTitle: trip.title,
        overMinor: estimate.total_estimate_minor - trip.targetAmountMinor!,
        currency: estimate.currency,
      },
      { type: "goal", id: trip.goalId },
    );
  }
}

const STOP_UNBOOKED_WINDOW_DAYS = 30;

/** stop_unbooked_soon (P6.6 brief, verbatim) — a stop within 30 days still at `booking_state: 'idea'`. */
async function evaluateStopUnbookedSoon(
  supabase: SupabaseServerClient,
  userId: string,
  today: string,
): Promise<void> {
  const trips = await fetchActiveTripGoals(supabase);
  if (trips.length === 0) return;
  const titleByTripId = new Map(trips.map((t) => [t.tripId, t.title]));

  const stops = logged(
    await supabase
      .from("trip_stops")
      .select("id, trip_id, name, computed_arrival")
      .in(
        "trip_id",
        trips.map((t) => t.tripId),
      )
      .eq("booking_state", "idea")
      .is("deleted_at", null)
      .not("computed_arrival", "is", null),
    "evaluateStopUnbookedSoon: stops",
  );

  for (const stop of stops ?? []) {
    if (!stop.computed_arrival || !stop.trip_id) continue;
    const tripTitle = titleByTripId.get(stop.trip_id);
    if (!tripTitle) continue;

    const daysUntil = toGoalOffset(stop.computed_arrival, today);
    if (daysUntil < 0 || daysUntil > STOP_UNBOOKED_WINDOW_DAYS) continue;

    if (
      await hasUndismissedMessage(
        supabase,
        userId,
        "stop_unbooked_soon",
        "trip_stop",
        stop.id,
      )
    ) {
      continue;
    }
    await emitLlamaMessage(
      userId,
      "stop_unbooked_soon",
      { stopName: stop.name, tripTitle, daysUntil },
      { type: "trip_stop", id: stop.id },
    );
  }
}

// "Quarterly" as a report-throttle window, not a literal calendar
// quarter boundary — 85 days comfortably avoids re-firing before the
// next one genuinely arrives without needing to track calendar-quarter
// edges the way the monthly recap below tracks calendar months.
const DREAM_PRUNE_REPORT_WINDOW_DAYS = 85;

/**
 * dream_prune_available (P8.5) — "a quarterly prune... dreams untouched
 * for over a year, offered as a batch." `v_dream_prune_candidates`
 * (0035) already is the eligibility rule; this only decides *whether to
 * say so*, throttled to roughly once a quarter via `hasReportedSince`
 * rather than `hasUndismissedMessage` — the underlying condition (some
 * dream sitting untouched) stays true continuously, exactly the "level"
 * shape hasUndismissedMessage is for, but re-firing the instant a
 * dismissed notice's condition is still true would mean "dismiss today,
 * see it again tomorrow," wrong for a genuinely quarterly cadence. A
 * fresh count each time (not cached from the last report) — if the
 * batch was partly cleared last quarter, this reports what's actually
 * still there now, not a stale number.
 */
async function evaluateDreamPruneAvailable(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const candidates = logged(
    await supabase
      .from("v_dream_prune_candidates")
      .select("dream_id")
      .eq("user_id", userId),
    "evaluateDreamPruneAvailable: candidates",
  );
  const count = candidates?.length ?? 0;
  if (count === 0) return;

  const since = new Date(
    Date.now() - DREAM_PRUNE_REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  if (
    await hasReportedSince(
      supabase,
      userId,
      ["dream_prune_available"],
      "profile",
      userId,
      since,
    )
  ) {
    return;
  }

  await emitLlamaMessage(
    userId,
    "dream_prune_available",
    { count },
    { type: "profile", id: userId },
  );
}

/**
 * dreams_achieved_recap (P8.5) — "Fluffy's counterweight... a monthly
 * note on what was achieved in the period, and the total value of
 * dreams achieved to date." Two independent numbers: `thisMonthCount`
 * gates whether anything's worth saying at all (no achievements this
 * month, no recap — Fluffy doesn't send an empty one), `totalValueMinor`
 * is the lifetime sum regardless of when each dream was achieved, via
 * the same stamped `cost_base_minor` P8.3 already established (an
 * unpriced achieved dream contributes nothing to the total, not an
 * error). `achieved_at`'s own calendar day is read from its UTC ISO
 * string directly rather than converted through the user's timezone —
 * for a monthly cadence a same-day boundary case is a genuinely trivial
 * imprecision, not worth a full timezone conversion here.
 * `hasReportedSince` throttles to once per calendar month, using the
 * user-local month boundary (`today`, already timezone-resolved by the
 * caller) as the cutoff.
 */
async function evaluateDreamsAchievedRecap(
  supabase: SupabaseServerClient,
  userId: string,
  today: string,
): Promise<void> {
  const monthStart = `${today.slice(0, 7)}-01`;

  const achieved = logged(
    await supabase
      .from("someday_items")
      .select("achieved_at, cost_base_minor")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .not("achieved_at", "is", null),
    "evaluateDreamsAchievedRecap: achieved",
  );
  if (!achieved || achieved.length === 0) return;

  const thisMonthCount = achieved.filter(
    (d) => d.achieved_at != null && d.achieved_at.slice(0, 10) >= monthStart,
  ).length;
  if (thisMonthCount === 0) return;

  const totalValueMinor = achieved.reduce(
    (sum, d) => sum + (d.cost_base_minor ?? 0),
    0,
  );

  const profile = logged(
    await supabase
      .from("profiles")
      .select("base_currency")
      .eq("id", userId)
      .maybeSingle(),
    "evaluateDreamsAchievedRecap: profile",
  );
  const currency = profile?.base_currency ?? "AUD";

  if (
    await hasReportedSince(
      supabase,
      userId,
      ["dreams_achieved_recap"],
      "profile",
      userId,
      `${monthStart}T00:00:00.000Z`,
    )
  ) {
    return;
  }

  await emitLlamaMessage(
    userId,
    "dreams_achieved_recap",
    { count: thisMonthCount, totalValueMinor, currency },
    { type: "profile", id: userId },
  );
}

/**
 * Runs every wired trigger for one user (P4.6). Debounced to at most
 * once an hour per user (brief, verbatim) via `profiles.llama_evaluated_at`
 * (0020) — the timestamp is claimed *before* the checks run, not after,
 * so two near-simultaneous calls (a check-in submit and a dashboard load
 * landing seconds apart) don't both do the full pass; this is an
 * advisory feature, not a correctness-critical one, so the small race
 * window that leaves is an acceptable trade for not needing a lock.
 *
 * goal_completed/trip_completed aren't evaluated here even though
 * P4.6's own trigger table lists goal_completed: both are already
 * emitted inline, exactly once, at the moment transitionGoalState
 * actually completes a goal (goals/actions.ts, branching on `kind`
 * between the two) — that's strictly more precise than detecting it by
 * polling, and reimplementing it here would risk a second message for
 * the same completion. first_goal/first_trip/first_budget_set (P6.6)
 * are the same story — each condition is a fresh count of exactly 1,
 * which only ever happens the instant that row is inserted, so they're
 * emitted inline from their own creation actions (goals/actions.ts,
 * trips/actions.ts) rather than polled. Speaker/priority still come
 * from the registry either way (emitLlamaMessage always looks them up)
 * — this is only about *where* the trigger condition gets checked.
 */
export async function evaluateLlamaTriggers(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const profile = logged(
    await supabase
      .from("profiles")
      .select("llama_evaluated_at, timezone")
      .eq("id", userId)
      .maybeSingle(),
    "evaluateLlamaTriggers: profile",
  );
  if (!profile) return;

  const lastEvaluated = profile.llama_evaluated_at
    ? new Date(profile.llama_evaluated_at).getTime()
    : 0;
  if (Date.now() - lastEvaluated < DEBOUNCE_MS) {
    return;
  }

  const { error: claimError } = await supabase
    .from("profiles")
    .update({ llama_evaluated_at: new Date().toISOString() })
    .eq("id", userId);
  if (claimError) {
    console.error(
      "evaluateLlamaTriggers: claiming llama_evaluated_at failed",
      claimError,
    );
  }

  const today = todayInZone(profile.timezone, new Date());

  await Promise.all([
    evaluateGoalStatusChanges(supabase, userId),
    evaluateGoalUndefined(supabase, userId),
    evaluateTaskOverdue(supabase, userId, today),
    evaluateBudgetExceeded(supabase, userId),
    evaluateGoalProjectedLate(supabase, userId),
    evaluateCheckinDue(supabase, userId, today),
    evaluateCheckinStreak(supabase, userId),
    evaluateCapacityExceeded(supabase, userId),
    evaluateTripBooked(supabase, userId),
    evaluateTripOverBudget(supabase, userId),
    evaluateStopUnbookedSoon(supabase, userId, today),
    evaluateDreamPruneAvailable(supabase, userId),
    evaluateDreamsAchievedRecap(supabase, userId, today),
  ]);
}
