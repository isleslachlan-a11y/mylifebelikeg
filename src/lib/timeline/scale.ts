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

/**
 * P3.0's five timeline zoom levels, coarsest to finest reading top to
 * bottom in every table/switch that enumerates them.
 */
export type ZoomLevel = "day" | "week" | "month" | "quarter" | "year";

const MS_PER_DAY = 86_400_000;

/**
 * Per-zoom domain span (in days) and default tick density, from
 * PHASE-3-REQUIREMENTS.MD's P3.0 table. Starting values to tune, not
 * fixed constants.
 *
 * `maxSpanDays` is the key departure from `createTimelineScale`: there
 * the domain is whatever the caller passes in (typically the data
 * extent), but at day zoom a multi-year extent is unrenderable — the
 * container would be enormous and almost entirely off-screen. So here
 * the domain is a function of zoom level, centred on the scroll anchor,
 * capped at a span that stays renderable.
 *
 * `tickCount` is a hint to d3-scale's "nice" tick picker (see the module
 * doc above for why we lean on d3 rather than hand-roll this — R7),
 * tuned to land close to the stated tick interval over `maxSpanDays`
 * (e.g. week zoom's 26 ~= one tick per week across a 6-month span). It's
 * a count, not an interval lock — d3 still decides the actual
 * boundaries.
 */
const ZOOM_CONFIG: Record<
  ZoomLevel,
  { maxSpanDays: number; tickCount: number }
> = {
  day: { maxSpanDays: 30, tickCount: 30 }, // ~1 tick/day
  week: { maxSpanDays: 182, tickCount: 26 }, // ~1 tick/week over 6 months
  month: { maxSpanDays: 730, tickCount: 24 }, // ~1 tick/month over 2 years
  quarter: { maxSpanDays: 1825, tickCount: 20 }, // ~1 tick/quarter over 5 years
  year: { maxSpanDays: 7300, tickCount: 20 }, // ~1 tick/year over 20 years
};

export type MultiZoomScale = {
  /** Pixel position for `date` within the current zoom's domain. */
  toPixel(date: Date): number;
  /** Inverse of `toPixel` — the date at pixel `px`. */
  toDate(px: number): Date;
  /** Roughly `count` (defaults to the zoom's tuned density) "nice" tick dates. */
  ticks(count?: number): Date[];
  /** The [start, end] dates this zoom/anchor combination actually maps, after centring and capping to `maxSpanDays`. */
  domain: [Date, Date];
  /** Average pixels per day across the domain — informational (e.g. for deciding render density), not used internally. */
  pxPerDay: number;
};

/**
 * A zoom-aware scale (P3.0): the domain isn't passed in, it's derived
 * from `zoom` and centred on `anchorDate` (the current scroll position),
 * per `ZOOM_CONFIG`. Everything else about this module's contract holds
 * — plain `Date`s in, numbers out, no layout or component concerns.
 *
 * @param zoom one of the five zoom levels.
 * @param anchorDate the date the domain is centred on (the scroll anchor).
 * @param rangePx total pixel width available; the domain maps to `[0, rangePx]`.
 */
export function createScale(
  zoom: ZoomLevel,
  anchorDate: Date,
  rangePx: number,
): MultiZoomScale {
  const { maxSpanDays, tickCount } = ZOOM_CONFIG[zoom];
  const halfSpanMs = (maxSpanDays * MS_PER_DAY) / 2;
  const domain: [Date, Date] = [
    new Date(anchorDate.getTime() - halfSpanMs),
    new Date(anchorDate.getTime() + halfSpanMs),
  ];
  const scale = scaleTime().domain(domain).range([0, rangePx]);

  return {
    toPixel: (date) => scale(date),
    toDate: (px) => scale.invert(px),
    ticks: (count = tickCount) => scale.ticks(count),
    domain,
    pxPerDay: rangePx / maxSpanDays,
  };
}

/**
 * Rendered pixel width for an item spanning `startDate`–`endDate` at
 * `scale`. Exists so call sites reach for this instead of branching on
 * `duration_days` (or reimplementing `toPixel(end) - toPixel(start)`
 * inline) — R1's whole point is that sticky-label and truncation
 * decisions must key off *rendered pixel width at the current zoom*,
 * never off calendar duration. Takes any scale shape (`TimelineScale` or
 * `MultiZoomScale`) that can place a single date.
 */
export function widthForItem(
  startDate: Date,
  endDate: Date,
  scale: { toPixel(date: Date): number },
): number {
  return scale.toPixel(endDate) - scale.toPixel(startDate);
}
