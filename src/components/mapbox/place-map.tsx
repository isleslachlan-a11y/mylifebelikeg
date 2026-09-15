"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { cn } from "@/lib/utils";
import {
  MAP_LINE_COLOUR,
  MAP_MARKER_COLOUR,
  MAPBOX_STYLE_URL,
} from "@/lib/mapbox/types";

export type PlaceMapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  label?: string;
  /** Renders a numbered circle instead of the default teardrop pin — the trip map's "stops as numbered markers in sequence" (P6.4 brief). */
  sequenceNumber?: number;
  /** Defaults to MAP_MARKER_COLOUR. The overview map (P6.4) sets this per-marker (dream/planned/visited each get their own colour); everything else just takes the default. */
  color?: string;
  onClick?: () => void;
};

export type PlaceMapLine = {
  id: string;
  from: [number, number];
  to: [number, number];
  /** Solid for ground travel, dashed for flights — "line style varies by leg mode" (P6.4 brief); the caller decides which, this only draws it. */
  dashed?: boolean;
  color?: string;
};

/**
 * A reusable map with markers and optional connecting lines (P6.2
 * brief) — the shared piece `<PlacePicker>`'s preview, the trip map, and
 * the `/map` overview (P6.4) all build on. Only ever imported behind
 * `next/dynamic` with `ssr: false` (see every call site in this
 * codebase) — `mapbox-gl` itself is loaded here via a runtime `import()`
 * inside an effect, not a module-level import, so its ~200KB+ never
 * becomes part of *this component's own* bundle chunk either; the
 * `dynamic()` wrapper on top additionally keeps that chunk out of any
 * route that doesn't render a map at all. Together these are what make
 * "bundle size for non-map routes is unchanged" (P6.2 acceptance) hold.
 *
 * The public token this reads (`NEXT_PUBLIC_MAPBOX_TOKEN`) is meant to be
 * client-side — Mapbox's own design, not a workaround of CLAUDE.md rule
 * 2 (which is about the Supabase *service-role* key specifically).
 * Restrict it by URL in the Mapbox dashboard rather than treating it as
 * a secret; the actual secret-scoped token (`MAPBOX_SECRET_TOKEN`, used
 * for geocoding) stays server-only — see `src/lib/mapbox/server.ts`.
 *
 * No drag-to-reorder here, deliberately — "reorder from the map by
 * dragging markers in the sequence list beside it, not by dragging on
 * the map itself" (P6.4 brief: fiddly on a phone, ambiguous with
 * panning). This component has no drag handling of any kind; the trip
 * map's reordering happens entirely in `stop-row.tsx`'s existing
 * `@dnd-kit` list, and this map just re-renders once that list's own
 * mutation returns a fresh stop order.
 */
