import { formatMoney } from "@/lib/money";
import type { Database } from "@/types/database";

type TripEstimate = Database["public"]["Views"]["v_trip_estimates"]["Row"];

/**
 * "Roll up estimates from v_trip_estimates: stops total, legs total,
 * combined, and total nights, against the goal's target amount" (P6.3
 * brief, verbatim) — read straight off the view, nothing recomputed
 * here (CLAUDE.md: never recompute what a view already computed).
 * "This is where trip budgets actually blow out, so surface leg costs
 * prominently" (brief) — legs gets its own stat, not folded silently
 * into the combined total.
 */
export function TripEstimates({
  estimate,
  targetAmountMinor,
  goalCurrency,
}: {
  estimate: TripEstimate | null;
  targetAmountMinor: number | null;
  goalCurrency: string;
}) {
  if (!estimate || !estimate.currency) {
    return null;
  }

  const total = estimate.total_estimate_minor ?? 0;
  const overBudget = targetAmountMinor != null && total > targetAmountMinor;

  return (
    <div className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-lg p-4 ring-1">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat
          label="Stops"
          value={formatMoney(
            estimate.stops_estimate_minor ?? 0,
            estimate.currency,
          )}
        />
        <Stat
          label="Legs"
          value={formatMoney(
            estimate.legs_estimate_minor ?? 0,
            estimate.currency,
          )}
          emphasize
        />
        <Stat label="Combined" value={formatMoney(total, estimate.currency)} />
        <Stat label="Nights" value={`${estimate.total_nights ?? 0}`} />
      </div>
      {targetAmountMinor != null && (
        <p
          className={
            overBudget
              ? "text-destructive text-sm"
              : "text-muted-foreground text-sm"
          }
        >
          {overBudget
            ? `${formatMoney(total - targetAmountMinor, goalCurrency)} over the ${formatMoney(targetAmountMinor, goalCurrency)} target.`
            : `${formatMoney(targetAmountMinor - total, goalCurrency)} left of the ${formatMoney(targetAmountMinor, goalCurrency)} target.`}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={emphasize ? "font-display text-lg" : "text-lg"}>
        {value}
      </span>
    </div>
  );
}
