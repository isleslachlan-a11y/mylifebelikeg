import { notFound, redirect } from "next/navigation";

import { todayInZone } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { TripDetail } from "./trip-detail";

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tripId } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .is("deleted_at", null)
    .maybeSingle();
  // maybeSingle() only sets an error for a genuine query failure — a
  // real "doesn't exist" is data: null, error: null, so notFound() below
  // can't be mistaken for that case. A real failure here used to render
  // the same 404 a nonexistent trip would, instead of surfacing (P5.5's
  // Supabase-call audit, same class of bug as AppLayout's own profile
  // fetch).
  if (tripError) {
    throw new Error(tripError.message);
  }
  if (!trip) {
    notFound();
  }

  const [
    { data: goal, error: goalError },
    { data: profile, error: profileError },
    { data: stops, error: stopsError },
    { data: legs, error: legsError },
    { data: goalRag },
    { data: estimate },
    { data: somedayItems, error: somedayError },
  ] = await Promise.all([
    supabase
      .from("goals")
      .select(
        "id, title, start_date, target_date, currency, target_amount_minor, funding, life_area:life_areas(id, name, colour)",
      )
      .eq("id", trip.goal_id)
      .maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", userId).single(),
    supabase
      .from("trip_stops")
      .select("*")
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("sequence", { ascending: true }),
    supabase
      .from("trip_legs")
      .select("*")
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("v_goal_rag")
      .select("*")
      .eq("goal_id", trip.goal_id)
      .maybeSingle(),
    supabase
      .from("v_trip_estimates")
      .select("*")
      .eq("trip_id", tripId)
      .maybeSingle(),
    supabase
      .from("someday_items")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .is("promoted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  // Same maybeSingle()/single() distinction as trip's own fetch above —
  // a real error is never allowed to look like a plain 404.
  if (goalError) throw new Error(goalError.message);
  if (!goal) {
    notFound();
  }
  if (profileError) throw new Error(profileError.message);
  if (stopsError) throw new Error(stopsError.message);
  if (legsError) throw new Error(legsError.message);
  if (somedayError) throw new Error(somedayError.message);

  const timezone = profile?.timezone ?? "UTC";
  // Computed exactly once per request (P1.10) — passed down, never
  // re-derived via `new Date()` inside a component.
  const today = todayInZone(timezone, new Date());

  return (
    <TripDetail
      trip={trip}
      goal={goal}
      timezone={timezone}
      today={today}
      initialStops={stops ?? []}
      initialLegs={legs ?? []}
      goalRag={goalRag ?? null}
      estimate={estimate ?? null}
      somedayItems={somedayItems ?? []}
    />
  );
}
