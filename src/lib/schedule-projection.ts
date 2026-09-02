import { toGoalOffset } from "./dates";

/**
 * P5.2's pure display-side logic for "what slipping actually costs" —
 * `app.goal_projected_end`/`app.preview_task_slip` (0021/0023) do the
 * real computation in Postgres; this only formats their output, same
 * boundary `rag.ts`/`budget-variance.ts` already draw for their own
 * DB-computed numbers. No React/DOM, no dates math beyond `toGoalOffset`
 * — everything here takes already-resolved bare "YYYY-MM-DD" strings.
 */

/**
 * "Projected 14 March, target 1 March — 13 days over." (brief, verbatim)
 * — a single self-contained sentence, not a dt/dd pair, so it reads
 * correctly wherever it's placed (`goals/[id]/page.tsx` puts it directly
 * beside the target-date summary, per the brief). `formatDate` is the
 * caller's own timezone-aware formatter (`src/lib/dates.ts`'s
 * `formatDate`), injected rather than imported, so this module stays
 * timezone-free like the rest of `dates.ts`'s pure-math half.
 *
 * Returns `null` when there's nothing to project (no tasks with dates
 * yet) — rendering nothing is correct there, not a placeholder sentence.
 */
export function describeProjectedEnd(
  projectedEnd: string | null,
  targetDate: string | null,
  formatDate: (date: string) => string,
): string | null {
  if (!projectedEnd) return null;
  if (!targetDate) {
    return `Projected ${formatDate(projectedEnd)}.`;
  }

  const gapDays = toGoalOffset(projectedEnd, targetDate);
  if (gapDays === 0) {
    return `Projected ${formatDate(projectedEnd)}, target ${formatDate(targetDate)} — right on target.`;
  }
  const gap =
    gapDays > 0
      ? `${gapDays} day${gapDays === 1 ? "" : "s"} over`
      : `${Math.abs(gapDays)} day${Math.abs(gapDays) === 1 ? "" : "s"} to spare`;
  return `Projected ${formatDate(projectedEnd)}, target ${formatDate(targetDate)} — ${gap}.`;
}

export type FloatSummary = {
  /** Not on the critical path, but part of a dependency network (`total_float_days` is a real, non-null number). */
  slackCount: number;
  /** `is_critical` — zero float, the chain that actually drives the projected end. */
  criticalCount: number;
};

/** Minimal shape `summarizeFloat` needs — matches `tasks`'s own CPM-derived columns loosely typed, not the full generated `Row`. */
export type FloatTaskInput = {
  is_critical: boolean;
  total_float_days: number | null;
};

/**
 * "3 tasks have slack; 4 are on the critical path." (brief, verbatim) —
 * `null` means "no dependency network at all" (every task's
 * `total_float_days` is null, `task-edit-panel.tsx`'s own per-task "No
 * dependency network yet" line already covers that case one level
 * down), not "zero of either." A cancelled task's `total_float_days` is
 * already null too (0021's own final step: cancelled tasks are reset to
 * null/false, "sit outside the network") — trusted here rather than
 * re-filtered by `status`, since that's the database's own invariant to
 * keep, not this function's job to re-derive.
 */
export function summarizeFloat(tasks: FloatTaskInput[]): FloatSummary | null {
  const scheduled = tasks.filter((t) => t.total_float_days != null);
  if (scheduled.length === 0) return null;

  return {
    slackCount: scheduled.filter((t) => !t.is_critical).length,
    criticalCount: scheduled.filter((t) => t.is_critical).length,
  };
}

/** "3 tasks have slack; 4 are on the critical path." — slack first, critical second, matching the brief's own order. */
export function describeFloatSummary(summary: FloatSummary): string {
  const slack = `${summary.slackCount} task${summary.slackCount === 1 ? "" : "s"} ${summary.slackCount === 1 ? "has" : "have"} slack`;
  const critical = `${summary.criticalCount} ${summary.criticalCount === 1 ? "is" : "are"} on the critical path`;
  return `${slack}; ${critical}.`;
}
