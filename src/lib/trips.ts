import type { Database } from "@/types/database";

export type BookingStatus = Database["public"]["Enums"]["booking_status"];
export type TravelMode = Database["public"]["Enums"]["travel_mode"];

/**
 * "Booking state (idea → researching → booked → done)" (P6.3 brief,
 * verbatim) — the primary progression a stop or leg moves through.
 * `cancelled` is a real value in the `booking_status` enum but
 * deliberately excluded from this order: it's a side-exit, not a fourth
 * rung on the same ladder (nothing "advances" a booking to cancelled).
 */
export const BOOKING_STATE_PROGRESSION: BookingStatus[] = [
  "idea",
  "researching",
  "booked",
  "done",
];

const BOOKING_STATE_LABELS: Record<BookingStatus, string> = {
  idea: "Idea",
  researching: "Researching",
  booked: "Booked",
  done: "Done",
  cancelled: "Cancelled",
};

export function bookingStateLabel(state: BookingStatus): string {
  return BOOKING_STATE_LABELS[state];
}

/** The next rung up the progression, or `null` at the end (`done`) or off it entirely (`cancelled` has no "next"). */
export function nextBookingState(state: BookingStatus): BookingStatus | null {
  const index = BOOKING_STATE_PROGRESSION.indexOf(state);
  if (index === -1 || index === BOOKING_STATE_PROGRESSION.length - 1) {
    return null;
  }
  return BOOKING_STATE_PROGRESSION[index + 1]!;
}

const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  flight: "Flight",
  train: "Train",
  bus: "Bus",
  car: "Car",
  ferry: "Ferry",
  boat: "Boat",
  walk: "Walk",
  cycle: "Cycle",
  other: "Other",
};

export function travelModeLabel(mode: TravelMode): string {
  return TRAVEL_MODE_LABELS[mode];
}

export type StopEndpointLookup = { id: string; name: string };

/**
 * "One endpoint may be null for travel from the trip origin" (P6.3
 * brief) — resolves either a stop id to that stop's name, or `null` to
 * the trip's own `origin_name` (falling back to a plain "Origin" if the
 * trip never set one — `trips.origin_name` is nullable).
 */
export function describeLegEndpoint(
  stopId: string | null,
  stops: StopEndpointLookup[],
  originName: string | null,
): string {
  if (stopId === null) {
    return originName?.trim() || "Origin";
  }
  return stops.find((s) => s.id === stopId)?.name ?? "Unknown stop";
}
