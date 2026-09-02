import Link from "next/link";
import { redirect } from "next/navigation";

import { LlamaMessage } from "@/components/llama-message";
import {
  computeBudgetVariance,
  formatBudgetVariance,
} from "@/lib/budget-variance";
import { formatDate } from "@/lib/dates";
import { getLlamaCopy } from "@/lib/llamas/copy";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type GoalAffordability =
  Database["public"]["Views"]["v_goal_affordability"]["Row"];
type GoalFunding = Database["public"]["Views"]["v_goal_funding"]["Row"];

export default async function MoneyPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("base_currency")
    .eq("id", userId)
    .single();
  // A real failure here used to silently fall back to "AUD" and label
  // every real number on this page with the wrong currency code instead
  // of surfacing (P5.5's Supabase-call audit, same class of bug as
  // AppLayout's own profile fetch) — thrown instead, same reasoning:
  // this route is reached post-onboarding, so any error at all here is
  // unexpected.
  if (profileError) {
    throw new Error(profileError.message);
  }
  const baseCurrency = profile?.base_currency ?? "AUD";

  const [
    { data: allocationSummary, error: allocationError },
    { data: potBalances, error: potBalancesError },
    { data: ownedGoals, error: ownedGoalsError },
    { data: sharedGoals, error: sharedGoalsError },
  ] = await Promise.all([
    supabase
      .from("v_allocation_summary")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("v_pot_balances")
      .select("currency, balance_minor")
      .eq("user_id", userId),
    // Owned + shared, mirroring goals/page.tsx and money/ledger/page.tsx's
    // pattern — active, save_toward goals only: affordable-from and the
    // financial horizon are both a save_toward concept (v_goal_affordability
    // itself excludes spend_against, per 006_affordability_test.sql).
    supabase
      .from("goals")
      .select("id, title, currency, created_at, start_date, target_date")
      .eq("owner_id", userId)
      .eq("state", "active")
      .eq("funding", "save_toward")
      .is("deleted_at", null),
    supabase
      .from("goals")
      .select("id, title, currency, created_at, start_date, target_date")
      .neq("owner_id", userId)
      .eq("state", "active")
      .eq("funding", "save_toward")
      .is("deleted_at", null),
  ]);

  if (allocationError) {
    throw new Error(allocationError.message);
  }
  if (potBalancesError) {
    throw new Error(potBalancesError.message);
  }
  if (ownedGoalsError || sharedGoalsError) {
    throw new Error(
      (ownedGoalsError ?? sharedGoalsError)?.message ?? "Failed to load goals.",
    );
  }

  const activeGoals = [...(ownedGoals ?? []), ...(sharedGoals ?? [])];
  const goalIds = activeGoals.map((g) => g.id);

  const [
    { data: fundingRows, error: fundingRowsError },
    { data: affordabilityRows, error: affordabilityRowsError },
  ] =
    goalIds.length > 0
      ? await Promise.all([
          supabase.from("v_goal_funding").select("*").in("goal_id", goalIds),
          supabase
            .from("v_goal_affordability")
            .select("*")
            .in("goal_id", goalIds),
        ])
      : [
          { data: [] as GoalFunding[], error: null },
          { data: [] as GoalAffordability[], error: null },
        ];

  if (fundingRowsError) {
    throw new Error(fundingRowsError.message);
  }
  if (affordabilityRowsError) {
    throw new Error(affordabilityRowsError.message);
  }

  const fundingByGoal = new Map((fundingRows ?? []).map((f) => [f.goal_id, f]));
  const affordabilityByGoal = new Map(
    (affordabilityRows ?? []).map((a) => [a.goal_id, a]),
  );

  const goalRows = activeGoals
    .map((goal) => {
      const funding = fundingByGoal.get(goal.id) ?? null;
      const affordability = affordabilityByGoal.get(goal.id) ?? null;
      const budgetVariance =
        funding &&
        computeBudgetVariance({
          funding: "save_toward",
          targetAmountMinor: funding.target_amount_minor,
          contributedMinor: funding.contributed_minor,
          spentMinor: null,
          createdAt: goal.created_at,
          startDate: goal.start_date,
          targetDate: goal.target_date,
        });
      return { goal, funding, affordability, budgetVariance };
    })
    // Soonest affordable_from first; goals never funded at the current
    // rate (null affordable_from) sort last, not first — "unknown" isn't
    // "soonest".
    .sort((a, b) => {
      const aDate = a.affordability?.affordable_from;
      const bDate = b.affordability?.affordable_from;
      if (aDate == null && bDate == null) return 0;
      if (aDate == null) return 1;
      if (bDate == null) return -1;
      return aDate.localeCompare(bDate);
    });

  // The financial horizon — "the furthest-out affordable-from date across
  // active goals" (P2.5 brief), read as app.financial_horizon() describes
  // it. Not called as an RPC: the `app` schema isn't exposed via
  // PostgREST (confirmed live — see schedule-variance.ts's top comment
  // for the same finding on app.compute_goal_rag), so there's no way to
  // invoke it directly. This is a max() over affordable_from values
  // v_goal_affordability already computed for the exact goal set shown
  // above, not a reimplementation of its date/rate math — plain string
  // comparison over bare ISO dates, not a monetary computation.
  const horizon = goalRows.reduce<string | null>((furthest, row) => {
    const date = row.affordability?.affordable_from;
    if (!date) return furthest;
    return furthest == null || date > furthest ? date : furthest;
  }, null);

  const potTotalsByCurrency = new Map<string, number>();
  for (const row of potBalances ?? []) {
    if (!row.currency || row.balance_minor == null) continue;
    potTotalsByCurrency.set(
      row.currency,
      (potTotalsByCurrency.get(row.currency) ?? 0) + row.balance_minor,
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="font-display text-3xl">Money</h1>

      {potTotalsByCurrency.size > 0 && (
        <div className="bg-card ring-foreground/10 flex flex-col gap-2 rounded-xl p-4 ring-1">
          <h2 className="text-muted-foreground text-sm font-medium">
            Across your pots
          </h2>
          <dl className="flex flex-col gap-1 text-sm">
            {[...potTotalsByCurrency.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([currency, totalMinor]) => (
                <div
                  key={currency}
                  className="flex items-baseline justify-between"
                >
                  <dt className="text-muted-foreground">{currency}</dt>
                  <dd>{formatMoney(totalMinor, currency)}</dd>
                </div>
              ))}
          </dl>
          {/* Deliberately not a single combined total — that would mean
              converting every currency into one, which this app never
              does in application code (CLAUDE.md). Each currency's own
              total is exact; a blended figure wouldn't be. */}
        </div>
      )}

      {allocationSummary && (
        <div className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-xl p-4 ring-1">
          <h2 className="text-muted-foreground text-sm font-medium">
            The reality check
          </h2>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Monthly capacity</dt>
              <dd>
                {formatMoney(
                  allocationSummary.monthly_capacity_minor ?? 0,
                  baseCurrency,
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Allocated to goals</dt>
              <dd>
                {formatMoney(
                  allocationSummary.allocated_minor ?? 0,
                  baseCurrency,
                )}
              </dd>
            </div>
            <div className="border-foreground/10 flex items-baseline justify-between border-t pt-1.5 text-base font-medium">
              <dt>Free</dt>
              <dd
                className={
                  allocationSummary.over_allocated
                    ? "text-destructive"
                    : undefined
                }
              >
                {formatMoney(allocationSummary.free_minor ?? 0, baseCurrency)}
              </dd>
            </div>
          </dl>
          {allocationSummary.over_allocated && (
            <LlamaMessage
              speaker="derek"
              body={getLlamaCopy("allocation_over_capacity", {
                overMinor: -(allocationSummary.free_minor ?? 0),
                currency: baseCurrency,
              })}
            />
          )}
        </div>
      )}

      <div className="bg-card ring-foreground/10 rounded-xl p-4 text-sm ring-1">
        <h2 className="text-muted-foreground mb-2 text-sm font-medium">
          Financial horizon
        </h2>
        {horizon ? (
          <p>
            You can commit to plans up to{" "}
            <strong>
              {formatDate(horizon, "UTC", { month: "long", year: "numeric" })}
            </strong>{" "}
            — beyond that is aspiration.
          </p>
        ) : (
          <p className="text-muted-foreground">
            No committed horizon yet — no active goal is currently funded at a
            rate that gets it there.
          </p>
        )}
      </div>

      {goalRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Active funded goals</h2>
          <ul className="flex flex-col gap-2">
            {goalRows.map(({ goal, affordability, budgetVariance }) => (
              <li
                key={goal.id}
                className="bg-card ring-foreground/10 flex flex-col gap-0.5 rounded-lg p-3 text-sm ring-1"
              >
                <Link
                  href={`/goals/${goal.id}`}
                  className="font-medium hover:underline"
                >
                  {goal.title}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {affordability?.affordable_from
                    ? `Funded by ${formatDate(affordability.affordable_from, "UTC", { month: "long", year: "numeric" })}`
                    : "Never funded at the current rate"}
                  {budgetVariance &&
                    ` · ${formatBudgetVariance(budgetVariance, goal.currency)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <Link href="/money/pots" className="text-sm underline">
          Manage pots
        </Link>
        <Link href="/money/cashflow" className="text-sm underline">
          Cashflow &amp; capacity
        </Link>
        <Link href="/money/fx" className="text-sm underline">
          Exchange rates
        </Link>
        <Link href="/money/ledger" className="text-sm underline">
          Ledger
        </Link>
      </div>
    </div>
  );
}
