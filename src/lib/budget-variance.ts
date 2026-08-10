import { computeElapsedPercent, type ElapsedInput } from "./schedule-variance";
import { formatMoney } from "./money";

/**
 * Budget variance: the budget dimension of `app.compute_goal_rag()`, the
 * same kind of faithful transcription schedule-variance.ts is for the
 * schedule dimension (see that file's top comment for why this lives in
 * application code at all — the function itself isn't reachable via
 * PostgREST). Schema.MD's RAG table gives the two formulas this
 * transcribes:
 *
 *   save_toward:   saved ÷ required-to-date
 *   spend_against: spend% − elapsed%
 *
 * No RAG colours here either — Phase 1/2 only has schedule and budget
 * data, momentum has none until Phase 4 (P2.5 brief), so this returns a
 * neutral number or null, same treatment as computeScheduleVariance.
 *
 * "required-to-date" is elapsed% × target_amount_minor — pure
 * proportion-of-a-single-known-amount arithmetic, not a currency
 * conversion (target_amount_minor, contributed_minor and spent_minor all
 * already share one currency, goal.currency, straight off v_goal_funding
 * — nothing here ever combines two different currencies, so CLAUDE.md's
 * "never compute money in application code" isn't in tension with it any
 * more than computeScheduleVariance's progress% arithmetic already was).
 */
export type BudgetVarianceInput = ElapsedInput & {
  funding: "save_toward" | "spend_against";
  /** goals.target_amount_minor. */
  targetAmountMinor: number | null;
  /** v_goal_funding.contributed_minor — save_toward only. */
  contributedMinor: number | null;
  /** v_goal_funding.spent_minor — spend_against only. */
  spentMinor: number | null;
};

export type BudgetVarianceResult =
  | {
      kind: "save_toward";
      requiredToDateMinor: number;
      contributedMinor: number;
      /** contributed ÷ required-to-date, as a whole percent. */
      percent: number;
    }
  | {
      kind: "spend_against";
      /** spend% − elapsed%, in percentage points. */
      variancePp: number;
    };

/**
 * Null whenever there's no target to measure against, or (via
 * computeElapsedPercent) the goal is within its 14-day grace period or
 * missing a start/target date — same "no number is better than a
 * misleading one" rule computeScheduleVariance follows.
 */
export function computeBudgetVariance(
  input: BudgetVarianceInput,
): BudgetVarianceResult | null {
  if (input.targetAmountMinor == null || input.targetAmountMinor <= 0) {
    return null;
  }

  const elapsedPct = computeElapsedPercent(input);
  if (elapsedPct == null) {
    return null;
  }

  if (input.funding === "save_toward") {
    const requiredToDateMinor = Math.round(
      (elapsedPct / 100) * input.targetAmountMinor,
    );
    // Nothing required yet (the goal's timeline hasn't really started) —
    // contributed ÷ 0 is undefined, not a real percentage, so this stays
    // null rather than showing a nonsensical Infinity or 0%.
    if (requiredToDateMinor <= 0) {
      return null;
    }
    const contributedMinor = input.contributedMinor ?? 0;
    const percent = Math.round((contributedMinor / requiredToDateMinor) * 100);
    return {
      kind: "save_toward",
      requiredToDateMinor,
      contributedMinor,
      percent,
    };
  }

  const spentMinor = input.spentMinor ?? 0;
  const spentPct = (spentMinor / input.targetAmountMinor) * 100;
  return { kind: "spend_against", variancePp: round2(spentPct - elapsedPct) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * "£3,000 of £7,500 needed by now — 40%" for save_toward, "22% over
 * pace" / "6% under pace" / "on pace" for spend_against — a neutral
 * number with direction, deliberately not a colour, matching
 * formatScheduleVariance's ±5pp "on track" band for the spend_against
 * case (the two dimensions share the same RAG thresholds' spirit here:
 * Schema.MD gives spend_against ≤5pp as green).
 */
export function formatBudgetVariance(
  result: BudgetVarianceResult,
  currency: string,
): string {
  if (result.kind === "save_toward") {
    return `${formatMoney(result.contributedMinor, currency)} of ${formatMoney(result.requiredToDateMinor, currency)} needed by now — ${result.percent}%`;
  }

  const rounded = Math.round(result.variancePp);
  if (Math.abs(rounded) <= 5) {
    return "on pace";
  }
  return rounded > 0
    ? `${rounded}% over pace`
    : `${Math.abs(rounded)}% under pace`;
}
