import Link from "next/link";
import { redirect } from "next/navigation";

import { LlamaEmptyState } from "@/components/llama-empty-state";
import { Button } from "@/components/ui/button";
import {
  buildConstellationPoints,
  type ConstellationMilestoneInput,
  type ConstellationTaskInput,
} from "@/lib/constellations/points";
import { computeDepth, groupByYear } from "@/lib/constellations/layout";
import { createClient } from "@/lib/supabase/server";
import { ConstellationFilterBar } from "./constellation-filter-bar";
import { ConstellationTile } from "./constellation-tile";

/**
 * P5.3: the constellation archive. Every completed goal becomes a lit
 * constellation (its completed tasks and milestones as stars, positioned
 * by completion date, connected in completion order — `layoutConstellation`
 * does the actual geometry); every abandoned goal becomes a faint unlit
 * outline with its reason visible, not hidden — "abandoning something
 * deliberately is data about what you actually care about" (brief,
 * verbatim). Nothing else appears here: an active/someday/archived goal
 * hasn't reached a real ending yet, so it isn't part of the archive.
 *
 * Server-rendered and filtered via URL search params
 * (`ConstellationFilterBar`), same shape as `goals/goals-filters.tsx` —
 * no client-side data fetching, no windowing: a person's own lifetime of
 * completed/abandoned goals is a bounded, personal-scale dataset, not
 * something that needs range-windowing the way the cross-goal timeline's
 * calendar-scale data does.
 */
