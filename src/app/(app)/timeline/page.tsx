import { redirect } from "next/navigation";

import { TimelineView } from "@/components/timeline/timeline-view";
import { todayInZone } from "@/lib/dates";
import type { GoalRag } from "@/lib/rag";
import { computeScheduleVariance } from "@/lib/schedule-variance";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

const RANGE_PX = 1000;

/**
 * P5.5: the real `/timeline` route — Phase 3 (P3.0–P3.8) built and
 * tested every piece of `TimelineView` this wires up, but the actual
 * page was never assembled; `/timeline/debug-lanes` (dev-only) is where
 * that work has lived until now, and its own module doc already spells
 * out exactly what "a real page" needs to supply that the harness
 * doesn't: `ownerNames`, `goalRag`, `scheduleVariances`, and a
 * server-timezone-resolved `today` (R2) instead of the browser's own.
 * This is that page.
 *
 * No `.eq("owner_id", userId)` anywhere below, unlike the personal-
 * archive pages (`/constellations`, `/retrospective/[year]`) — the
 * timeline is meant to show everything RLS lets this viewer see, shared
 * goals included, same as `v_timeline_items` itself (security_invoker,
 * "RLS is the exact authorization surface," 0011's own migration
 * comment) and `goals/page.tsx`'s existing own-vs-shared split.
 */
export default async function TimelinePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("timezone, display_name")
    .eq("id", userId)
    .single();
  if (profileError) {
    throw new Error(profileError.message);
  }
  const timezone = profile.timezone;
  // Computed once per request, server-side (R2) — never new Date() inside
  // TimelineView or anything it renders (the P0.8 spike's trap).
  const today = todayInZone(timezone, new Date());

  const [
    { data: lifeAreas, error: lifeAreasError },
    { data: goals, error: goalsError },
    { data: horizonRow, error: horizonError },
  ] = await Promise.all([
    // Personal, not shared (life_areas are per-user — see CLAUDE.md's
    // "add a filter where RLS alone is broader" case, same reasoning
    // goals/page.tsx's own life-areas fetch already documents).
    supabase
      .from("life_areas")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    // Every goal this session's RLS shows — own and shared alike; no
    // owner_id filter (see module doc above). created_at/start_date/
    // target_date are here for computeScheduleVariance below, not for
    // TimelineView itself.
    supabase
      .from("goals")
      .select("id, title, owner_id, created_at, start_date, target_date")
      .is("deleted_at", null),
    supabase
      .from("v_financial_horizon")
      .select("horizon_date")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (lifeAreasError) throw new Error(lifeAreasError.message);
  if (goalsError) throw new Error(goalsError.message);
  if (horizonError) throw new Error(horizonError.message);

  const goalIds = (goals ?? []).map((g) => g.id);
  const goalTitles = new Map((goals ?? []).map((g) => [g.id, g.title]));

  const [
    { data: participantRows, error: participantsError },
    { data: tasks, error: tasksError },
    { data: ragRows, error: ragError },
  ] = await Promise.all([
    supabase
      .from("goal_participants")
      .select("user_id")
      .is("removed_at", null)
      .in("goal_id", goalIds),
    supabase
      .from("tasks")
      .select("goal_id, status, duration_days")
      .in("goal_id", goalIds)
      .is("deleted_at", null),
    supabase.from("v_goal_rag").select("*").in("goal_id", goalIds),
  ]);
  if (participantsError) throw new Error(participantsError.message);
  if (tasksError) throw new Error(tasksError.message);
  if (ragError) throw new Error(ragError.message);

  // Every person who might label an owner_id anywhere in this dataset:
  // this viewer, every visible goal's owner, and every participant on
  // one of those goals (a task can be assigned to a collaborator, not
  // just the goal owner). One bulk profiles fetch rather than a
  // per-goal round trip, same "flat query, map in JS" shape
  // goals/page.tsx's own taskProgress/ragByGoal already use.
  const peopleIds = new Set<string>([userId]);
  (goals ?? []).forEach((g) => peopleIds.add(g.owner_id));
  (participantRows ?? []).forEach((p) => peopleIds.add(p.user_id));

  const { data: peopleProfiles, error: peopleError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", [...peopleIds]);
  if (peopleError) throw new Error(peopleError.message);
  const ownerNames = new Map(
    (peopleProfiles ?? []).map((p) => [p.id, p.display_name]),
  );

  const tasksByGoal: Record<
    string,
    {
      durationDays: number;
      status: Database["public"]["Enums"]["task_status"];
    }[]
  > = {};
  for (const task of tasks ?? []) {
    (tasksByGoal[task.goal_id] ??= []).push({
      durationDays: task.duration_days,
      status: task.status,
    });
  }
  const scheduleVariances = new Map<string, number | null>();
  for (const g of goals ?? []) {
    scheduleVariances.set(
      g.id,
      computeScheduleVariance({
        createdAt: g.created_at,
        startDate: g.start_date,
        targetDate: g.target_date,
        tasks: tasksByGoal[g.id] ?? [],
      }),
    );
  }

  const goalRag = new Map<string, GoalRag>();
  for (const row of ragRows ?? []) {
    if (row.goal_id) {
      goalRag.set(row.goal_id, row);
    }
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="font-display text-3xl">Timeline</h1>
      <TimelineView
        rangePx={RANGE_PX}
        lifeAreas={lifeAreas ?? []}
        ownerNames={ownerNames}
        goalTitles={goalTitles}
        scheduleVariances={scheduleVariances}
        goalRag={goalRag}
        today={today}
        financialHorizon={horizonRow?.horizon_date ?? null}
      />
    </main>
  );
}
