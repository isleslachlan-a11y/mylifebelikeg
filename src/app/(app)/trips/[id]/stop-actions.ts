"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import type { Database } from "@/types/database";
import type { UnsplashPhotoResult } from "@/lib/unsplash/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type TripStop = Database["public"]["Tables"]["trip_stops"]["Row"];
type TripLeg = Database["public"]["Tables"]["trip_legs"]["Row"];
type BookingStatus = Database["public"]["Enums"]["booking_status"];

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

/** What every stop *and* leg action below returns on success — see the module doc comment for why. */
export type TripState = { stops: TripStop[]; legs: TripLeg[] };

async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/**
 * "Refetch after; don't mutate local state, since the change moves
 * stops the user didn't touch" (P6.3 brief) — written about reordering
 * specifically, but the same reasoning covers *any* stop/leg mutation
 * here: creating, editing a stop's `nights`, or deleting a stop all fire
 * `trip_stops_recompute`, which can silently ripple
 * `computed_arrival`/`computed_departure` onto every later stop, and
 * deleting a stop cascades to any leg that pointed at it (see
 * `deleteStop` below). Reimplementing that ripple in TypeScript to patch
 * client state precisely would be exactly the "two implementations of
 * the same algorithm will diverge" trap P5.2's brief warned about for
 * CPM — so every action here, not only reorder, returns a full fresh
 * `{ stops, legs }` pair and the client always replaces state wholesale.
 */
async function fetchTripState(
  supabase: SupabaseServerClient,
  tripId: string,
): Promise<TripState> {
  const [{ data: stops, error: stopsError }, { data: legs, error: legsError }] =
    await Promise.all([
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
    ]);

  if (stopsError) throw stopsError;
  if (legsError) throw legsError;
  return { stops: stops ?? [], legs: legs ?? [] };
}

export type StopInput = {
  name: string;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
  countryCode: string | null;
  mapboxPlaceId: string | null;
  nights: number;
  estimatedCostMinor: number | null;
  currency: string | null;
  bookingState: BookingStatus;
  bookingReference: string | null;
  bookingUrl: string | null;
  notes: string | null;
  photo: UnsplashPhotoResult | null;
};

function stopToRow(input: StopInput) {
  return {
    name: input.name.trim(),
    place_name: input.placeName?.trim() || null,
    latitude: input.latitude,
    longitude: input.longitude,
    country_code: input.countryCode,
    mapbox_place_id: input.mapboxPlaceId,
    nights: input.nights,
    estimated_cost_minor: input.estimatedCostMinor,
    currency: input.currency,
    booking_state: input.bookingState,
    booking_reference: input.bookingReference?.trim() || null,
    booking_url: input.bookingUrl?.trim() || null,
    notes: input.notes?.trim() || null,
    unsplash_photo_id: input.photo?.id ?? null,
    unsplash_thumb_url: input.photo?.thumbUrl ?? null,
    unsplash_full_url: input.photo?.fullUrl ?? null,
    unsplash_author_name: input.photo?.authorName ?? null,
    unsplash_author_url: input.photo?.authorUrl ?? null,
  };
}

const RESULT_PATH = (tripId: string) => `/trips/${tripId}`;

export async function createStop(
  tripId: string,
  input: StopInput,
): Promise<ActionResult<TripState>> {
  if (!input.name.trim()) {
    return { ok: false, error: "Name can't be empty." };
  }

  const supabase = await createClient();
  await getUserId(supabase);

  const { data: existing, error: maxError } = await supabase
    .from("trip_stops")
    .select("sequence")
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("sequence", { ascending: false })
    .limit(1);

  if (maxError) {
    return { ok: false, error: humanizeDbError(maxError) };
  }
  const nextSequence = (existing?.[0]?.sequence ?? -1) + 1;

  const { error } = await supabase
    .from("trip_stops")
    .insert({ trip_id: tripId, sequence: nextSequence, ...stopToRow(input) });

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(RESULT_PATH(tripId));
  return { ok: true, data: await fetchTripState(supabase, tripId) };
}

export async function updateStop(
  tripId: string,
  stopId: string,
  input: StopInput,
): Promise<ActionResult<TripState>> {
  if (!input.name.trim()) {
    return { ok: false, error: "Name can't be empty." };
  }

  const supabase = await createClient();
  await getUserId(supabase);

  const { data, error } = await supabase
    .from("trip_stops")
    .update(stopToRow(input))
    .eq("id", stopId)
    .eq("trip_id", tripId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That stop couldn't be found." };
  }

  revalidatePath(RESULT_PATH(tripId));
  return { ok: true, data: await fetchTripState(supabase, tripId) };
}

/**
 * Soft delete, matching this app's usual convention (and
 * `trip_stops_recompute`'s own trigger definition, which explicitly
 * watches `deleted_at` as one of its recompute-triggering columns — the
 * schema is built assuming this is how a stop goes away). Any leg
 * pointing at this stop is soft-deleted alongside it rather than left
 * dangling: `trip_legs`'s real foreign keys are `ON DELETE CASCADE`,
 * which only fires on a hard DELETE, so a soft delete has to do that
 * cleanup itself.
 */
export async function deleteStop(
  tripId: string,
  stopId: string,
): Promise<ActionResult<TripState>> {
  const supabase = await createClient();
  await getUserId(supabase);

  const now = new Date().toISOString();

  const { error: legsError } = await supabase
    .from("trip_legs")
    .update({ deleted_at: now })
    .eq("trip_id", tripId)
    .or(`from_stop_id.eq.${stopId},to_stop_id.eq.${stopId}`)
    .is("deleted_at", null);

  if (legsError) {
    return { ok: false, error: humanizeDbError(legsError) };
  }

  const { data, error } = await supabase
    .from("trip_stops")
    .update({ deleted_at: now })
    .eq("id", stopId)
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That stop couldn't be found." };
  }

  revalidatePath(RESULT_PATH(tripId));
  return { ok: true, data: await fetchTripState(supabase, tripId) };
}

/**
 * "Do not renumber client-side... app.reorder_trip_stop handles it in
 * one transaction and recomputes dates" (P6.3 brief, verbatim) — this is
 * a thin wrapper over the RPC, nothing more.
 */
export async function reorderStop(
  tripId: string,
  stopId: string,
  newSequence: number,
): Promise<ActionResult<TripState>> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase.rpc("reorder_trip_stop", {
    stop_id: stopId,
    new_sequence: newSequence,
  });

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(RESULT_PATH(tripId));
  return { ok: true, data: await fetchTripState(supabase, tripId) };
}

/**
 * "Add from bucket list" — `app.promote_someday_to_stop` copies place,
 * cost and photo attribution onto a new stop and stamps the someday
 * item's `promoted_at`, never deleting the original (P6.3 brief).
 */
export async function promoteFromSomeday(
  tripId: string,
  somedayId: string,
  nights: number,
): Promise<ActionResult<TripState>> {
  if (!Number.isInteger(nights) || nights < 0) {
    return { ok: false, error: "Nights can't be negative." };
  }

  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase.rpc("promote_someday_to_stop", {
    someday_id: somedayId,
    trip_id: tripId,
    nights,
  });

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(RESULT_PATH(tripId));
  revalidatePath("/someday");
  return { ok: true, data: await fetchTripState(supabase, tripId) };
}