export default async function ConstellationsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; lifeArea?: string }>;
}) {
  const { year: yearParam, lifeArea: lifeAreaParam } = await searchParams;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  // life_areas are per-user, not a shared-with-collaborators concept the
  // way goals are — same explicit .eq("user_id", ...) goals/page.tsx's
  // own life-areas fetch already uses, rather than trusting RLS alone to
  // narrow it (CLAUDE.md's "add a filter where RLS alone is broader than
  // what the UI should allow").
  const { data: lifeAreas, error: lifeAreasError } = await supabase
    .from("life_areas")
    .select("id, name, colour")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (lifeAreasError) {
    throw new Error(lifeAreasError.message);
  }
  const colourByLifeArea = new Map(
    (lifeAreas ?? []).map((a) => [a.id, a.colour]),
  );

  // Own goals only, same restriction goals/page.tsx's own list applies
  // (and for the same reason: RLS alone would also surface goals this
  // viewer collaborates on but doesn't own, which is the right breadth
  // for editing but not for a personal reflection archive). Both
  // terminal states, unfiltered by the URL params at this point —
  // filtering happens after `endedOn` is computed below, since "year"
  // isn't a stored column to query against directly (it's derived from
  // whichever of completed_at/abandoned_at applies).
  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select(
      "id, title, life_area_id, completed_at, abandoned_at, abandon_reason",
    )
    .eq("owner_id", userId)
    .in("state", ["completed", "abandoned"])
    .is("deleted_at", null);
  if (goalsError) {
    throw new Error(goalsError.message);
  }

  const goalIds = (goals ?? []).map((g) => g.id);
  const [
    { data: tasks, error: tasksError },
    { data: milestones, error: milestonesError },
  ] =
    goalIds.length > 0
      ? await Promise.all([
          supabase
            .from("tasks")
            .select(
              "id, goal_id, title, status, completed_at, computed_end, computed_start, created_at",
            )
            .in("goal_id", goalIds)
            .is("deleted_at", null),
          supabase
            .from("milestones")
            .select("id, goal_id, title, completed_at, due_date, created_at")
            .in("goal_id", goalIds)
            .is("deleted_at", null),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
  if (tasksError) {
    throw new Error(tasksError.message);
  }
  if (milestonesError) {
    throw new Error(milestonesError.message);
  }

  const tasksByGoal = new Map<string, ConstellationTaskInput[]>();
  for (const t of tasks ?? []) {
    const bucket = tasksByGoal.get(t.goal_id) ?? [];
    bucket.push(t);
    tasksByGoal.set(t.goal_id, bucket);
  }
  const milestonesByGoal = new Map<string, ConstellationMilestoneInput[]>();
  for (const m of milestones ?? []) {
    const bucket = milestonesByGoal.get(m.goal_id) ?? [];
    bucket.push(m);
    milestonesByGoal.set(m.goal_id, bucket);
  }

  // One row per constellation, with everything downstream rendering
  // needs already resolved — `endedOn` always exists in practice (the
  // `state in (completed, abandoned)` filter above guarantees one of the
  // two timestamps), but falls back to today rather than throwing on a
  // row that somehow has neither, so a single bad row can't 500 the
  // whole archive.
  const constellations = (goals ?? []).map((goal) => {
    const lit = goal.completed_at != null;
    const endedOn =
      goal.completed_at ?? goal.abandoned_at ?? new Date().toISOString();
    return {
      id: goal.id,
      title: goal.title,
      lit,
      endedOn,
      colour: goal.life_area_id
        ? (colourByLifeArea.get(goal.life_area_id) ?? null)
        : null,
      lifeAreaId: goal.life_area_id,
      abandonReason: goal.abandon_reason,
      points: buildConstellationPoints(
        lit,
        tasksByGoal.get(goal.id) ?? [],
        milestonesByGoal.get(goal.id) ?? [],
      ),
    };
  });

  // The header stat and the year-filter's own option list both read from
  // the *full*, unfiltered set — "23 constellations lit since 2026" is a
  // fact about the whole archive, not about whatever's currently
  // filtered into view (a life-area filter narrowing the grid to 3
  // tiles shouldn't make the headline stat say "since 2028" just because
  // that's the oldest one in that one life area).
  const litCount = constellations.filter((c) => c.lit).length;
  const allYears = [
    ...new Set(constellations.map((c) => new Date(c.endedOn).getUTCFullYear())),
  ].sort((a, b) => b - a);
  const sinceYear = allYears.length > 0 ? Math.min(...allYears) : null;

  const yearFilter =
    yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
  const filtered = constellations.filter((c) => {
    if (yearFilter && new Date(c.endedOn).getUTCFullYear() !== yearFilter) {
      return false;
    }
    if (
      lifeAreaParam &&
      lifeAreaParam !== "all" &&
      c.lifeAreaId !== lifeAreaParam
    ) {
      return false;
    }
    return true;
  });

  const yearGroups = groupByYear(filtered, (c) => c.endedOn);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Constellations</h1>
          {sinceYear != null && (
            <p className="text-muted-foreground text-sm">
              {litCount} constellation{litCount === 1 ? "" : "s"} lit since{" "}
              {sinceYear}.
            </p>
          )}
        </div>
        <ConstellationFilterBar
          years={allYears}
          lifeAreas={(lifeAreas ?? []).map((a) => ({ id: a.id, name: a.name }))}
        />
      </div>

      {constellations.length === 0 ? (
        <LlamaEmptyState
          speaker="fluffy"
          title="No constellations yet"
          body="Complete a goal, or let one go, and it'll take its place here — the sky fills up as you go."
          action={
            <Button asChild>
              <Link href="/goals">Your goals</Link>
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <LlamaEmptyState
          speaker="fluffy"
          title="Nothing matches these filters"
          body="Try a different year or life area."
        />
      ) : (
        <div className="flex flex-col gap-10">
          {yearGroups.map((group, rank) => {
            const depth = computeDepth(rank, yearGroups.length);
            return (
              <section key={group.year} className="flex flex-col gap-3">
                <h2 className="font-display text-muted-foreground text-xl">
                  {group.year}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((c) => (
                    <ConstellationTile
                      key={c.id}
                      goalId={c.id}
                      title={c.title}
                      colour={c.colour}
                      lit={c.lit}
                      points={c.points}
                      abandonReason={c.abandonReason}
                      depth={depth}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
