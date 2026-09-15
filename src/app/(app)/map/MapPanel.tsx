'use client';

/**
 * MapPanel — the only thing pages should import.
 *
 * mapbox-gl reads `window` at module scope, so it must never be evaluated on
 * the server. Importing BaseMap directly from a page works in dev and then
 * fails the production build with "window is not defined" — or worse, renders
 * an empty container. Everything goes through this wrapper.
 *
 * The wrapper also owns the height. Mapbox needs a container with a resolved
 * height; a flex child with none collapses to zero and shows only its
 * background colour, which is the dark-box symptom.
 */

import dynamic from 'next/dynamic';
import type { MapMarker, MapLine } from './BaseMap';

const BaseMap = dynamic(() => import('./BaseMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-lg bg-[var(--bg-surface)]">
      <span className="text-sm text-[var(--text-muted)]">Loading map…</span>
    </div>
  ),
});

type Props = {
  markers?: MapMarker[];
  lines?: MapLine[];
  fitToMarkers?: boolean;
  initialCenter?: [number, number];
  initialZoom?: number;
  interactive?: boolean;
  onMarkerClick?: (id: string) => void;
  /** Tailwind height class. Must resolve to a real height. */
  height?: string;
};

export default function MapPanel({ height = 'h-[420px]', ...props }: Props) {
  return (
    <div className={`${height} w-full overflow-hidden rounded-lg`}>
      <BaseMap {...props} className="h-full w-full" />
    </div>
  );
}

export type { MapMarker, MapLine };