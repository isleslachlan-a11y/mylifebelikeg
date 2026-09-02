import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * P5.5: "JSON of everything the user owns... non-negotiable for
 * something holding years of memories" (brief, verbatim). Uses the
 * ordinary request-scoped server client (`src/lib/supabase/server.ts`),
 * never the service-role one — every query below runs under this
 * caller's own RLS, so a bug in this file's own scoping can leak at
 * most what RLS already lets this user see, never another user's row
 * outright (CLAUDE.md rule 3: RLS is the actual security boundary, this
 * route is not).
 *
 * RLS alone is broader than "owns," though — a collaborator can *see* a
 * shared goal's tasks/milestones through RLS without owning any of it.
 * The acceptance bar here ("nothing of Sophia's") is about ownership,
 * not visibility, so every query below adds its own explicit
 * `owner_id`/`user_id` filter on top of RLS — CLAUDE.md's "add a filter
 * where RLS alone is broader than what the UI should allow," applied to
 * an entire export rather than one query. Concretely: goals (and
 * everything hanging off them — milestones, tasks, dependencies,
 * RAG history, trips) are scoped to goals this user *owns*, not goals
 * they merely collaborate on — a shared goal's own existence, and this
 * user's own participation row on it, still appear (via `goals`/
 * `goal_participants` below), but another participant's pledge details
 * don't, and a goal this user only collaborates on (doesn't own) isn't
 * exported at all. `achievements`/`avatar_presets` are excluded
 * entirely — shared catalog data with no `user_id` column, not personal
 * data to begin with.
 *
 * Two sequential fetch phases, not one big `Promise.all`: `task_dependencies`/
 * `trip_stops`/`trip_legs` don't carry `goal_id` directly (only their
 * parent task/trip does), so their own goal-owned scoping needs this
 * user's task/trip ids first — the same `.in("fk_column", ids)` shape
 * `goals/[id]/page.tsx`'s own dependency fetch already uses, rather than
 * PostgREST embedded-resource filtering (`.in("joined.col", ids)`),
 * which isn't a pattern used (or verified to work) anywhere else in
 * this codebase.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const userId = auth.claims.sub;

  const { data: ownedGoals, error: ownedGoalsError } = await supabase
    .from("goals")
    .select("id")
    .eq("owner_id", userId);
  if (ownedGoalsError) {
    return NextResponse.json(
      { error: ownedGoalsError.message },
      { status: 500 },
    );
  }
  const goalIds = (ownedGoals ?? []).map((g) => g.id);
  // .in("goal_id", []) / .in("goal_id", []) are valid, always-empty
  // queries — no special-casing needed for a brand-new account with
  // zero goals yet.

  const { data: ownedTasks, error: ownedTasksError } = await supabase
    .from("tasks")
    .select("id")
    .in("goal_id", goalIds);
  if (ownedTasksError) {
    return NextResponse.json(
      { error: ownedTasksError.message },
      { status: 500 },
    );
  }
  const taskIds = (ownedTasks ?? []).map((t) => t.id);

  const { data: ownedTrips, error: ownedTripsError } = await supabase
    .from("trips")
    .select("id")
    .in("goal_id", goalIds);
  if (ownedTripsError) {
    return NextResponse.json(
      { error: ownedTripsError.message },
      { status: 500 },
    );
  }
  const tripIds = (ownedTrips ?? []).map((t) => t.id);

  const queries = {
    profile: supabase.from("profiles").select("*").eq("id", userId).single(),
    life_areas: supabase.from("life_areas").select("*").eq("user_id", userId),
    pots: supabase.from("pots").select("*").eq("user_id", userId),
    cashflow_items: supabase
      .from("cashflow_items")
      .select("*")
      .eq("user_id", userId),
    goals: supabase.from("goals").select("*").eq("owner_id", userId),
    goal_participants: supabase
      .from("goal_participants")
      .select("*")
      .eq("user_id", userId),
    milestones: supabase.from("milestones").select("*").in("goal_id", goalIds),
    tasks: supabase.from("tasks").select("*").in("goal_id", goalIds),
    // Dependencies never cross goals (P5.0 brief), so scoping by *either*
    // side against this user's own task ids is equivalent — successor is
    // used here, matching goals/[id]/page.tsx's own fetch.
    task_dependencies: supabase
      .from("task_dependencies")
      .select("*")
      .in("successor_task_id", taskIds),
    ledger_entries: supabase
      .from("ledger_entries")
      .select("*")
      .eq("user_id", userId),
    goal_ratings: supabase
      .from("goal_ratings")
      .select("*")
      .eq("user_id", userId),
    check_ins: supabase.from("check_ins").select("*").eq("user_id", userId),
    rag_snapshots: supabase
      .from("rag_snapshots")
      .select("*")
      .in("goal_id", goalIds),
    rag_override_history: supabase
      .from("rag_override_history")
      .select("*")
      .in("goal_id", goalIds),
    trips: supabase.from("trips").select("*").in("goal_id", goalIds),
    trip_stops: supabase.from("trip_stops").select("*").in("trip_id", tripIds),
    trip_legs: supabase.from("trip_legs").select("*").in("trip_id", tripIds),
    someday_items: supabase
      .from("someday_items")
      .select("*")
      .eq("user_id", userId),
    llama_messages: supabase
      .from("llama_messages")
      .select("*")
      .eq("user_id", userId),
    user_achievements: supabase
      .from("user_achievements")
      .select("*")
      .eq("user_id", userId),
    capacity_suggestion_dismissals: supabase
      .from("capacity_suggestion_dismissals")
      .select("*")
      .eq("user_id", userId),
    // Grants/invitations this user made on their own resources — not
    // ones made *to* them by someone else about someone else's
    // resource, which would be exporting a fact about that other
    // resource, not this user's own data.
    share_grants: supabase
      .from("share_grants")
      .select("*")
      .eq("grantor_id", userId),
    invitations: supabase
      .from("invitations")
      .select("*")
      .eq("inviter_id", userId),
  } as const;

  const entries = Object.entries(queries);
  const results = await Promise.all(entries.map(([, query]) => query));

  const failed = results
    .map((r, i) => ({ table: entries[i]![0], error: r.error }))
    .filter((r) => r.error != null);
  if (failed.length > 0) {
    console.error("GET /api/export: query failure", failed);
    return NextResponse.json(
      {
        error: `Export failed while reading: ${failed.map((f) => f.table).join(", ")}.`,
      },
      { status: 500 },
    );
  }

  const data: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user_id: userId,
  };
  entries.forEach(([table], i) => {
    data[table] = results[i]!.data;
  });

  const body = JSON.stringify(data, null, 2);
  const filename = `starmap-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
