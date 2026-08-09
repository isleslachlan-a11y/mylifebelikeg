import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { LlamaEmptyState } from "@/components/llama-empty-state";
import { todayInZone, toGoalOffset } from "@/lib/dates";
import { computeScheduleVariance } from "@/lib/schedule-variance";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { GoalsFilters } from "./goals-filters";
import { GoalRow } from "./goal-row";
import { LlamaMessagesFeed } from "./llama-messages-feed";

type Goal = Database["public"]["Tables"]["goals"]["Row"];
type LifeArea = Database["public"]["Tables"]["life_areas"]["Row"];
type GoalState = Database["public"]["Enums"]["goal_state"];

const GOAL_STATES: GoalState[] = [
  "active",
  "someday",
  "completed",
  "archived",
  "abandoned",
];

// A group for goals with no life_area_id — nullable at the schema level
// (see goals_life_area_id_fkey), even though the form always picks one.
const NO_AREA_GROUP: Pick<LifeArea, "id" | "name" | "colour"> = {
  id: "__none__",
  name: "No life area",
  colour: "#6B7280",
};

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    life_area?: string;
    sort?: string;
  }>;
}) {
  const {
    state: stateParam,
    life_area: lifeAreaParam,
    sort: sortParam,
  } = await searchParams;
  const useUrgencySort = sortParam === "urgency";
  const stateFilter: GoalState | "all" =
    stateParam === "all"
      ? "all"
      : stateParam && GOAL_STATES.includes(stateParam as GoalState)
        ? (stateParam as GoalState)
        : "active";

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [
    { data: profile },
    { data: lifeAreas, error: lifeAreasError },
    { data: capacity },
    { data: llamaMessages },
  ] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", userId).single(),
    supabase
      .from("life_areas")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("v_user_capacity")
      .select("active_goal_count, active_goal_limit")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("llama_messages")
      .select("id, speaker, body")
      .eq("user_id", userId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (lifeAreasError || !lifeAreas) {
    throw new Error(lifeAreasError?.message ?? "Failed to load life areas.");
  }
  // Computed exactly once per request — passed down, never re-derived via
  // new Date() inside a component (P1.10; this is the P0.8 spike's trap).
  const today = todayInZone(profile?.timezone ?? "UTC", new Date());

  let goalsQuery = supabase
    .from("goals")
    .select("*")
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .order("target_date", { ascending: true, nullsFirst: false });

  if (stateFilter !== "all") {
    goalsQuery = goalsQuery.eq("state", stateFilter);
  }
  if (lifeAreaParam && lifeAreaParam !== "all") {
    goalsQuery = goalsQuery.eq("life_area_id", lifeAreaParam);
  }

  // Goals shared with this user (P1.4) — .neq("owner_id", ...) combined
  // with goals_select's RLS (owner OR active participant) is exactly
  // "goals I can see that I don't own", so this reuses RLS as the source
  // of truth instead of separately querying goal_participants and
  // re-deriving the same answer. No life_area filter here: a shared
  // goal's life_area_id points at the *owner's* life_areas row, which
  // this viewer's own life-area grouping has no use for.
  let sharedGoalsQuery = supabase
    .from("goals")
    .select("*, owner:profiles!goals_owner_id_fkey(display_name)")
    .neq("owner_id", userId)
    .is("deleted_at", null)
    .order("target_date", { ascending: true, nullsFirst: false });

  if (stateFilter !== "all") {
    sharedGoalsQuery = sharedGoalsQuery.eq("state", stateFilter);
  }

  const [
    { data: goals, error: goalsError },
    { data: sharedGoals, error: sharedGoalsError },
  ] = await Promise.all([goalsQuery, sharedGoalsQuery]);

  if (goalsError || !goals) {
    throw new Error(goalsError?.message ?? "Failed to load goals.");
  }
  if (sharedGoalsError || !sharedGoals) {
    throw new Error(
      sharedGoalsError?.message ?? "Failed to load shared goals.",
    );
  }

  // Task progress ("7/12") and schedule variance inputs, tallied in JS
  // from one flat query — same pattern as P1.1's goal counts. No progress
  // view exists yet and the per-user row count is small.
  const allGoalIds = [...goals, ...sharedGoals].map((g) => g.id);
  const taskProgress: Record<string, { done: number; total: number }> = {};
  const tasksByGoal: Record<
    string,
    {
      durationDays: number;
      status: Database["public"]["Enums"]["task_status"];
    }[]
  > = {};
  if (allGoalIds.length > 0) {
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("goal_id, status, duration_days")
      .in("goal_id", allGoalIds)
      .is("deleted_at", null);

    if (tasksError) {
      throw new Error(tasksError.message);
    }
    for (const task of tasks ?? []) {
      const progress = (taskProgress[task.goal_id] ??= { done: 0, total: 0 });
      progress.total += 1;
      if (task.status === "done") {
        progress.done += 1;
      }
      (tasksByGoal[task.goal_id] ??= []).push({
        durationDays: task.duration_days,
        status: task.status,
      });
    }
  }

  function scheduleVarianceFor(goal: Goal): number | null {
    return computeScheduleVariance({
      createdAt: goal.created_at,
      startDate: goal.start_date,
      targetDate: goal.target_date,
      tasks: tasksByGoal[goal.id] ?? [],
    });
  }

  const groups: {
    area: Pick<LifeArea, "id" | "name" | "colour">;
    goals: Goal[];
  }[] = [
    ...lifeAreas.map((area) => ({
      area,
      goals: goals.filter((g) => g.life_area_id === area.id),
    })),
    {
      area: NO_AREA_GROUP,
      goals: goals.filter((g) => g.life_area_id === null),
    },
  ].filter((group) => group.goals.length > 0);

  // "By urgency" (P1.10) flattens across life-area groups AND the
  // "Shared with you" section into one ordered list — grouping by
  // category and ordering by "what's due soonest, overdue first" are
  // different questions, and the whole point of this mode is answering
  // the second one without the first getting in the way. Goals with no
  // target date have no urgency signal, so they sort last.
  const urgencyOrdered = [
    ...goals.map((goal) => ({
      goal,
      ownerName: undefined as string | undefined,
    })),
    ...sharedGoals.map((goal) => ({
      goal,
      ownerName: goal.owner?.display_name,
    })),
  ].sort((a, b) => {
    const aOffset = a.goal.target_date
      ? toGoalOffset(a.goal.target_date, today)
      : Infinity;
    const bOffset = b.goal.target_date
      ? toGoalOffset(b.goal.target_date, today)
      : Infinity;
    return aOffset - bOffset;
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl">Goals</h1>
        <Button asChild>
          <Link href="/goals/new">New goal</Link>
        </Button>
      </div>

      {capacity && (
        <p className="text-muted-foreground text-sm">
          {capacity.active_goal_count ?? 0} of {capacity.active_goal_limit ?? 5}{" "}
          active goals
        </p>
      )}

      <LlamaMessagesFeed messages={llamaMessages ?? []} />

      <GoalsFilters lifeAreas={lifeAreas} />

      {groups.length === 0 && sharedGoals.length === 0 ? (
        <LlamaEmptyState
          speaker="fluffy"
          title="No goals here yet"
          body="Nothing to show for this filter — plant your first goal and watch it grow."
          action={
            <Button asChild>
              <Link href="/goals/new">New goal</Link>
            </Button>
          }
        />
      ) : useUrgencySort ? (
        <ul className="border-subtle bg-surface flex flex-col gap-1 rounded-xl border p-2">
          {urgencyOrdered.map(({ goal, ownerName }) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              today={today}
              ownerName={ownerName}
              taskProgress={taskProgress[goal.id] ?? { done: 0, total: 0 }}
              scheduleVariance={scheduleVarianceFor(goal)}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(({ area, goals: areaGoals }) => (
            <details
              key={area.id}
              open
              className="border-subtle bg-surface rounded-xl border"
            >
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium select-none">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: area.colour }}
                  aria-hidden
                />
                {area.name}
                <span className="text-muted-foreground font-normal">
                  {areaGoals.length}
                </span>
              </summary>
              <ul className="flex flex-col gap-1 px-2 pb-2">
                {areaGoals.map((goal) => (
                  <GoalRow
                    key={goal.id}
                    goal={goal}
                    today={today}
                    taskProgress={
                      taskProgress[goal.id] ?? { done: 0, total: 0 }
                    }
                    scheduleVariance={scheduleVarianceFor(goal)}
                  />
                ))}
              </ul>
            </details>
          ))}

          {sharedGoals.length > 0 && (
            <details
              open
              className="border-subtle bg-surface rounded-xl border"
            >
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium select-none">
                Shared with you
                <span className="text-muted-foreground font-normal">
                  {sharedGoals.length}
                </span>
              </summary>
              <ul className="flex flex-col gap-1 px-2 pb-2">
                {sharedGoals.map((goal) => (
                  <GoalRow
                    key={goal.id}
                    goal={goal}
                    today={today}
                    ownerName={goal.owner?.display_name}
                    taskProgress={
                      taskProgress[goal.id] ?? { done: 0, total: 0 }
                    }
                    scheduleVariance={scheduleVarianceFor(goal)}
                  />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
