import { LlamaMessage } from "@/components/llama-message";
import { getLlamaCopy } from "@/lib/llamas/copy";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Every figure here comes straight from v_monthly_cashflow — never
 * recomputed (CLAUDE.md: "weekly is 52/12 months, not 4, and that error
 * compounds"). income - expense = capacity by construction in the view
 * itself, so this component only ever formats and lays out numbers it's
 * given, it doesn't derive any of them.
 *
 * The shortfall message is rendered directly from live data on every
 * load, not written to llama_messages and dismissed — the brief is
 * explicit ("Don't hide it"): it should reappear for as long as capacity
 * stays at or below zero, not go away because someone clicked past it once.
 */
export function CapacityCard({
  incomeMonthlyMinor,
  expenseMonthlyMinor,
  capacityMinor,
  currency,
}: {
  incomeMonthlyMinor: number;
  expenseMonthlyMinor: number;
  capacityMinor: number;
  currency: string;
}) {
  const isShortfall = capacityMinor <= 0;

  return (
    <div className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-xl p-4 ring-1">
      <h2 className="text-muted-foreground text-sm font-medium">
        Monthly capacity
      </h2>

      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex items-baseline justify-between">
          <dt className="text-muted-foreground">Income</dt>
          <dd>{formatMoney(incomeMonthlyMinor, currency)}</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-muted-foreground">Expenses</dt>
          <dd>&minus;{formatMoney(expenseMonthlyMinor, currency)}</dd>
        </div>
        <div className="border-foreground/10 flex items-baseline justify-between border-t pt-1.5 text-base font-medium">
          <dt>Capacity</dt>
          <dd className={cn(isShortfall && "text-destructive")}>
            {formatMoney(capacityMinor, currency)}
          </dd>
        </div>
      </dl>

      {isShortfall && (
        <LlamaMessage
          speaker="derek"
          body={getLlamaCopy("capacity_shortfall", {
            capacityMinor,
            currency,
          })}
        />
      )}
    </div>
  );
}
