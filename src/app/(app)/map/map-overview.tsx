"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { LazyPlaceMap } from "@/components/mapbox/lazy-place-map";
import type { PlaceMapMarker } from "@/components/mapbox/place-map";
import {
  countOverviewPlaces,
  OVERVIEW_KIND_LABEL,
  overviewPlaceColour,
  type OverviewPlace,
  type OverviewPlaceKind,
} from "@/lib/map-overview";

const KINDS: OverviewPlaceKind[] = ["dream", "planned", "visited"];

/**
 * "Dreams in one colour, planned stops in another, visited in the star
 * token" (P6.4 brief) is a colour-only signal on its own — this app's
 * own rule against that (P4.2's RAG badges: "never colour alone") is why
 * every marker's popup repeats the kind as text, and why the legend
 * pairs each dot with a label rather than leaving colour to speak for
 * itself.
 */
export function MapOverview({ places }: { places: OverviewPlace[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const counts = useMemo(() => countOverviewPlaces(places), [places]);

  const markers: PlaceMapMarker[] = useMemo(
    () =>
      places.map((place) => ({
        id: place.id,
        latitude: place.latitude,
        longitude: place.longitude,
        color: overviewPlaceColour(place.kind),
        onClick: () => setSelectedId(place.id),
      })),
    [places],
  );

  const selected = selectedId
    ? (places.find((p) => p.id === selectedId) ?? null)
    : null;

  if (places.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        Nothing on the map yet — add a place to your{" "}
        <Link href="/someday" className="underline">
          someday list
        </Link>{" "}
        or a trip to see it here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {KINDS.map((kind) => (
          <div key={kind} className="flex items-center gap-1.5 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: overviewPlaceColour(kind) }}
              aria-hidden
            />
            <span className="text-muted-foreground">
              {counts[kind]} {OVERVIEW_KIND_LABEL[kind].toLowerCase()}
            </span>
          </div>
        ))}
      </div>

      <LazyPlaceMap markers={markers} className="h-[32rem]" zoom={4} />

      {selected && (
        <div className="border-subtle bg-surface flex gap-3 rounded-xl border p-3 shadow-lg">
          {selected.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.thumbUrl}
              alt=""
              className="size-16 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div
              className="size-16 shrink-0 rounded-lg opacity-30"
              style={{ backgroundColor: overviewPlaceColour(selected.kind) }}
              aria-hidden
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display truncate text-sm">{selected.title}</p>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground -mt-0.5 -mr-0.5 flex size-6 shrink-0 items-center justify-center rounded-full max-md:size-11"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {selected.placeName && (
              <p className="text-muted-foreground truncate text-xs">
                {selected.placeName}
              </p>
            )}
            <p className="text-muted-foreground mt-1 text-xs">
              {OVERVIEW_KIND_LABEL[selected.kind]}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
