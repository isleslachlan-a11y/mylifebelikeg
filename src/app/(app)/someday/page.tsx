import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { SomedayManager } from "./someday-manager";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Which trip each already-promoted item went into — "Promoted items stay
 * visible with a marker showing which trip they went into" (P6.1 brief).
 * A trip has no title of its own (it's `goal_kind: 'trip'` on `goals` —
 * see `trips.goal_id`), so this is a three-hop chase: someday_item_id ->
 * trip_stops.trip_id -> trips.goal_id -> goals.title. Sequential, not one
 * PostgREST embedded-resource call, same reasoning as /api/export's own
 * multi-phase fetch: none of these foreign keys skip a hop, and embedded-
 * resource filtering isn't a pattern used (or verified to work) anywhere
 * else in this codebase.
 */
async function fetchPromotedTripTitles(
  supabase: SupabaseServerClient,
  promotedItemIds: string[],
): Promise<Map<string, string>> {
  if (promotedItemIds.length === 0) return new Map();

  const { data: stops, error: stopsError } = await supabase
    .from("trip_stops")
    .select("someday_item_id, trip_id")
    .in("someday_item_id", promotedItemIds);
  if (stopsError || !stops || stops.length === 0) {
    if (stopsError)
      console.error("Failed to load promoted trip stops", stopsError);
    return new Map();
  }

  const tripIds = [...new Set(stops.map((s) => s.trip_id))];
  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select("id, goal_id")
    .in("id", tripIds);
  if (tripsError || !trips) {
    if (tripsError)
      console.error("Failed to load trips for promoted items", tripsError);
    return new Map();
  }

  const goalIds = [...new Set(trips.map((t) => t.goal_id))];
  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select("id, title")
    .in("id", goalIds);
  if (goalsError || !goals) {
    if (goalsError)
      console.error("Failed to load goals for promoted trips", goalsError);
    return new Map();
  }

  const titleByGoalId = new Map(goals.map((g) => [g.id, g.title]));
  const goalIdByTripId = new Map(trips.map((t) => [t.id, t.goal_id]));

  const titleBySomedayId = new Map<string, string>();
  for (const stop of stops) {
    if (!stop.someday_item_id) continue;
    const goalId = goalIdByTripId.get(stop.trip_id);
    const title = goalId ? titleByGoalId.get(goalId) : undefined;
    if (title) titleBySomedayId.set(stop.someday_item_id, title);
  }
  return titleBySomedayId;
}

export default async function SomedayPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [
    { data: items, error: itemsError },
    { data: lifeAreas, error: lifeAreasError },
    { data: progress, error: progressError },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("someday_items")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("life_areas")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("v_someday_progress")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("base_currency").eq("id", userId).single(),
  ]);

  if (itemsError || !items) {
    throw new Error(itemsError?.message ?? "Failed to load your someday list.");
  }
  if (lifeAreasError || !lifeAreas) {
    throw new Error(lifeAreasError?.message ?? "Failed to load life areas.");
  }
  if (progressError) {
    throw new Error(progressError.message);
  }

  const promotedIds = items.filter((i) => i.promoted_at).map((i) => i.id);
  const promotedTripTitles = await fetchPromotedTripTitles(
    supabase,
    promotedIds,
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Someday</h1>
        <p className="text-muted-foreground text-sm">
          The places you want to go, before you have to plan any of it.
        </p>
      </div>
      <SomedayManager
        initialItems={items}
        lifeAreas={lifeAreas}
        progress={
          progress ?? {
            user_id: userId,
            total_items: 0,
            promoted_count: 0,
            still_dreaming: 0,
            countries_wanted: 0,
          }
        }
        promotedTripTitles={Object.fromEntries(promotedTripTitles)}
        defaultCurrency={profile?.base_currency ?? "AUD"}
      />
    </div>
  );
}
