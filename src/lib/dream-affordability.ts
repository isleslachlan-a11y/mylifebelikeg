import type { Database } from "@/types/database";

export type DreamAffordabilityRow =
  Database["public"]["Views"]["v_dream_affordability"]["Row"];

function monthsLabel(n: number): string {
  return `${n} month${n === 1 ? "" : "s"}`;
}

/** "X" / "X and Y" / "X, Y, and Z" -- plain factual list, no house style beyond correct grammar (Derek doesn't editorialize about which goal matters more, per the brief's own "a prompt to talk, never a verdict" instinct rating-trend.ts's describeDivergence already follows for a different pairing). */
function listGoalTitles(titles: string[]): string {
  if (titles.length === 1) return titles[0] ?? "";
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  const last = titles[titles.length - 1];
  return `${titles.slice(0, -1).join(", ")}, and ${last}`;
}

/**
 * "On a dream with a price, show the months-to-afford figure from
 * v_dream_affordability, phrased in plain language rather than a number
 * -- 'at your current rate, about five months away'. Derek delivers
 * this, in his register. He is not discouraging; he is accurate."
 * (P8.3 brief, verbatim.)
 *
 * Deliberately a single, deterministic sentence-builder -- not routed
 * through `getLlamaCopy`'s three-random-variants machinery the way a
 * *triggered* message (P6.6's own standard) needs to be. That system
 * exists because the same static text repeating verbatim every time
 * reads as robotic; this sentence is never static, the numbers inside
 * it are live and different every time it's read, which is what
 * actually keeps it from feeling repeated. Same reasoning `rag.ts`'s
 * `describe*Dimension` functions already follow for the same shape of
 * problem.
 *
 * Does *not* claim to predict which specific goal's RAG would flip
 * amber -- see migration 0033's own comment on why that isn't something
 * this view (or app.compute_goal_rag's actual mechanics) can honestly
 * answer. What it says instead is the real, computable thing: the
 * top-line figure assumes 100% of your capacity is free for this, and
 * here's how much of it isn't, and to what.
 */
export function describeDreamAffordability(row: DreamAffordabilityRow): string {
  if (row.cost_base_minor == null || row.monthly_capacity_minor == null) {
    return "No exchange rate on file for that currency yet — can't say how far away it is.";
  }

  const months = row.months_to_afford;
  const realisticMonths = row.realistic_months_to_afford;
  const committed = row.committed_monthly_minor ?? 0;
  const competing = row.competing_goal_titles ?? [];

  if (months === 0) {
    return "You could afford this today, if you wanted it.";
  }

  if (months == null) {
    return "At your current rate, this isn't moving — there's no monthly capacity spare for it right now.";
  }

  // The top-line figure (`months`) already assumes every spare dollar
  // goes toward this one thing -- worth saying plainly when that
  // assumption is actually costing something real.
  if (committed > 0 && competing.length > 0) {
    if (realisticMonths == null) {
      return `At full capacity this is about ${monthsLabel(months)} away. But ${listGoalTitles(competing)} already ${competing.length === 1 ? "claims" : "claim"} what you've got spare — there's nothing left over for this yet.`;
    }
    if (realisticMonths !== months) {
      return `At your current rate, that's about ${monthsLabel(realisticMonths)} away — ${listGoalTitles(competing)} ${competing.length === 1 ? "is" : "are"} already using some of what would go toward this.`;
    }
  }

  return `At your current rate, that's about ${monthsLabel(months)} away.`;
}
