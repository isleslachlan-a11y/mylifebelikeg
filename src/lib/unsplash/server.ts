import { withUnsplashUtmParams, type UnsplashPhotoResult } from "./types";

/**
 * Server-only: the only file in this directory that reads
 * `UNSPLASH_ACCESS_KEY` or calls `fetch` against api.unsplash.com. Both
 * route handlers (`/api/unsplash/search`, `/api/unsplash/download`) are
 * the only call sites — never imported from a Client Component. Mirrors
 * `src/app/api/fx/refresh/route.ts`'s "server-only, key never reaches the
 * browser" shape, just without a dedicated client-constructor file since
 * there's no Supabase client involved here.
 */

const UNSPLASH_API_BASE = "https://api.unsplash.com";
const RESULTS_PER_PAGE = 24;

export class UnsplashConfigError extends Error {
  constructor() {
    super("UNSPLASH_ACCESS_KEY is not configured.");
    this.name = "UnsplashConfigError";
  }
}

export class UnsplashRateLimitError extends Error {
  constructor() {
    super("Unsplash rate limit exceeded.");
    this.name = "UnsplashRateLimitError";
  }
}

function getAccessKey(): string {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new UnsplashConfigError();
  return key;
}

/**
 * Shared fetch wrapper for both the search and download calls. Unsplash
 * returns a bare 403 for both "bad key" and "rate limit exceeded" — the
 * `X-Ratelimit-Remaining` header is what actually distinguishes them
 * (per Unsplash's own docs), so that's checked first rather than treating
 * every 403 as a rate limit.
 */
async function unsplashFetch(url: string | URL): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${getAccessKey()}` },
    // Every call here is a live, user-triggered search or a one-shot
    // download trigger — never something safe to serve stale from a
    // shared HTTP cache. (Our own in-memory search cache below is a
    // separate, deliberate layer on top of this.)
    cache: "no-store",
  });

  if (res.status === 403 && res.headers.get("X-Ratelimit-Remaining") === "0") {
    throw new UnsplashRateLimitError();
  }
  if (!res.ok) {
    throw new Error(`Unsplash request failed: ${res.status} ${res.statusText}`);
  }
  return res;
}

type RawUnsplashPhoto = {
  id: string;
  width: number;
  height: number;
  description: string | null;
  alt_description: string | null;
  urls: { thumb: string; small: string; regular: string; full: string };
  links: { download_location: string };
  user: { name: string; links: { html: string } };
};

function mapPhoto(raw: RawUnsplashPhoto): UnsplashPhotoResult {
  return {
    id: raw.id,
    thumbUrl: raw.urls.small,
    fullUrl: raw.urls.regular,
    altDescription: raw.alt_description ?? raw.description ?? null,
    width: raw.width,
    height: raw.height,
    authorName: raw.user.name,
    authorUrl: withUnsplashUtmParams(raw.user.links.html),
    downloadLocation: raw.links.download_location,
  };
}

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Module-scope, best-effort only — a warm serverless instance keeps it
 * across requests, a cold start or a different concurrent instance
 * doesn't share it. Not a substitute for `<PhotoPicker>`'s own
 * per-mount client cache (which is what actually protects the 50/hour
 * demo-tier limit during normal typing/re-search), just a second layer
 * that helps for real in dev and on a single warm instance.
 */
const searchCache = new Map<
  string,
  { results: UnsplashPhotoResult[]; expiresAt: number }
>();

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export async function searchUnsplashPhotos(
  query: string,
): Promise<UnsplashPhotoResult[]> {
  const cacheKey = normalizeQuery(query);
  if (!cacheKey) return [];

  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results;
  }

  const url = new URL(`${UNSPLASH_API_BASE}/search/photos`);
  url.searchParams.set("query", cacheKey);
  url.searchParams.set("per_page", String(RESULTS_PER_PAGE));

  const res = await unsplashFetch(url);
  const body = (await res.json()) as { results: RawUnsplashPhoto[] };
  const results = body.results.map(mapPhoto);

  searchCache.set(cacheKey, {
    results,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
  return results;
}

/**
 * Fires the download-tracking trigger Unsplash's API terms require on
 * selection (not on display) — see P6.0 brief. `downloadLocation` is
 * whatever `searchUnsplashPhotos` returned for that exact photo, passed
 * back through unmodified by the caller; validated to actually be an
 * api.unsplash.com URL before this server makes a request to it, since
 * it's otherwise a client-supplied string reaching server-side `fetch`.
 */
export async function triggerUnsplashDownload(
  downloadLocation: string,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(downloadLocation);
  } catch {
    throw new Error("Invalid download location.");
  }
  if (parsed.hostname !== "api.unsplash.com") {
    throw new Error("Refusing to trigger a non-Unsplash download URL.");
  }

  await unsplashFetch(parsed);
}
