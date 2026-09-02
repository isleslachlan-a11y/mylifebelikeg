/**
 * P5.4's two llama narrations — "Fluffy narrates the summary; Derek
 * narrates the abandoned list. Neither editorialises about the
 * abandonments — state them and move on." (brief, verbatim). Rendered
 * directly through `LlamaMessage` (speaker + body), not through
 * `src/lib/llamas/copy.ts`'s enumerable-variant system: these aren't
 * discrete trigger events with a handful of interchangeable phrasings
 * the way `TriggerCode`s are — they're one narration each, built from
 * real numbers computed for this exact year, same reasoning
 * `capacity-suggestion.tsx` already gives for rendering its own
 * DB-sourced reason text directly rather than re-templating it through
 * that layer.
 */

export function describeYearSummaryFluffy({
  year,
  completedCount,
  abandonedCount,
  carriedForwardCount,
}: {
  year: number;
  completedCount: number;
  abandonedCount: number;
  carriedForwardCount: number;
}): string {
  if (
    completedCount === 0 &&
    abandonedCount === 0 &&
    carriedForwardCount === 0
  ) {
    return `${year} doesn't have anything in it yet — this page fills in as the year does.`;
  }

  const bits: string[] = [
    `${completedCount} goal${completedCount === 1 ? "" : "s"} finished`,
  ];
  if (abandonedCount > 0) {
    bits.push(`${abandonedCount} let go`);
  }
  if (carriedForwardCount > 0) {
    bits.push(`${carriedForwardCount} still open`);
  }

  return `${year}, in short: ${bits.join(", ")}. Every one of them real, whatever happened to it.`;
}

/**
 * States the count and names them — nothing about *why* beyond what the
 * goal's own `abandon_reason` already says elsewhere on the page (this
 * function never reads or repeats it), and nothing about whether
 * abandoning was a good call. "State them and move on" (brief) — this
 * is the "state them" half; the page renders each reason as plain text
 * immediately after, not folded into Derek's own sentence.
 */
export function describeAbandonedListDerek(
  abandoned: { title: string }[],
): string {
  if (abandoned.length === 0) {
    return "Nothing abandoned this year. Not every year needs one.";
  }
  const titles = abandoned.map((g) => g.title).join(", ");
  return `${abandoned.length} goal${abandoned.length === 1 ? "" : "s"} abandoned this year: ${titles}.`;
}
