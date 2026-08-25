import { isOverdue, toGoalOffset } from "@/lib/dates";

/**
 * The four-way visual classification P3.4's colour rule is keyed off —
 * "Completed items in the star token, in-progress in primary, overdue in
 * rag-red, not-started in border-subtle." Deliberately derived from
 * dates + `is_complete` alone, not from `tasks.status`'s richer enum
 * (`not_started`/`in_progress`/`blocked`/`done`/`cancelled`): that enum
 * isn't available here — `v_timeline_items.status` is the *parent
 * goal's* state, denormalized for filtering (see the 0011 migration),
 * not each item's own status — and P1.11's `goal-timeline.tsx` already
 * establishes the precedent of deciding "overdue" from dates rather than
 * the status enum, so this follows the same convention rather than
 * introducing a second one.
 *
 * Pure, no React/DOM — same convention as the rest of `timeline/`.
 */
export type ItemVisualStatus =
  "completed" | "overdue" | "in_progress" | "not_started";

export type ClassifiableItem = {
  /** Bare "YYYY-MM-DD". */
  starts_on: string;
  /** Bare "YYYY-MM-DD". */
  ends_on: string;
  is_complete: boolean;
};

/**
 * @param today Bare "YYYY-MM-DD", timezone-resolved and computed once
 *   per request by the caller (PHASE-3-REQUIREMENTS.MD's R2) — never
 *   `new Date()`/`Date.now()` here.
 */
export function classifyItemStatus(
  item: ClassifiableItem,
  today: string,
): ItemVisualStatus {
  if (item.is_complete) return "completed";
  if (isOverdue(item.ends_on, today)) return "overdue";
  const hasStarted = toGoalOffset(item.starts_on, today) <= 0;
  return hasStarted ? "in_progress" : "not_started";
}
