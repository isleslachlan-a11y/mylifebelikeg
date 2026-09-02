"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MapboxPlaceResult } from "@/lib/mapbox/types";
import { cn } from "@/lib/utils";
import { LazyPlaceMap } from "./lazy-place-map";

const DEBOUNCE_MS = 400;

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; results: MapboxPlaceResult[] };

/**
 * Search a place, see it on the map, select it. Same debounce-then-cache
 * shape as `<PhotoPicker>` (P6.0) — 400ms (P6.2 brief), backed by a
 * per-mount client cache keyed by the normalized query, funneled through
 * one `setTimeout` so every `setState` happens inside its callback
 * rather than synchronously in the effect body (same lint reason as
 * `use-critical-path-edges.ts`/`photo-picker.tsx`).
 *
 * Once a result is picked, the search UI gives way to a summary card —
 * name, country, a `<LazyPlaceMap>` preview with a single marker — with
 * a "Search a different place" way back in, rather than leaving the
 * results list and the picked result both on screen at once.
 */
export function PlacePicker({
  onSelect,
  className,
}: {
  onSelect: (place: MapboxPlaceResult) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [selected, setSelected] = useState<MapboxPlaceResult | null>(null);
  const cacheRef = useRef<Map<string, MapboxPlaceResult[]>>(new Map());

  useEffect(() => {
    if (selected) return; // no need to search once something's picked

    const trimmed = query.trim();
    const cacheKey = trimmed.toLowerCase();
    const cached = trimmed ? cacheRef.current.get(cacheKey) : undefined;
    const delay = trimmed && !cached ? DEBOUNCE_MS : 0;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;

      if (!trimmed) {
        setState({ status: "idle" });
        return;
      }
      if (cached) {
        setState({ status: "ready", results: cached });
        return;
      }

      setState({ status: "loading" });
      void (async () => {
        try {
          const res = await fetch(
            `/api/geocode?q=${encodeURIComponent(trimmed)}`,
          );
          const body = (await res.json()) as
            { results: MapboxPlaceResult[] } | { error: string };
          if (cancelled) return;

          if (!res.ok || "error" in body) {
            setState({
              status: "error",
              message: "error" in body ? body.error : "Place search failed.",
            });
            return;
          }

          cacheRef.current.set(cacheKey, body.results);
          setState({ status: "ready", results: body.results });
        } catch {
          if (!cancelled) {
            setState({ status: "error", message: "Place search failed." });
          }
        }
      })();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selected]);

  function handleSelect(place: MapboxPlaceResult) {
    setSelected(place);
    onSelect(place);
  }

  if (selected) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <LazyPlaceMap
          markers={[
            {
              id: selected.id,
              latitude: selected.latitude,
              longitude: selected.longitude,
              label: selected.name,
            },
          ]}
        />
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{selected.name}</p>
            {selected.fullAddress && (
              <p className="text-muted-foreground text-xs">
                {selected.fullAddress}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSelected(null);
              setQuery("");
              setState({ status: "idle" });
            }}
          >
            Search a different place
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Input
        type="search"
        placeholder="Search for a place…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search for a place"
      />

      {state.status === "loading" && (
        <p className="text-muted-foreground text-sm">Searching…</p>
      )}
      {state.status === "error" && (
        <p className="text-destructive text-sm">{state.message}</p>
      )}
      {state.status === "ready" && state.results.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No places found for &ldquo;{query.trim()}&rdquo;.
        </p>
      )}
      {state.status === "ready" && state.results.length > 0 && (
        <ul className="ring-foreground/10 divide-border flex flex-col divide-y overflow-hidden rounded-lg ring-1">
          {state.results.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => handleSelect(place)}
                className="hover:bg-raised flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors"
              >
                <span className="text-sm font-medium">{place.name}</span>
                {place.fullAddress && (
                  <span className="text-muted-foreground text-xs">
                    {place.fullAddress}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
