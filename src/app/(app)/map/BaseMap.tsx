'use client';

/**
 * BaseMap — the one place Mapbox is initialised.
 *
 * The "dark box, no interaction" failure is almost always one of:
 *   1. mapbox-gl.css never imported. The canvas mounts but every control is
 *      unpositioned and pointer handling is broken. The import below is
 *      NOT optional and must not be moved to a global stylesheet that a
 *      route might not load.
 *   2. The map initialised while its container had zero size (a tab, an
 *      accordion, a flex child that had not laid out yet). Mapbox measures
 *      once on construction, so it paints its background colour and nothing
 *      else. The ResizeObserver below fixes this permanently.
 *   3. Server rendering. mapbox-gl touches `window` at module scope, so this
 *      component must only ever be loaded with ssr: false. See MapPanel.
 */

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export type MapMarker = {
  id: string;
  longitude: number;
  latitude: number;
  label?: string;
  /** Sequence number for trip stops. Omit for unordered markers. */
  sequence?: number;
  /** One of the app's status colours. Defaults to primary. */
  colour?: string;
};

export type MapLine = {
  id: string;
  coordinates: [number, number][];
  /** Dashed for flights, solid for ground travel. */
  dashed?: boolean;
  colour?: string;
};

type Props = {
  markers?: MapMarker[];
  lines?: MapLine[];
  /** Fit the viewport to all markers whenever they change. */
  fitToMarkers?: boolean;
  /** Used only when there is nothing to fit to. */
  initialCenter?: [number, number];
  initialZoom?: number;
  interactive?: boolean;
  onMarkerClick?: (id: string) => void;
  className?: string;
};

const STYLE_URL = 'mapbox://styles/mapbox/dark-v11';

export default function BaseMap({
  markers = [],
  lines = [],
  fitToMarkers = true,
  initialCenter = [153.026, -27.4705], // Brisbane
  initialZoom = 9,
  interactive = true,
  onMarkerClick,
  className = '',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRefs = useRef<mapboxgl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- init -----------------------------------------------------------------
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      // Deferred, not called synchronously in the effect body -- same
      // cascading-render lint rule (and fix) as place-map.tsx's own
      // identical "no token" branch.
      const timer = setTimeout(
        () => setError('NEXT_PUBLIC_MAPBOX_TOKEN is not set.'),
        0,
      );
      return () => clearTimeout(timer);
    }
    mapboxgl.accessToken = token;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: initialCenter,
        zoom: initialZoom,
        interactive,
        attributionControl: true,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Map failed to initialise.';
      const timer = setTimeout(() => setError(message), 0);
      return () => clearTimeout(timer);
    }

    mapRef.current = map;

    if (interactive) {
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    }

    map.on('load', () => {
      // A map constructed in a zero-size container measures itself as 0x0 and
      // renders only its background. Re-measuring on load covers the common
      // case; the ResizeObserver below covers every later case.
      map.resize();
      setReady(true);
    });

    map.on('error', (e) => {
      // Surface the real cause instead of leaving a silent dark box. An
      // invalid or URL-restricted token reports here, not as a thrown error.
      const msg = e.error?.message ?? 'Map error';
      setError(msg);
      console.error('[BaseMap]', e.error ?? e);
    });

    return () => {
      markerRefs.current.forEach((m) => m.remove());
      markerRefs.current = [];
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Intentionally mount-only. Changing initial view props does not re-create
    // the map; use fitToMarkers or an imperative call instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- keep the canvas matched to the container -----------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ---- markers --------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    markerRefs.current.forEach((m) => m.remove());
    markerRefs.current = [];

    markers.forEach((m) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'starmap-marker';
      el.style.cssText = `
        width: 28px; height: 28px; border-radius: 9999px;
        background: ${m.colour ?? 'var(--primary)'};
        border: 2px solid var(--bg-deep);
        color: var(--bg-deep);
        font: 600 12px/1 ui-sans-serif, system-ui, sans-serif;
        display: flex; align-items: center; justify-content: center;
        cursor: ${onMarkerClick ? 'pointer' : 'default'};
        box-shadow: 0 2px 8px rgb(0 0 0 / 0.4);
      `;
      if (m.sequence !== undefined) el.textContent = String(m.sequence + 1);
      if (m.label) el.setAttribute('aria-label', m.label);

      if (onMarkerClick) {
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onMarkerClick(m.id);
        });
      }

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([m.longitude, m.latitude])
        .addTo(map);

      if (m.label) {
        marker.setPopup(
          new mapboxgl.Popup({ offset: 18, closeButton: false }).setText(m.label),
        );
      }

      markerRefs.current.push(marker);
    });
  }, [markers, ready, onMarkerClick]);

  // ---- lines ----------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Remove previously drawn routes before redrawing.
    const existing = map.getStyle()?.layers ?? [];
    existing.forEach((layer) => {
      if (layer.id.startsWith('route-')) {
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
        if (map.getSource(layer.id)) map.removeSource(layer.id);
      }
    });

    lines.forEach((line) => {
      if (line.coordinates.length < 2) return;
      const id = `route-${line.id}`;

      map.addSource(id, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: line.coordinates },
        },
      });

      map.addLayer({
        id,
        type: 'line',
        source: id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': line.colour ?? '#8B7BD8',
          'line-width': 2.5,
          'line-opacity': 0.85,
          ...(line.dashed ? { 'line-dasharray': [2, 2] } : {}),
        },
      });
    });
  }, [lines, ready]);

  // ---- fit ------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !fitToMarkers || markers.length === 0) return;

    if (markers.length === 1) {
      map.easeTo({
        center: [markers[0]!.longitude, markers[0]!.latitude],
        zoom: 10,
        duration: 600,
      });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    markers.forEach((m) => bounds.extend([m.longitude, m.latitude]));
    map.fitBounds(bounds, { padding: 64, maxZoom: 12, duration: 600 });
  }, [markers, ready, fitToMarkers]);

  return (
    <div className={`relative ${className}`}>
      {/* An explicit height is required. A bare flex child with no height
          resolves to 0 and Mapbox renders nothing but its background. */}
      <div ref={containerRef} className="h-full w-full rounded-lg" />

      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-[var(--bg-surface)]">
          <span className="text-sm text-[var(--text-muted)]">Loading map…</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-[var(--bg-surface)] p-4">
          <p className="text-center text-sm text-[var(--text-muted)]">
            Derek here. The map didn&apos;t load: {error}
          </p>
        </div>
      )}
    </div>
  );
}