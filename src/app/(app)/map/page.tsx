'use client';

/**
 * /map — everything you want to do, everywhere you've planned to go.
 *
 * Dreams (someday_items) and planned stops (trip_stops) on one map.
 * The legend counts and the markers come from the SAME arrays, so a mismatch
 * between "2 dreams" and two visible markers means coordinates are missing,
 * not that the map failed.
 */

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import MapPanel, { type MapMarker } from './MapPanel';

type Place = {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  kind: 'dream' | 'planned' | 'visited';
};

const COLOURS: Record<Place['kind'], string> = {
  dream: '#B9A9F5',   // primary-soft
  planned: '#8B7BD8', // primary
  visited: '#F5D89E', // star
};

export default function MapPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      // Always destructure `error` — the Supabase client returns errors, it
      // does not throw. An unchecked call is a silent null and a blank page.
      const [dreams, stops] = await Promise.all([
        supabase
          .from('someday_items')
          .select('id, title, latitude, longitude')
          .is('deleted_at', null)
          .not('latitude', 'is', null),
        supabase
          .from('trip_stops')
          .select('id, name, latitude, longitude, booking_state, trips!inner(goals!inner(state))')
          .is('deleted_at', null)
          .not('latitude', 'is', null),
      ]);

      if (dreams.error || stops.error) {
        setError(dreams.error?.message ?? stops.error?.message ?? 'Could not load places.');
        setLoading(false);
        return;
      }

      const next: Place[] = [
        ...(dreams.data ?? []).map((d) => ({
          id: `dream-${d.id}`,
          name: d.title,
          longitude: d.longitude as number,
          latitude: d.latitude as number,
          kind: 'dream' as const,
        })),
        ...(stops.data ?? []).map((s) => {
          const goalState = (s as unknown as { trips: { goals: { state: string } } })
            .trips?.goals?.state;
          return {
            id: `stop-${s.id}`,
            name: s.name,
            longitude: s.longitude as number,
            latitude: s.latitude as number,
            kind: (goalState === 'completed' ? 'visited' : 'planned') as Place['kind'],
          };
        }),
      ];

      setPlaces(next);
      setLoading(false);
    })();
  }, []);

  const markers = useMemo<MapMarker[]>(
    () =>
      places.map((p) => ({
        id: p.id,
        longitude: p.longitude,
        latitude: p.latitude,
        label: p.name,
        colour: COLOURS[p.kind],
      })),
    [places],
  );

  const counts = useMemo(
    () => ({
      dream: places.filter((p) => p.kind === 'dream').length,
      planned: places.filter((p) => p.kind === 'planned').length,
      visited: places.filter((p) => p.kind === 'visited').length,
    }),
    [places],
  );

  const selectedPlace = places.find((p) => p.id === selected);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl text-[var(--text-primary)]">Map</h1>
        <p className="text-[var(--text-muted)]">
          Everything you want to do, everywhere you&apos;ve planned to go.
        </p>
      </div>

      <div className="flex flex-wrap gap-6 text-sm text-[var(--text-muted)]">
        <Legend colour={COLOURS.dream} label={`${counts.dream} dreams`} />
        <Legend colour={COLOURS.planned} label={`${counts.planned} planned stops`} />
        <Legend colour={COLOURS.visited} label={`${counts.visited} visited`} />
      </div>

      {error && (
        <p className="rounded-lg bg-[var(--bg-surface)] p-4 text-sm text-[var(--text-muted)]">
          Derek here. Couldn&apos;t load your places: {error}
        </p>
      )}

      {!loading && places.length === 0 && !error && (
        <p className="rounded-lg bg-[var(--bg-surface)] p-4 text-sm text-[var(--text-muted)]">
          Fluffy here! Nothing on the map yet. Add a place to your bucket list and
          it&apos;ll show up.
        </p>
      )}

      <MapPanel
        height="h-[70vh] min-h-[420px]"
        markers={markers}
        onMarkerClick={setSelected}
      />

      {selectedPlace && (
        <div className="rounded-lg bg-[var(--bg-surface)] p-4">
          <p className="text-[var(--text-primary)]">{selectedPlace.name}</p>
          <p className="text-sm text-[var(--text-muted)]">
            {selectedPlace.kind === 'dream'
              ? 'On your bucket list'
              : selectedPlace.kind === 'planned'
                ? 'A planned stop'
                : 'Visited'}
          </p>
        </div>
      )}
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: colour }}
      />
      {label}
    </span>
  );
}