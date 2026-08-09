import { scaleTime } from "d3-scale";

/**
 * Date↔pixel conversion for timelines. Orientation-agnostic on purpose
 * (PHASE-3-REQUIREMENTS.MD's R6): `toPixel`/`toPixelSpan` each produce a
 * single number, and it's the caller's job to apply that to `left`/
 * `width` (horizontal) or `top`/`height` (vertical) — this module has no
 * opinion on layout, orientation, or components. Shared between P1.11's
 * per-goal mini timeline and whatever Phase 3 builds; keep it that way
 * — don't let layout or component concerns creep in here.
 *
 * Works in plain `Date` objects, not this app's bare-date strings
 * (`"YYYY-MM-DD"`, see `src/lib/dates.ts`) — that's a deliberate
 * boundary. Bare-date-string handling is a domain convention specific to
 * this app's schema; this module is meant to be reusable as-is.
 * Converting a bare date to a `Date` is safe with a plain
 * `new Date(dateString)`: a date-only ISO string (no time component) is
 * specified to parse as UTC midnight, unlike a date-*time* string
 * without an offset, which parses as local time.
 */
export type TimelineScale = {
  /** Pixel position for `date` within the configured range. */
  toPixel(date: Date): number;
  /** Pixel distance between two dates — e.g. a bar's width. Always >= 0 for `end >= start`. */
  toPixelSpan(start: Date, end: Date): number;
  /** Roughly `count` "nice" tick dates spanning the domain (via d3's scaleTime().ticks()) — sensible boundaries (day/week/month/year), not naive even spacing. */
  ticks(count?: number): Date[];
};

/**
 * @param domain [start, end] dates the scale maps *from*.
 * @param range [min, max] pixels the scale maps *to*.
 */
export function createTimelineScale(
  domain: [Date, Date],
  range: [number, number],
): TimelineScale {
  const scale = scaleTime().domain(domain).range(range);

  return {
    toPixel: (date) => scale(date),
    toPixelSpan: (start, end) => scale(end) - scale(start),
    ticks: (count = 6) => scale.ticks(count),
  };
}