export function PlaceMap({
  markers,
  lines,
  zoom = 9,
  interactive = true,
  className,
}: {
  markers: PlaceMapMarker[];
  /** Explicit per-segment lines, each independently styled — replaces a naive single "connect every marker in order" polyline, since the trip map needs one segment per *leg*, not per marker gap. */
  lines?: PlaceMapLine[];
  zoom?: number;
  interactive?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerInstancesRef = useRef<mapboxgl.Marker[]>([]);
  const [status, setStatus] = useState<
    "loading" | "ready" | "unconfigured" | "error"
  >("loading");

  // Plain array/callback references change identity every parent render
  // even when their contents don't — keying the sync effect off stable
  // strings instead avoids tearing down and rebuilding the whole map on
  // every unrelated re-render of whatever's hosting it. onClick is
  // deliberately excluded from the key (see the ref used inside the
  // effect below) so a caller re-creating its closure each render still
  // doesn't retrigger a full marker rebuild.
  const markersKey = useMemo(
    () =>
      JSON.stringify(
        markers.map((m) => [
          m.id,
          m.latitude,
          m.longitude,
          m.sequenceNumber,
          m.color,
        ]),
      ),
    [markers],
  );
  const linesKey = useMemo(
    () =>
      JSON.stringify(
        (lines ?? []).map((l) => [l.id, l.from, l.to, l.dashed, l.color]),
      ),
    [lines],
  );

  // onClick handlers change identity every render even when "which
  // marker, does what" hasn't — read through a ref inside the sync
  // effect so that isn't part of markersKey and doesn't retrigger a full
  // rebuild. Written from its own effect, not during render (React
  // flags mutating a ref's `.current` in the render body itself) — this
  // one has to run on *every* render, unconditioned on markersKey, so
  // the sync effect below always sees this render's actual closures.
  const markersRef = useRef(markers);
  useEffect(() => {
    markersRef.current = markers;
  });

  // Mount the map once.
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      // Deferred, not called synchronously in the effect body — React's
      // own guidance (and this project's lint config) flags that as a
      // cascading-render risk, same fix as photo-picker.tsx's identical
      // "nothing to do" early-return branch.
      const timer = setTimeout(() => setStatus("unconfigured"), 0);
      return () => clearTimeout(timer);
    }
    if (!containerRef.current) return;

    let cancelled = false;

    // Mapbox measures its container once, at construction — a container
    // that's 0px tall at that moment (a tab not yet shown, an accordion
    // still closed) paints only the background colour and never
    // recovers on its own, even once the container later gets real
    // height. No current call site in this app renders into a
    // container like that (every one passes a resolved Tailwind height
    // class up front), but this is cheap insurance against the next one
    // that does, rather than a fix for an active bug — resize() is a
    // no-op if nothing's actually changed size.
    const resizeObserver = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    resizeObserver.observe(containerRef.current);

    void (async () => {
      try {
        const mapboxglModule = (await import("mapbox-gl")).default;
        if (cancelled || !containerRef.current) return;

        if (!mapboxglModule.accessToken) {
          mapboxglModule.accessToken = token;
        }

        const map = new mapboxglModule.Map({
          container: containerRef.current,
          style: MAPBOX_STYLE_URL,
          center: [0, 20],
          zoom: 1,
          interactive,
        });
        map.addControl(new mapboxglModule.NavigationControl(), "top-right");
        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;
          setStatus("ready");
        });
        map.on("error", (e) => {
          console.error("Mapbox map error", e.error);
          if (!cancelled) setStatus("error");
        });
      } catch (error) {
        console.error("Failed to load mapbox-gl", error);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Deliberately mount-once: `interactive` never changes after mount in
    // any call site this app has, and re-creating the whole map for it
    // would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers/lines whenever they change, once the map has actually
  // finished its own "load" — mapbox-gl rejects source/layer calls made
  // before that event. This also covers "fit bounds to all stops on
  // load" (P6.4 brief): the first run after status flips to "ready" is
  // exactly that initial load, and every later marker change re-fits too
  // (a superset of the requirement, not a violation of it).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;

    let cancelled = false;
    void (async () => {
      const mapboxglModule = (await import("mapbox-gl")).default;
      if (cancelled) return;

      for (const marker of markerInstancesRef.current) marker.remove();
      markerInstancesRef.current = [];

      const currentMarkers = markersRef.current;

      for (const m of currentMarkers) {
        const colour = m.color ?? MAP_MARKER_COLOUR;
        let marker: mapboxgl.Marker;

        if (m.sequenceNumber != null) {
          // A plain mapboxgl.Marker's built-in `color` option only ever
          // draws its default teardrop pin — a numbered circle needs a
          // custom DOM element instead.
          const el = document.createElement("div");
          el.textContent = String(m.sequenceNumber);
          el.setAttribute("role", "button");
          el.setAttribute("aria-label", m.label ?? `Stop ${m.sequenceNumber}`);
          Object.assign(el.style, {
            width: "28px",
            height: "28px",
            borderRadius: "9999px",
            background: colour,
            color: "#0a0918", // --bg-deep — same dark-ink-on-saturated-purple pairing as shadcn's primary-foreground
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "600",
            fontSize: "12px",
            fontFamily: "var(--font-sans, sans-serif)",
            cursor: "pointer",
            boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
            border: "2px solid rgba(255,255,255,0.2)",
          } satisfies Partial<CSSStyleDeclaration>);
          marker = new mapboxglModule.Marker({ element: el });
        } else {
          marker = new mapboxglModule.Marker({ color: colour });
        }

        marker.setLngLat([m.longitude, m.latitude]);
        if (m.label) {
          marker.setPopup(
            new mapboxglModule.Popup({ offset: 16 }).setText(m.label),
          );
        }
        if (m.onClick) {
          marker.getElement().addEventListener("click", (e) => {
            e.stopPropagation();
            m.onClick?.();
          });
        }
        marker.addTo(map);
        markerInstancesRef.current.push(marker);
      }

      const lineLayerIds = ["place-map-lines-solid", "place-map-lines-dashed"];
      const lineSourceId = "place-map-lines";
      for (const layerId of lineLayerIds) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      if (map.getSource(lineSourceId)) map.removeSource(lineSourceId);

      if (lines && lines.length > 0) {
        map.addSource(lineSourceId, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: lines.map((l) => ({
              type: "Feature" as const,
              properties: {
                dashed: l.dashed ?? false,
                color: l.color ?? MAP_LINE_COLOUR,
              },
              geometry: {
                type: "LineString" as const,
                coordinates: [l.from, l.to],
              },
            })),
          },
        });
        map.addLayer({
          id: "place-map-lines-solid",
          type: "line",
          source: lineSourceId,
          filter: ["==", ["get", "dashed"], false],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": ["get", "color"], "line-width": 2 },
        });
        map.addLayer({
          id: "place-map-lines-dashed",
          type: "line",
          source: lineSourceId,
          filter: ["==", ["get", "dashed"], true],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 2,
            "line-dasharray": [2, 2],
          },
        });
      }

      if (currentMarkers.length === 1) {
        map.flyTo({
          center: [currentMarkers[0]!.longitude, currentMarkers[0]!.latitude],
          zoom,
        });
      } else if (currentMarkers.length > 1) {
        const bounds = new mapboxglModule.LngLatBounds();
        for (const m of currentMarkers)
          bounds.extend([m.longitude, m.latitude]);
        map.fitBounds(bounds, { padding: 48, maxZoom: zoom });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, markersKey, linesKey, zoom]);

  return (
    <div
      className={cn(
        "bg-surface ring-foreground/10 relative h-64 w-full overflow-hidden rounded-lg ring-1",
        className,
      )}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {status === "unconfigured" && (
        <p className="text-muted-foreground absolute inset-0 flex items-center justify-center p-4 text-center text-sm">
          Map isn&rsquo;t configured yet.
        </p>
      )}
      {status === "error" && (
        <p className="text-destructive absolute inset-0 flex items-center justify-center p-4 text-center text-sm">
          Couldn&rsquo;t load the map.
        </p>
      )}
    </div>
  );
}
