import type { Database } from "@/types/database";

export type RagStatus = Database["public"]["Enums"]["rag_status"];
export type GoalRag = Database["public"]["Views"]["v_goal_rag"]["Row"];

/**
 * A defensive, loosely-typed view onto `compute_goal_rag`'s `inputs`
 * jsonb (0014/0016) — every key is optional because `inputs` is a plain
 * `Json` column with no schema of its own; read it defensively rather
 * than assuming a key survived whatever branch of `app.compute_goal_rag`
 * produced this row (the grace-period and undefined-goal branches, for
 * instance, only ever set `reason`/`today`).
 */
export type GoalRagInputs = {
  reason?: "grace_period" | "undefined_goal";
  today?: string;
  elapsed_pct?: number;
  progress_pct?: number;
  task_weight_total?: number;
  task_weight_done?: number;
  overdue_milestones?: number;
  overdue_critical_tasks?: number;
  rating_count?: number;
  missed_streak?: number;
  is_underfunded?: boolean;
  owner_timezone?: string;
};

export function ragInputs(rag: Pick<GoalRag, "inputs">): GoalRagInputs {
  return (rag.inputs ?? {}) as GoalRagInputs;
}

/**
 * Goals under 14 days old (P4.2 brief) — `app.compute_goal_rag` returns
 * green across the board unconditionally, but that's "too new to mean
 * anything" rather than a real signal, so the UI renders "new" and no
 * colour at all rather than a green dot it hasn't earned yet.
 */
export function isGracePeriod(rag: Pick<GoalRag, "inputs">): boolean {
  return ragInputs(rag).reason === "grace_period";
}

/**
 * No tasks and no budget (P4.2 brief: "grey means undefined"). The
 * message this pairs with is a prompt to define the goal, not a
 * warning — there's nothing to have gone wrong, there's just nothing to
 * measure yet.
 */
export function isUndefinedGoal(rag: Pick<GoalRag, "inputs">): boolean {
  return ragInputs(rag).reason === "undefined_goal";
}

/**
 * Schedule green, momentum red — worst-wins already collapses this into
 * a plain red `overall_status` with no explanation of why (P4.2 brief:
 * "the tasks on the goal don't reflect the real work — boxes are being
 * ticked that aren't the thing"). Checked directly against the two
 * dimensions rather than inferred from overall_status, since the same
 * red overall can arise from schedule or budget alone with no mismatch
 * to report.
 */
export function hasScheduleMomentumMismatch(
  rag: Pick<GoalRag, "schedule_status" | "momentum_status">,
): boolean {
  return rag.schedule_status === "green" && rag.momentum_status === "red";
}

/** Never shown alone (P4.2 brief: colour always pairs with a label). */
export const RAG_LABEL: Record<RagStatus, string> = {
  green: "On track",
  amber: "At risk",
  red: "Off track",
  grey: "Undefined",
};

function round(n: number): number {
  return Math.round(n);
}

/**
 * "22% behind" / "4% ahead" / "on track" — a shorter sibling of
 * `schedule-variance.ts`'s `formatScheduleVariance` (which reads "22%
 * behind schedule"): this one is meant to follow a "Schedule:" label
 * that already says what dimension it is, so repeating "schedule" in
 * the phrase itself would be redundant. Kept as its own function rather
 * than reusing that one, since v_goal_rag's numbers come straight from
 * `app.compute_goal_rag` itself — the authority schedule-variance.ts's
 * own top comment says its JS transcription can drift from.
 */
export function describeVariance(pp: number): string {
  const rounded = round(pp);
  if (Math.abs(rounded) <= 5) return "on track";
  return rounded < 0 ? `${Math.abs(rounded)}% behind` : `${rounded}% ahead`;
}

/**
 * "22% behind — 4 of 12 tasks done, 61% elapsed" (P4.2 brief, verbatim
 * example). `taskCounts` is raw task counts (done/total, cancelled
 * excluded) — deliberately not `inputs.task_weight_done/total`, which
 * are duration-weighted sums used for the variance calculation itself,
 * not the plain "N of M tasks" count the brief's example shows.
 */
export function describeScheduleDimension(
  rag: Pick<GoalRag, "schedule_variance_pp" | "inputs">,
  taskCounts: { done: number; total: number } | null,
): string {
  if (rag.schedule_variance_pp == null) {
    return "No schedule data yet.";
  }
  const inputs = ragInputs(rag);
  const parts: string[] = [];
  if (taskCounts) {
    parts.push(`${taskCounts.done} of ${taskCounts.total} tasks done`);
  }
  if (inputs.elapsed_pct != null) {
    parts.push(`${round(inputs.elapsed_pct)}% elapsed`);
  }
  if (inputs.overdue_milestones) {
    parts.push(
      `${inputs.overdue_milestones} overdue milestone${inputs.overdue_milestones === 1 ? "" : "s"}`,
    );
  }
  if (inputs.overdue_critical_tasks) {
    parts.push(
      `${inputs.overdue_critical_tasks} overdue critical task${inputs.overdue_critical_tasks === 1 ? "" : "s"}`,
    );
  }

  const variance = describeVariance(rag.schedule_variance_pp);
  return parts.length > 0 ? `${variance} — ${parts.join(", ")}` : variance;
}

/**
 * save_toward reads "40% funded to date"; spend_against reads "22% over
 * pace — 61% elapsed", mirroring `budget-variance.ts`'s two formulas
 * (Schema.MD's RAG table) but sourced from the live view instead of the
 * JS transcription.
 */
export function describeBudgetDimension(
  rag: Pick<GoalRag, "budget_variance_pp" | "inputs">,
  funding: Database["public"]["Enums"]["funding_type"],
): string {
  // funding = "none" always has a null budget_variance_pp too (compute_goal_rag
  // never populates it outside the save_toward/spend_against branches), so
  // this check alone already covers that case correctly.
  if (rag.budget_variance_pp == null) {
    return "No budget data yet.";
  }
  if (funding === "save_toward") {
    return `${round(rag.budget_variance_pp)}% funded to date`;
  }

  const pp = round(rag.budget_variance_pp);
  const pace =
    Math.abs(pp) <= 5
      ? "on pace"
      : pp > 0
        ? `${pp}% over pace`
        : `${Math.abs(pp)}% under pace`;
  const elapsed = ragInputs(rag).elapsed_pct;
  return elapsed != null ? `${pace} — ${round(elapsed)}% elapsed` : pace;
}

/**
 * "4.2 average of the last 3 ratings", or the not-enough-history case
 * `app.compute_goal_rag` itself uses (momentum stays grey below 3
 * ratings) — `rating_count` from `inputs` distinguishes "0 ratings" from
 * "1-2 ratings" rather than collapsing both into one message.
 */
export function describeMomentumDimension(
  rag: Pick<GoalRag, "momentum_mean" | "inputs">,
): string {
  if (rag.momentum_mean != null) {
    return `${rag.momentum_mean.toFixed(1)} average of the last 3 ratings`;
  }
  const count = ragInputs(rag).rating_count ?? 0;
  return count > 0
    ? `${count} rating${count === 1 ? "" : "s"} so far — need 3 for a signal`
    : "No ratings yet.";
}
