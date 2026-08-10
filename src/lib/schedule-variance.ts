import { toGoalOffset } from "./dates";

/**
 * Schedule variance: progress% − elapsed%, in percentage points.
 *
 * This is a faithful transcription of `app.compute_goal_rag()`'s schedule
 * dimension (read directly from the live database — not reinvented), not
 * an independent reimplementation of the idea. It exists here at all
 * because that function isn't reachable from the app: it lives in the
 * `app` Postgres schema, and this project's PostgREST only exposes
 * `public`/`graphql_public` (confirmed against the live project — calling
 * it via `Content-Profile: app` returns `PGRST106: Invalid schema`).
 * There's no `public`-schema wrapper for it either. If the SQL in
 * `app.compute_goal_rag` ever changes, this needs to change with it —
 * that's a real, standing drift risk this file can't fix on its own.
 *
 * No RAG colours here on purpose (Phase 1 has schedule data only — see
 * P1.7's notes) — just the raw number, or null.
 */

export type ScheduleVarianceTaskStatus =
  "not_started" | "in_progress" | "blocked" | "done" | "cancelled";

export type ScheduleVarianceTask = {
  durationDays: number;
  status: ScheduleVarianceTaskStatus;
};

export type ElapsedInput = {
  /** goals.created_at (timestamptz). */
  createdAt: string;
  /** goals.start_date (bare date), or null. */
  startDate: string | null;
  /** goals.target_date (bare date), or null. */
  targetDate: string | null;
  now?: Date;
};

export type ScheduleVarianceInput = ElapsedInput & {
  /** Every non-deleted task on the goal, any status. */
  tasks: ScheduleVarianceTask[];
};

const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * The grace-period + elapsed% half of `app.compute_goal_rag()` — shared
 * by computeScheduleVariance below (the schedule dimension) and
 * budget-variance.ts's computeBudgetVariance (the budget dimension, P2.5):
 * both dimensions read the identical "how far through the goal's
 * timeline are we" expression in the SQL, so it's transcribed once here
 * and reused rather than duplicated with a real risk of the two copies
 * drifting apart from each other (on top of the existing risk of drifting
 * from the SQL itself, noted in this file's top comment).
 *
 * Returns null under the same conditions the rest of this file does:
 * still within the 14-day grace period, or missing a start or target date.
 */
export function computeElapsedPercent(input: ElapsedInput): number | null {
  const now = input.now ?? new Date();

  const createdAt = new Date(input.createdAt);
  if (createdAt.getTime() > now.getTime() - GRACE_PERIOD_MS) {
    return null;
  }

  if (!input.startDate || !input.targetDate) {
    return null;
  }

  // Postgres `current_date` runs in the database session's timezone,
  // which is UTC on this project (confirmed live) — not the viewer's
  // profile timezone. toISOString().slice(0, 10) is UTC by definition,
  // so it matches current_date exactly rather than approximating it.
  const today = now.toISOString().slice(0, 10);

  if (input.targetDate <= input.startDate) {
    return 100;
  }
  const totalDays = toGoalOffset(input.targetDate, input.startDate);
  const elapsedDays = toGoalOffset(today, input.startDate);
  return Math.max(0, Math.min(100, (elapsedDays / totalDays) * 100));
}

/**
 * Returns null — never 0 — whenever `app.compute_goal_rag` itself
 * wouldn't produce a number: the goal is under 14 days old (grace
 * period, unconditionally green with no variance), it's missing a start
 * or target date, or it has no tasks (excluding cancelled) to measure
 * progress against. A goal with a real 0pp variance is indistinguishable
 * from "nothing to show" by design — 0% reads as "on track", so showing
 * it when there's genuinely no signal would be worse than showing
 * nothing.
 */
export function computeScheduleVariance(
  input: ScheduleVarianceInput,
): number | null {
  const elapsedPct = computeElapsedPercent(input);
  if (elapsedPct == null) {
    return null;
  }

  // Duration-weighted, floor 1 day per task (a zero-duration task still
  // counts, rather than vanishing from the calc) — matches
  // greatest(duration_days, 1) in the SQL.
  const counted = input.tasks.filter((t) => t.status !== "cancelled");
  const taskTotal = counted.reduce(
    (sum, t) => sum + Math.max(t.durationDays, 1),
    0,
  );
  if (taskTotal <= 0) {
    return null;
  }
  const taskDone = counted
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + Math.max(t.durationDays, 1), 0);

  const progressPct = (taskDone / taskTotal) * 100;
  return round2(progressPct - elapsedPct);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * "12% behind schedule" / "4% ahead" / "on track" (within ±5pp) — a
 * neutral number with direction, deliberately not a colour. Callers
 * should render nothing at all when computeScheduleVariance returns
 * null; this function only handles the "there is a number" case.
 */
export function formatScheduleVariance(variancePp: number): string {
  const rounded = Math.round(variancePp);
  if (Math.abs(rounded) <= 5) {
    return "on track";
  }
  return rounded < 0
    ? `${Math.abs(rounded)}% behind schedule`
    : `${rounded}% ahead`;
}
