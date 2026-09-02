/**
 * Isomorphic — no `fetch`, no `mapbox-gl`, no `process.env`, safe to
 * import from a Client Component. Same split as `src/lib/unsplash/`
 * (P6.0): the token-reading network code lives exclusively in
 * `server.ts`, this file is just shapes and display constants.
 */

/** Dark style to match the app's night-sky palette (P6.2 brief, verbatim). */
export const MAPBOX_STYLE_URL = "mapbox://styles/mapbox/dark-v11";

/**
 * The app's purple, applied to markers and connecting lines (P6.2
 * brief) — the exact hex values behind `--primary`/`--primary-soft` in
 * globals.css. Duplicated here rather than read from the CSS custom
 * property at runtime: mapbox-gl's paint properties want a real colour
 * value up front, and hard-coding the pair keeps this file free of any
 * DOM dependency, consistent with the rest of this directory staying
 * isomorphic.
 */
export const MAP_MARKER_COLOUR = "#8b7bd8";
export const MAP_LINE_COLOUR = "#b9a9f5";

/**
 * P6.4's `/map` overview: "dreams in one colour, planned stops in
 * another, visited in the star token" (brief, verbatim) — dreams use
 * `MAP_LINE_COLOUR` (the lighter `--primary-soft` purple, already
 * established), planned stops use `MAP_MARKER_COLOUR` (the same purple
 * a trip's own map already draws its stops in — one place is one colour
 * everywhere it appears), and visited places get this: the exact hex
 * behind `--star` in globals.css, the app's one non-purple accent,
 * reserved for "completions, achievements, highlights" — a visited place
 * is exactly that.
 */
export const MAP_STAR_COLOUR = "#f5d89e";

/** The trimmed shape `/api/geocode` returns and `<PlacePicker>` hands back on selection — exactly what a caller needs to render a result and persist one (the `place_name`/`latitude`/`longitude`/`mapbox_place_id`/`country_code` columns shared by `someday_items` and `trip_stops`, per Schema.MD). */
export type MapboxPlaceResult = {
  id: string;
  name: string;
  /** A fuller label ("Kyoto, Kyoto Prefecture, Japan") for disambiguating similarly-named results in a list — not stored, display-only. */
  fullAddress: string | null;
  latitude: number;
  longitude: number;
  /** ISO 3166-1 alpha-2, uppercased — Mapbox returns it lowercase. */
  countryCode: string | null;
};
