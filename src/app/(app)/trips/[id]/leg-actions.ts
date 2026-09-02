"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import type { Database } from "@/types/database";
import type { ActionResult, TripState } from "./stop-actions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type BookingStatus = Database["public"]["Enums"]["booking_status"];
type TravelMode = Database["public"]["Enums"]["travel_mode"];

async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/** Duplicated from stop-actions.ts rather than imported — that module's own version is `async function` (not exported); re-declaring a two-query fetch here is cheaper than restructuring the export surface for a single shared helper both files need identically. */
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

export type LegInput = {
  fromStopId: string | null;
  toStopId: string | null;
  mode: TravelMode;
  durationMinutes: number | null;
  costMinor: number | null;
  currency: string | null;
  bookingState: BookingStatus;
  bookingReference: string | null;
  bookingUrl: string | null;
  notes: string | null;
};

function validateEndpoints(input: LegInput): string | null {
  if (input.fromStopId === null && input.toStopId === null) {
    return "A leg needs at least one endpoint.";
  }
  if (input.fromStopId !== null && input.fromStopId === input.toStopId) {
    return "A leg can't start and end at the same stop.";
  }
  return null;
}

function legToRow(input: LegInput) {
  return {
    from_stop_id: input.fromStopId,
    to_stop_id: input.toStopId,
    mode: input.mode,
    duration_minutes: input.durationMinutes,
    cost_minor: input.costMinor,
    currency: input.currency,
    booking_state: input.bookingState,
    booking_reference: input.bookingReference?.trim() || null,
    booking_url: input.bookingUrl?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

const RESULT_PATH = (tripId: string) => `/trips/${tripId}`;

export async function createLeg(
  tripId: string,
  input: LegInput,
): Promise<ActionResult<TripState>> {
  const endpointError = validateEndpoints(input);
  if (endpointError) {
    return { ok: false, error: endpointError };
  }

  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase
    .from("trip_legs")
    .insert({ trip_id: tripId, ...legToRow(input) });

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(RESULT_PATH(tripId));
  return { ok: true, data: await fetchTripState(supabase, tripId) };
}

export async function updateLeg(
  tripId: string,
  legId: string,
  input: LegInput,
): Promise<ActionResult<TripState>> {
  const endpointError = validateEndpoints(input);
  if (endpointError) {
    return { ok: false, error: endpointError };
  }

  const supabase = await createClient();
  await getUserId(supabase);

  const { data, error } = await supabase
    .from("trip_legs")
    .update(legToRow(input))
    .eq("id", legId)
    .eq("trip_id", tripId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That leg couldn't be found." };
  }

  revalidatePath(RESULT_PATH(tripId));
  return { ok: true, data: await fetchTripState(supabase, tripId) };
}

export async function deleteLeg(
  tripId: string,
  legId: string,
): Promise<ActionResult<TripState>> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { data, error } = await supabase
    .from("trip_legs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", legId)
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That leg couldn't be found." };
  }

  revalidatePath(RESULT_PATH(tripId));
  return { ok: true, data: await fetchTripState(supabase, tripId) };
}
