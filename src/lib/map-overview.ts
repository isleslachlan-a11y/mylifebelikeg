import {
  MAP_LINE_COLOUR,
  MAP_MARKER_COLOUR,
  MAP_STAR_COLOUR,
} from "@/lib/mapbox/types";
import type { Database } from "@/types/database";

export type OverviewPlaceKind = "dream" | "planned" | "visited";

export type OverviewPlace = {
  id: string;
  kind: OverviewPlaceKind;
  title: string;
  placeName: string | null;
  latitude: number;
  longitude: number;
  thumbUrl: string | null;
};

const KIND_COLOUR: Record<OverviewPlaceKind, string> = {
  dream: MAP_LINE_COLOUR, // the lighter --primary-soft purple
  planned: MAP_MARKER_COLOUR, // the same purple a trip's own map draws its stops in
  visited: MAP_STAR_COLOUR, // the app's gold --star token
};

export function overviewPlaceColour(kind: OverviewPlaceKind): string {
  return KIND_COLOUR[kind];
}

export const OVERVIEW_KIND_LABEL: Record<OverviewPlaceKind, string> = {
  dream: "Dreams",
  planned: "Planned stops",
  visited: "Visited",
};

type SomedayItemRow = Pick<
  Database["public"]["Tables"]["someday_items"]["Row"],
  | "id"
  | "title"
  | "place_name"
  | "latitude"
  | "longitude"
  | "unsplash_thumb_url"
>;

type TripStopRow = Pick<
  Database["public"]["Tables"]["trip_stops"]["Row"],
  | "id"
  | "name"
  | "place_name"
  | "latitude"
  | "longitude"
  | "unsplash_thumb_url"
  | "booking_state"
>;

/**
 * "/map overview showing all bucket list items and all trip stops
 * together — dreams in one colour, planned stops in another, visited in
 * the star token" (P6.4 brief, verbatim). A stop's own `booking_state`
 * is the per-place "visited" signal (not the whole trip's goal state —
 * one trip can have some stops done and others still just an idea, and
 * that's a real distinction worth keeping at stop granularity).
 * `cancelled` stops are dropped entirely: not a dream, not a planned
 * stop, not visited — nothing happening there.
 *
 * Only items with coordinates can appear on a map at all — callers are
 * expected to have already filtered for that in the query (`.not(
 * "latitude", "is", null)`), but this filters defensively too so a
 * caller that forgets can't put a marker at nowhere.
 */
export function buildOverviewPlaces(
  dreams: SomedayItemRow[],
  stops: TripStopRow[],
): OverviewPlace[] {
  const dreamPlaces: OverviewPlace[] = dreams
    .filter((d) => d.latitude != null && d.longitude != null)
    .map((d) => ({
      id: `dream:${d.id}`,
      kind: "dream" as const,
      title: d.title,
      placeName: d.place_name,
      latitude: d.latitude!,
      longitude: d.longitude!,
      thumbUrl: d.unsplash_thumb_url,
    }));

  const stopPlaces: OverviewPlace[] = stops
    .filter(
      (s) =>
        s.latitude != null &&
        s.longitude != null &&
        s.booking_state !== "cancelled",
    )
    .map((s) => ({
      id: `stop:${s.id}`,
      kind:
        s.booking_state === "done"
          ? ("visited" as const)
          : ("planned" as const),
      title: s.name,
      placeName: s.place_name,
      latitude: s.latitude!,
      longitude: s.longitude!,
      thumbUrl: s.unsplash_thumb_url,
    }));

  return [...dreamPlaces, ...stopPlaces];
}

export type OverviewCounts = Record<OverviewPlaceKind, number>;

export function countOverviewPlaces(places: OverviewPlace[]): OverviewCounts {
  const counts: OverviewCounts = { dream: 0, planned: 0, visited: 0 };
  for (const place of places) counts[place.kind]++;
  return counts;
}
