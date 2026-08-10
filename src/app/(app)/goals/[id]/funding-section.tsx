"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LlamaMessage } from "@/components/llama-message";
import { getLlamaCopy } from "@/lib/llamas/copy";
import {
  computeBudgetVariance,
  formatBudgetVariance,
} from "@/lib/budget-variance";
import { COMMON_CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { Database } from "@/types/database";
import { setPledge, type PledgeInput } from "./funding-actions";

type GoalFunding = Database["public"]["Views"]["v_goal_funding"]["Row"];
type GoalAffordability =
  Database["public"]["Views"]["v_goal_affordability"]["Row"];
type AllocationSummary =
  Database["public"]["Views"]["v_allocation_summary"]["Row"];
type FundingType = Database["public"]["Enums"]["funding_type"];

export type MyPledge = {
  pledgedAmountMinor: number | null;
  pledgedCurrency: string | null;
  monthlyAllocationMinor: number | null;
  potId: string | null;
};

export type OtherPledge = {
  userId: string;
  displayName: string;
  pledgedAmountMinor: number | null;
  pledgedCurrency: string | null;
  monthlyAllocationMinor: number | null;
};

const CURRENCY_RE = /^[A-Z]{3}$/;
const NO_POT = "__none__";

/** Whole calendar months added to the *first* of `bareDate`'s month — mirrors the one verified v_goal_affordability data point (001_smoke_test.sql: date_trunc('month', today) + N months for an exact division). Preview only; the saved value always comes from the view. */
function firstOfMonthPlusMonths(bareDate: string, months: number): string {
  const [y, m] = bareDate.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function monthsBetween(days: number): string {
  const months = Math.round(Math.abs(days) / 30.44);
  if (Math.abs(days) < 45) {
    return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
  }
  return `${months} month${months === 1 ? "" : "s"}`;
}

export function FundingSection({
  goalId,
  goalCurrency,
  goalFunding,
  createdAt,
  startDate,
  targetDate,
  today,
  pots,
  myPledge,
  otherPledges,
  funding,
  affordability,
  allocationSummary,
}: {
  goalId: string;
  goalCurrency: string;
  goalFunding: FundingType;
  /** goals.created_at — needed for computeBudgetVariance's grace period, same as computeScheduleVariance. */
  createdAt: string;
  startDate: string | null;
  targetDate: string | null;
  today: string;
  pots: { id: string; name: string; is_default: boolean }[];
  myPledge: MyPledge | null;
  otherPledges: OtherPledge[];
  funding: GoalFunding | null;
  affordability: GoalAffordability | null;
  allocationSummary: AllocationSummary | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // P2.5: the budget dimension alongside P1.7's schedule variance —
  // same neutral-number treatment, no RAG colour (momentum has no data
  // until Phase 4). funding is null for a goal with no v_goal_funding
  // row at all (shouldn't happen once goal.funding !== 'none', but
  // defensive regardless).
  const budgetVariance =
    (goalFunding === "save_toward" || goalFunding === "spend_against") &&
    funding
      ? computeBudgetVariance({
          funding: goalFunding,
          targetAmountMinor: funding.target_amount_minor,
          contributedMinor: funding.contributed_minor,
          spentMinor: funding.spent_minor,
          createdAt,
          startDate,
          targetDate,
        })
      : null;

  const [pledgeAmount, setPledgeAmount] = useState(
    myPledge?.pledgedAmountMinor != null
      ? formatMoney(
          myPledge.pledgedAmountMinor,
          myPledge.pledgedCurrency ?? goalCurrency,
        )
      : "",
  );
  const [monthlyRate, setMonthlyRate] = useState(
    myPledge?.monthlyAllocationMinor != null
      ? formatMoney(
          myPledge.monthlyAllocationMinor,
          myPledge.pledgedCurrency ?? goalCurrency,
        )
      : "",
  );
  const [currency, setCurrency] = useState(
    myPledge?.pledgedCurrency ?? goalCurrency,
  );
  const [potId, setPotId] = useState(
    myPledge?.potId ?? pots.find((p) => p.is_default)?.id ?? NO_POT,
  );

  const currencyOptions = Array.from(
    new Set<string>([...COMMON_CURRENCIES, goalCurrency, currency]),
  );

  // Safe to preview live only when nothing here needs an FX conversion
  // this component doesn't have access to (CLAUDE.md: never compute
  // money in application code). Both checks below rely on the same
  // trick: back my own *already-known, same-currency* old contribution
  // out of an aggregate the relevant view already computed, then add the
  // new one back in — never touching anyone else's amount or currency,
  // and never converting anything myself.
  const myRateKnownInGoalCurrency =
    currency === goalCurrency &&
    (myPledge?.pledgedCurrency == null ||
      myPledge.pledgedCurrency === goalCurrency);
  const myOldRateMinor = myRateKnownInGoalCurrency
    ? (myPledge?.monthlyAllocationMinor ?? 0)
    : null;

  let parsedRateMinor: number | null = null;
  try {
    parsedRateMinor = monthlyRate.trim()
      ? parseMoney(monthlyRate, currency)
      : 0;
  } catch {
    parsedRateMinor = null;
  }

  const preview =
    goalFunding === "save_toward" &&
    affordability &&
    myOldRateMinor !== null &&
    parsedRateMinor !== null &&
    affordability.remaining_minor != null &&
    affordability.monthly_rate_minor != null
      ? (() => {
          const othersRateMinor =
            affordability.monthly_rate_minor! - myOldRateMinor;
          const previewRateMinor = othersRateMinor + parsedRateMinor!;
          if (previewRateMinor <= 0) {
            return { fundedNever: true as const };
          }
          const monthsNeeded = Math.ceil(
            affordability.remaining_minor! / previewRateMinor,
          );
          return {
            fundedNever: false as const,
            date: firstOfMonthPlusMonths(today, monthsNeeded),
          };
        })()
      : null;

  // Same trick, against the viewer's own base currency instead of the
  // goal's currency — an entirely separate equality check, since a
  // pledge can match one, both, or neither.
  const myRateKnownInBaseCurrency =
    allocationSummary != null &&
    currency === allocationSummary.base_currency &&
    (myPledge?.pledgedCurrency == null ||
      myPledge.pledgedCurrency === allocationSummary.base_currency);
  const projectedOverBy =
    allocationSummary &&
    myRateKnownInBaseCurrency &&
    parsedRateMinor !== null &&
    allocationSummary.allocated_minor != null &&
    allocationSummary.monthly_capacity_minor != null
      ? (() => {
          const myOldAllocMinor = myPledge?.monthlyAllocationMinor ?? 0;
          const projectedAllocated =
            allocationSummary.allocated_minor! -
            myOldAllocMinor +
            parsedRateMinor!;
          return projectedAllocated - allocationSummary.monthly_capacity_minor!;
        })()
      : null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!CURRENCY_RE.test(currency)) {
      setError("Currency must be a 3-letter code.");
      return;
    }

    let pledgedAmountMinor: number | null = null;
    if (pledgeAmount.trim()) {
      try {
        pledgedAmountMinor = parseMoney(pledgeAmount, currency);
      } catch {
        setError("Enter a valid pledge amount.");
        return;
      }
    }

    let monthlyAllocationMinor: number | null = null;
    if (monthlyRate.trim()) {
      try {
        monthlyAllocationMinor = parseMoney(monthlyRate, currency);
      } catch {
        setError("Enter a valid monthly rate.");
        return;
      }
    }

    const input: PledgeInput = {
      pledgedAmountMinor,
      monthlyAllocationMinor,
      pledgedCurrency: currency,
      potId: potId === NO_POT ? null : potId,
    };

    startTransition(async () => {
      const result = await setPledge(goalId, input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {funding && (
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Target</dt>
            <dd>
              {funding.target_amount_minor != null
                ? formatMoney(
                    funding.target_amount_minor,
                    funding.currency ?? goalCurrency,
                  )
                : "Not set"}
            </dd>
          </div>
          {goalFunding === "save_toward" && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Pledged</dt>
              <dd className="flex items-center gap-2">
                {formatMoney(
                  funding.pledged_minor ?? 0,
                  funding.currency ?? goalCurrency,
                )}
                {funding.is_underfunded && (
                  <Badge variant="outline" className="text-amber-600">
                    Underfunded
                  </Badge>
                )}
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              {goalFunding === "spend_against" ? "Spent" : "Contributed"}
            </dt>
            <dd>
              {formatMoney(
                (goalFunding === "spend_against"
                  ? funding.spent_minor
                  : funding.contributed_minor) ?? 0,
                funding.currency ?? goalCurrency,
              )}
            </dd>
          </div>
        </dl>
      )}

      {budgetVariance && (
        <p className="text-muted-foreground text-sm">
          {formatBudgetVariance(
            budgetVariance,
            funding?.currency ?? goalCurrency,
          )}
        </p>
      )}

      {goalFunding === "save_toward" && affordability && (
        <div className="bg-card ring-foreground/10 rounded-lg p-3 text-sm ring-1">
          {affordability.affordable_from == null ||
          affordability.monthly_rate_minor === 0 ? (
            <p>
              At{" "}
              {formatMoney(
                affordability.monthly_rate_minor ?? 0,
                affordability.currency ?? goalCurrency,
              )}
              /month, this goal is never funded at the current rate.
            </p>
          ) : (
            <p>
              At{" "}
              {formatMoney(
                affordability.monthly_rate_minor ?? 0,
                affordability.currency ?? goalCurrency,
              )}
              /month, fully funded by{" "}
              {formatDate(affordability.affordable_from, "UTC", {
                month: "long",
                year: "numeric",
              })}
              {targetDate &&
                affordability.slips_by_days != null &&
                affordability.slips_by_days !== 0 && (
                  <>
                    {" — "}
                    {monthsBetween(affordability.slips_by_days)}{" "}
                    {affordability.slips_by_days > 0 ? "after" : "before"} your
                    target date.
                  </>
                )}
            </p>
          )}
        </div>
      )}

      {allocationSummary?.over_allocated && (
        <LlamaMessage
          speaker="derek"
          body={getLlamaCopy("allocation_over_capacity", {
            overMinor: -(allocationSummary.free_minor ?? 0),
            currency: allocationSummary.base_currency ?? goalCurrency,
          })}
        />
      )}

      {goalFunding === "save_toward" && (
        <>
          {otherPledges.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {otherPledges.map((p) => (
                <li
                  key={p.userId}
                  className="flex items-center justify-between"
                >
                  <span>{p.displayName}</span>
                  <span className="text-muted-foreground">
                    {p.pledgedAmountMinor != null
                      ? formatMoney(
                          p.pledgedAmountMinor,
                          p.pledgedCurrency ?? goalCurrency,
                        )
                      : "No pledge"}
                    {p.monthlyAllocationMinor != null &&
                      ` · ${formatMoney(p.monthlyAllocationMinor, p.pledgedCurrency ?? goalCurrency)}/mo`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={handleSubmit}
            className="border-subtle bg-raised flex flex-col gap-3 rounded-lg border p-3 text-sm"
          >
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}

            <p className="text-muted-foreground text-xs font-medium">
              Your pledge
            </p>

            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="pledge-amount">Total pledge</Label>
                <Input
                  id="pledge-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={pledgeAmount}
                  onChange={(e) => setPledgeAmount(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="pledge-rate">Monthly rate</Label>
                <Input
                  id="pledge-rate"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={monthlyRate}
                  onChange={(e) => setMonthlyRate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pledge-currency">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="pledge-currency" className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pledge-pot">From pot</Label>
              <Select value={potId} onValueChange={setPotId}>
                <SelectTrigger id="pledge-pot" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_POT}>No pot</SelectItem>
                  {pots.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {preview && (
              <p className="text-muted-foreground text-xs">
                {preview.fundedNever
                  ? "At this rate, never funded — preview."
                  : `≈ Fully funded by ${formatDate(preview.date, "UTC", { month: "long", year: "numeric" })} at this rate — preview, save to confirm.`}
              </p>
            )}
            {monthlyRate.trim() && myOldRateMinor === null && (
              <p className="text-muted-foreground text-xs">
                Live preview isn&rsquo;t available while pledging in a different
                currency than the goal — save to see the updated date.
              </p>
            )}

            {projectedOverBy != null && projectedOverBy > 0 && (
              <p className="text-destructive text-xs">
                This would put you{" "}
                {formatMoney(
                  projectedOverBy,
                  allocationSummary!.base_currency ?? goalCurrency,
                )}{" "}
                over your monthly capacity.
              </p>
            )}

            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              className="self-start"
            >
              Save pledge
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
