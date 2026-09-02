import type { MapboxPlaceResult } from "./types";

/**
 * Server-only: the only file in this directory that reads
 * `MAPBOX_SECRET_TOKEN` or calls `fetch` against api.mapbox.com.
 * `/api/geocode/route.ts` is the only call site — never imported from a
 * Client Component. Same shape as `src/lib/unsplash/server.ts` (P6.0):
 * a secret-scoped token, kept server-side, distinct from the
 * `NEXT_PUBLIC_MAPBOX_TOKEN` the browser map (`<PlaceMap>`) uses
 * directly — see that component's own comment on why a public,
 * URL-restricted token is the *correct* place for client-side use, not
 * a workaround.
 */

const GEOCODE_API_BASE = "https://api.mapbox.com/search/geocode/v6/forward";
const RESULT_LIMIT = 5;

export class MapboxConfigError extends Error {
  constructor() {
    super("MAPBOX_SECRET_TOKEN is not configured.");
    this.name = "MapboxConfigError";
  }
}

function getAccessToken(): string {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) throw new MapboxConfigError();
  return token;
}

type RawGeocodeFeature = {
  properties: {
    mapbox_id: string;
    name: string;
    full_address?: string | null;
    place_formatted?: string | null;
    context?: {
      country?: { country_code?: string | null } | null;
    } | null;
  };
  geometry: { coordinates: [number, number] };
};

function mapFeature(raw: RawGeocodeFeature): MapboxPlaceResult {
  const [longitude, latitude] = raw.geometry.coordinates;
  const countryCode = raw.properties.context?.country?.country_code;
  return {
    id: raw.properties.mapbox_id,
    name: raw.properties.name,
    fullAddress:
      raw.properties.full_address ?? raw.properties.place_formatted ?? null,
    latitude,
    longitude,
    countryCode: countryCode ? countryCode.toUpperCase() : null,
  };
}

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

/** Same best-effort, module-scope caching rationale as `unsplash/server.ts`'s own `searchCache` — helps for real in dev and on a single warm instance, not a substitute for `<PlacePicker>`'s own per-mount client cache. */
const searchCache = new Map<
  string,
  { results: MapboxPlaceResult[]; expiresAt: number }
>();

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export async function geocodePlace(
  query: string,
): Promise<MapboxPlaceResult[]> {
  const cacheKey = normalizeQuery(query);
  if (!cacheKey) return [];

  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results;
  }

  const url = new URL(GEOCODE_API_BASE);
  url.searchParams.set("q", cacheKey);
  url.searchParams.set("limit", String(RESULT_LIMIT));
  url.searchParams.set("access_token", getAccessToken());

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Mapbox geocoding failed: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as { features: RawGeocodeFeature[] };
  const results = body.features.map(mapFeature);

  searchCache.set(cacheKey, {
    results,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
  return results;
}
