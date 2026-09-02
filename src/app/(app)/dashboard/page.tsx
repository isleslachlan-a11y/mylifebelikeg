import Link from "next/link";
import { redirect } from "next/navigation";

import { AchievementCelebration } from "@/components/achievement-celebration";
import { NewGoalBadge, RagBadge } from "@/components/rag-badge";
import { evaluateAchievementsDebounced } from "@/lib/achievements/evaluate";
import { evaluateLlamaTriggers } from "@/lib/llamas/evaluate";
import { isGracePeriod, type GoalRag, type RagStatus } from "@/lib/rag";
import { createClient } from "@/lib/supabase/server";

// Worst first — the whole point of "at a glance" is surfacing what
// needs attention before what doesn't. Grey (undefined) sits ahead of
// green: an undefined goal is a prompt to go define it, not a
// non-event, so it reads as more actionable than "on track", even
// though it isn't a warning either (P4.2 brief).
const GROUP_ORDER: RagStatus[] = ["red", "amber", "grey", "green"];
const GROUP_LABEL: Record<RagStatus, string> = {
  red: "Off track",
  amber: "At risk",
  grey: "Undefined",
  green: "On track",
};

/**
 * A minimal RAG-at-a-glance dashboard (P4.2) — active goals grouped by
 * `v_goal_rag.effective_status` (honouring any live override), worst
 * first, with grace-period goals broken out into their own "New" group
 * rather than folded into "On track" (they're unconditionally green
 * internally, but that's not a status this view should imply is
 * earned — P4.2: "don't render a colour for these at all"). Not a full
 * dashboard build-out: no budget summary, no upcoming milestones, no
 * cross-goal timeline embed — those are their own future work. This
 * exists so "apply RAG to the dashboard" (P4.2's own checklist) means
 * something real rather than nothing, given `/dashboard` was still the
 * P0 stub going into this phase.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }

  // P4.6: the other of the two wired evaluation points (the other is
  // check-in submit). Debounced to at most once an hour per user inside
  // evaluateLlamaTriggers itself — most loads are a cheap early return,
  // not a full pass. Never blocks the dashboard rendering on failure.
  try {
    await evaluateLlamaTriggers(supabase, auth.claims.sub);
  } catch (evalError) {
    console.error("Llama evaluation failed on dashboard load", evalError);
  }

  // P7.2: the one genuine poll among achievement evaluation's five
  // trigger sites — the other four (check-in submit, goal/trip
  // completion, a ledger entry) are discrete events and always run
  // uncached. Debounced to at most once an hour per user inside
  // evaluateAchievementsDebounced itself, same shape as
  // evaluateLlamaTriggers just above but against its own
  // achievements_evaluated_at column (0028), not llama_evaluated_at —
  // two independent systems, two independent clocks.
  let unlockedAchievements: Awaited<
    ReturnType<typeof evaluateAchievementsDebounced>
  > = [];
  try {
    unlockedAchievements = await evaluateAchievementsDebounced(
      supabase,
      auth.claims.sub,
    );
  } catch (evalError) {
    console.error("Achievement evaluation failed on dashboard load", evalError);
  }

  // Active goals this viewer participates in — goals_select's RLS
  // (owner OR active goal_participants row) is exactly "my goals" here,
  // same reliance goals/page.tsx's shared-goals query and
  // check-in/page.tsx's goal list already document.
  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select("id, title")
    .eq("state", "active")
    .is("deleted_at", null)
    .order("title", { ascending: true });

  if (goalsError) {
    throw new Error(goalsError.message);
  }

  const goalIds = (goals ?? []).map((g) => g.id);
  const ragByGoal = new Map<string, GoalRag>();
  if (goalIds.length > 0) {
    const { data: ragRows, error: ragError } = await supabase
      .from("v_goal_rag")
      .select("*")
      .in("goal_id", goalIds);
    if (ragError) {
      throw new Error(ragError.message);
    }
    for (const row of ragRows ?? []) {
      // Postgres reports every view column nullable regardless of the
      // underlying tables' real constraints — goal_id is never actually
      // null (it's g.id), but drop defensively rather than crash if it
      // ever were (same convention goals/page.tsx's own rag map uses).
      if (row.goal_id) {
        ragByGoal.set(row.goal_id, row);
      }
    }
  }

  const newGoals: { id: string; title: string }[] = [];
  const byStatus: Record<RagStatus, { id: string; title: string }[]> = {
    red: [],
    amber: [],
    grey: [],
    green: [],
  };

  for (const goal of goals ?? []) {
    const rag = ragByGoal.get(goal.id);
    // No matching v_goal_rag row shouldn't happen for a real active goal
    // (the view has exactly one row per non-deleted goal) — skip rather
    // than crash if it ever did.
    if (!rag) continue;
    if (isGracePeriod(rag)) {
      newGoals.push(goal);
      continue;
    }
    byStatus[rag.effective_status ?? "grey"].push(goal);
  }

  const hasAnyGoals = (goals?.length ?? 0) > 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <AchievementCelebration unlocked={unlockedAchievements} />
      <h1 className="font-display text-3xl">Dashboard</h1>

      {!hasAnyGoals ? (
        <p className="text-muted-foreground text-sm">
          No active goals yet —{" "}
          <Link href="/goals/new" className="underline underline-offset-4">
            start one
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {GROUP_ORDER.map((status) => {
            const groupGoals = byStatus[status];
            if (groupGoals.length === 0) return null;
            return (
              <section key={status} className="flex flex-col gap-2">
                <RagBadge
                  status={status}
                  label={`${GROUP_LABEL[status]} (${groupGoals.length})`}
                />
                <ul className="border-subtle bg-surface flex flex-col gap-1 rounded-xl border p-2">
                  {groupGoals.map((goal) => (
                    <li key={goal.id}>
                      <Link
                        href={`/goals/${goal.id}`}
                        className="hover:bg-raised block truncate rounded-lg p-2 text-sm transition-colors"
                      >
                        {goal.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {newGoals.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <NewGoalBadge />
                <span className="text-muted-foreground text-xs">
                  {newGoals.length}
                </span>
              </div>
              <ul className="border-subtle bg-surface flex flex-col gap-1 rounded-xl border p-2">
                {newGoals.map((goal) => (
                  <li key={goal.id}>
                    <Link
                      href={`/goals/${goal.id}`}
                      className="hover:bg-raised block truncate rounded-lg p-2 text-sm transition-colors"
                    >
                      {goal.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
