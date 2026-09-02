"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { LazyPlaceMap } from "@/components/mapbox/lazy-place-map";
import type {
  PlaceMapLine,
  PlaceMapMarker,
} from "@/components/mapbox/place-map";
import { describeTimeRemaining } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { MAP_MARKER_COLOUR } from "@/lib/mapbox/types";
import { bookingStateLabel } from "@/lib/trips";
import type { Database } from "@/types/database";

type TripStop = Database["public"]["Tables"]["trip_stops"]["Row"];
type TripLeg = Database["public"]["Tables"]["trip_legs"]["Row"];

export type StopMapOrigin = {
  name: string | null;
  latitude: number | null;
  longitude: number | null;
};

function resolveEndpoint(
  stopId: string | null,
  stops: TripStop[],
  origin: StopMapOrigin,
): [number, number] | null {
  if (stopId === null) {
    if (origin.latitude == null || origin.longitude == null) return null;
    return [origin.longitude, origin.latitude];
  }
  const stop = stops.find((s) => s.id === stopId);
  if (!stop || stop.latitude == null || stop.longitude == null) return null;
  return [stop.longitude, stop.latitude];
}

/**
 * "Stops as numbered markers in sequence, connected by lines in order.
 * Line style varies by leg mode — solid for ground travel, dashed for
 * flights. Fit bounds to all stops on load" (P6.4 brief). Numbers come
 * from each stop's position in the already-sequence-ordered `stops`
 * array — a stop with no coordinates yet just doesn't get a marker, but
 * the ones that do keep their *real* sequence number (not a renumbering
 * of only the plottable subset), so it still matches the sequence list
 * beside it.
 *
 * "Clicking a marker opens a card" (brief) — `selectedStopId` is local
 * state, cleared by the card's own close button or by picking a
 * different marker.
 */
export function StopMap({
  stops,
  legs,
  origin,
  timezone,
  today,
}: {
  stops: TripStop[];
  legs: TripLeg[];
  origin: StopMapOrigin;
  timezone: string;
  today: string;
}) {
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  const markers: PlaceMapMarker[] = useMemo(
    () =>
      stops
        .map((stop, index) => ({ stop, number: index + 1 }))
        .filter(({ stop }) => stop.latitude != null && stop.longitude != null)
        .map(({ stop, number }) => ({
          id: stop.id,
          latitude: stop.latitude!,
          longitude: stop.longitude!,
          sequenceNumber: number,
          label: stop.name,
          color: MAP_MARKER_COLOUR,
          onClick: () => setSelectedStopId(stop.id),
        })),
    [stops],
  );

  const lines: PlaceMapLine[] = useMemo(
    () =>
      legs
        .map((leg): PlaceMapLine | null => {
          const from = resolveEndpoint(leg.from_stop_id, stops, origin);
          const to = resolveEndpoint(leg.to_stop_id, stops, origin);
          if (!from || !to) return null;
          return { id: leg.id, from, to, dashed: leg.mode === "flight" };
        })
        .filter((l): l is PlaceMapLine => l !== null),
    [legs, stops, origin],
  );

  const selectedStop = selectedStopId
    ? (stops.find((s) => s.id === selectedStopId) ?? null)
    : null;

  if (markers.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Add a place to a stop to see the route on a map.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <LazyPlaceMap markers={markers} lines={lines} className="h-80" />
      {selectedStop && (
        <SelectedStopCard
          stop={selectedStop}
          timezone={timezone}
          today={today}
          onClose={() => setSelectedStopId(null)}
        />
      )}
    </div>
  );
}

function SelectedStopCard({
  stop,
  today,
  onClose,
}: {
  stop: TripStop;
  timezone: string;
  today: string;
  onClose: () => void;
}) {
  return (
    <div className="border-subtle bg-surface flex gap-3 rounded-xl border p-3 shadow-lg">
      {stop.unsplash_thumb_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stop.unsplash_thumb_url}
          alt=""
          className="size-16 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="bg-raised size-16 shrink-0 rounded-lg" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display truncate text-sm">{stop.name}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground -mt-0.5 -mr-0.5 flex size-6 shrink-0 items-center justify-center rounded-full max-md:size-11"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <dl className="mt-1 flex flex-col gap-0.5 text-xs">
          <Row
            label="Nights"
            value={`${stop.nights} night${stop.nights === 1 ? "" : "s"}`}
          />
          {stop.computed_arrival && (
            <Row
              label="Arrives"
              value={
                describeTimeRemaining(stop.computed_arrival, today).primary
              }
            />
          )}
          {stop.computed_departure && (
            <Row
              label="Departs"
              value={
                describeTimeRemaining(stop.computed_departure, today).primary
              }
            />
          )}
          {stop.estimated_cost_minor != null && stop.currency && (
            <Row
              label="Cost"
              value={formatMoney(stop.estimated_cost_minor, stop.currency)}
            />
          )}
          <Row
            label="Booking"
            value={
              <Badge variant="outline">
                {bookingStateLabel(stop.booking_state)}
              </Badge>
            }
          />
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
