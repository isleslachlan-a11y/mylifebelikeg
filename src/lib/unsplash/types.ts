/**
 * Isomorphic — no `fetch`, no `process.env`, safe to import from a Client
 * Component (`<UnsplashAttribution>`, `<PhotoPicker>`) as well as the
 * server-only route handlers. Keep it that way: the access-key-reading
 * code lives exclusively in `server.ts`, so a client bundle importing
 * *this* file never pulls in anything that could leak the key.
 */

/** Unsplash's own attribution guidelines name this exact pair — see P6.0 brief and `supabase/local/001 smoke test`'s fixture, which already bakes `utm_source=starmap` into a stored `unsplash_author_url`. */
export const UNSPLASH_UTM_SOURCE = "starmap";
export const UNSPLASH_UTM_MEDIUM = "referral";

/** Appends (or overwrites) the required `utm_source`/`utm_medium` query params on any Unsplash-hosted link — a photographer's profile URL or the unsplash.com homepage. */
export function withUnsplashUtmParams(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("utm_source", UNSPLASH_UTM_SOURCE);
  parsed.searchParams.set("utm_medium", UNSPLASH_UTM_MEDIUM);
  return parsed.toString();
}

/** The "on Unsplash" half of the required attribution — same link everywhere, so it's a constant rather than recomputed per render. */
export const UNSPLASH_HOME_URL = withUnsplashUtmParams("https://unsplash.com/");

/**
 * The trimmed shape `/api/unsplash/search` returns and `<PhotoPicker>`
 * hands back on selection — exactly what a caller needs to both render a
 * pick (thumb, alt text) and persist one (the `unsplash_*` columns on
 * `someday_items`/`trip_stops`, per Schema.MD). `downloadLocation` is
 * carried through unmodified so `/api/unsplash/download` can trigger the
 * exact per-result URL Unsplash returned, not a reconstructed one.
 */
export type UnsplashPhotoResult = {
  id: string;
  thumbUrl: string;
  fullUrl: string;
  altDescription: string | null;
  width: number;
  height: number;
  authorName: string;
  /** Profile URL, utm params already attached — store this verbatim as `unsplash_author_url`. */
  authorUrl: string;
  downloadLocation: string;
};

/** The subset of a stored row `<UnsplashAttribution>` needs — matches `someday_items`/`trip_stops`' `unsplash_author_name`/`unsplash_author_url` columns without depending on either table's generated Row type. */
export type UnsplashAttributionInput = {
  authorName: string;
  authorUrl: string;
};
