import { redirect } from "next/navigation";

import { buildOverviewPlaces } from "@/lib/map-overview";
import { createClient } from "@/lib/supabase/server";
import { MapOverview } from "./map-overview";

/**
 * "The 'everything we want to do' view, and it's the one most worth
 * looking at together" (P6.4 brief) — every dream (unpromoted someday
 * item) and every trip stop, across every trip, in one place. Dreams are
 * scoped to this user's own list (`someday_items` has no cross-user
 * sharing concept — see P6.1's own note); stops come through
 * `trip_stops_select`'s RLS exactly as-is (own + shared goals, same
 * surface every other trip-aware page reads through), no extra filter
 * layered on top.
 */
export default async function MapOverviewPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [
    { data: dreams, error: dreamsError },
    { data: stops, error: stopsError },
  ] = await Promise.all([
    supabase
      .from("someday_items")
      .select("id, title, place_name, latitude, longitude, unsplash_thumb_url")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .is("promoted_at", null)
      .not("latitude", "is", null),
    supabase
      .from("trip_stops")
      .select(
        "id, name, place_name, latitude, longitude, unsplash_thumb_url, booking_state",
      )
      .is("deleted_at", null)
      .not("latitude", "is", null),
  ]);

  if (dreamsError) throw new Error(dreamsError.message);
  if (stopsError) throw new Error(stopsError.message);

  const places = buildOverviewPlaces(dreams ?? [], stops ?? []);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Map</h1>
        <p className="text-muted-foreground text-sm">
          Everything you want to do, everywhere you&rsquo;ve planned to go.
        </p>
      </div>
      <MapOverview places={places} />
    </div>
  );
}
