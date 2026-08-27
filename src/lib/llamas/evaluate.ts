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
  const { data } = await supabase
    .from("llama_messages")
    .select("id")
    .eq("user_id", userId)
    .eq("trigger_code", trigger)
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .is("dismissed_at", null)
    .limit(1)
    .maybeSingle();
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
  const { data } = await supabase
    .from("llama_messages")
    .select("id")
    .eq("user_id", userId)
    .in("trigger_code", triggers)
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .gte("created_at", sinceIso)
    .limit(1)
    .maybeSingle();
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
  const { data: goals } = await supabase
    .from("goals")
    .select("id, title")
    .eq("state", "active")
    .is("deleted_at", null);

  for (const goal of goals ?? []) {
    const { data: snapshots } = await supabase
      .from("rag_snapshots")
      .select("computed_at, overall_status")
      .eq("goal_id", goal.id)
      .order("computed_at", { ascending: false })
      .limit(2);

    if (!snapshots || snapshots.length < 2) continue;
    const latest = snapshots[0]!;
    const previous = snapshots[1]!;

    const newSeverity = SEVERITY[latest.overall_status];
    const oldSeverity = SEVERITY[previous.overall_status];
    if (newSeverity == null || oldSeverity == null || newSeverity === oldSeverity) {
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
  const { data: goals } = await supabase
    .from("goals")
    .select("id, title")
    .eq("state", "active")
    .is("deleted_at", null);
  if (!goals || goals.length === 0) return;

  const { data: ragRows } = await supabase
    .from("v_goal_rag")
    .select("goal_id, inputs")
    .in(
      "goal_id",
      goals.map((g) => g.id),
    );
  const ragByGoal = new Map(
    (ragRows ?? [])
      .filter((r) => r.goal_id != null)
      .map((r) => [r.goal_id as string, r]),
  );

  for (const goal of goals) {
    const rag = ragByGoal.get(goal.id);
    if (!rag || !isUndefinedGoal(rag)) continue;

    if (await hasUndismissedMessage(supabase, userId, "goal_undefined", "goal", goal.id)) {
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
  const [{ data: tasks }, { data: activeGoals }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, goal_id, status, computed_end")
      .eq("owner_id", userId)
      .is("deleted_at", null)
      .not("computed_end", "is", null),
    supabase.from("goals").select("id").eq("state", "active").is("deleted_at", null),
  ]);

  const activeGoalIds = new Set((activeGoals ?? []).map((g) => g.id));

  for (const task of tasks ?? []) {
    if (!activeGoalIds.has(task.goal_id)) continue;
    if (task.status === "done" || task.status === "cancelled") continue;
    if (!task.computed_end || !isOverdue(task.computed_end, today)) continue;

    if (await hasUndismissedMessage(supabase, userId, "task_overdue", "task", task.id)) {
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
  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, target_amount_minor, created_at, start_date, target_date")
    .eq("state", "active")
    .eq("funding", "spend_against")
    .is("deleted_at", null);
  if (!goals || goals.length === 0) return;

  const { data: fundingRows } = await supabase
    .from("v_goal_funding")
    .select("goal_id, spent_minor")
    .in(
      "goal_id",
      goals.map((g) => g.id),
    );
  const fundingByGoal = new Map(
    (fundingRows ?? [])
      .filter((f): f is { goal_id: string; spent_minor: number | null } => f.goal_id != null)
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

    if (await hasUndismissedMessage(supabase, userId, "budget_exceeded", "goal", goal.id)) {
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

/** checkin_due — the current period is open, unsubmitted, and ends within 2 days. */
async function evaluateCheckinDue(
  supabase: SupabaseServerClient,
  userId: string,
  today: string,
): Promise<void> {
  const { data: periodRows } = await supabase.rpc("current_checkin_period");
  const period = periodRows?.[0];
  if (!period) return;

  const daysLeft = toGoalOffset(period.period_end, today);
  if (daysLeft < 0 || daysLeft > 2) return;

  const { data: checkIn } = await supabase
    .from("check_ins")
    .select("submitted_at")
    .eq("user_id", userId)
    .eq("period_start", period.period_start)
    .maybeSingle();
  if (checkIn?.submitted_at) return;

  if (await hasUndismissedMessage(supabase, userId, "checkin_due", "profile", userId)) {
    return;
  }
  await emitLlamaMessage(userId, "checkin_due", { daysLeft }, { type: "profile", id: userId });
}

/** checkin_streak — hits exactly 4, 12, 26, or 52 (app.checkin_streak via v_checkin_streak, 0015). */
async function evaluateCheckinStreak(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const { data: streakRow } = await supabase
    .from("v_checkin_streak")
    .select("streak")
    .eq("user_id", userId)
    .maybeSingle();
  const streak = streakRow?.streak;
  if (streak == null || !STREAK_MILESTONES.includes(streak)) return;

  if (await hasUndismissedMessage(supabase, userId, "checkin_streak", "profile", userId)) {
    return;
  }
  await emitLlamaMessage(userId, "checkin_streak", { weeks: streak }, { type: "profile", id: userId });
}

/** capacity_exceeded — active goal count at or over the limit (P1.7's `>=`, not v_user_capacity.over_limit's strict `>` — see this file's history in goals/actions.ts). */
async function evaluateCapacityExceeded(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const { data: capacity } = await supabase
    .from("v_user_capacity")
    .select("active_goal_count, active_goal_limit")
    .eq("user_id", userId)
    .maybeSingle();
  if (!capacity) return;

  const count = capacity.active_goal_count ?? 0;
  const limit = capacity.active_goal_limit ?? 0;
  if (limit <= 0 || count < limit) return;

  if (await hasUndismissedMessage(supabase, userId, "capacity_exceeded", "profile", userId)) {
    return;
  }
  const percentOver = Math.round(((count - limit) / limit) * 100);
  await emitLlamaMessage(userId, "capacity_exceeded", { percentOver }, { type: "profile", id: userId });
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
 * goal_completed isn't evaluated here even though P4.6's own trigger
 * table lists it: it's already emitted inline, exactly once, at the
 * moment transitionGoalState actually completes a goal
 * (goals/actions.ts) — that's strictly more precise than detecting it
 * by polling, and reimplementing it here would risk a second message
 * for the same completion. Speaker/priority still come from the
 * registry either way (emitLlamaMessage always looks them up) — this
 * is only about *where* the trigger condition gets checked.
 */
export async function evaluateLlamaTriggers(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("llama_evaluated_at, timezone")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return;

  const lastEvaluated = profile.llama_evaluated_at
    ? new Date(profile.llama_evaluated_at).getTime()
    : 0;
  if (Date.now() - lastEvaluated < DEBOUNCE_MS) {
    return;
  }

  await supabase
    .from("profiles")
    .update({ llama_evaluated_at: new Date().toISOString() })
    .eq("id", userId);

  const today = todayInZone(profile.timezone, new Date());

  await Promise.all([
    evaluateGoalStatusChanges(supabase, userId),
    evaluateGoalUndefined(supabase, userId),
    evaluateTaskOverdue(supabase, userId, today),
    evaluateBudgetExceeded(supabase, userId),
    evaluateCheckinDue(supabase, userId, today),
    evaluateCheckinStreak(supabase, userId),
    evaluateCapacityExceeded(supabase, userId),
  ]);
}
