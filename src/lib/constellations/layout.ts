/**
 * P5.3's pure layout math for the constellation archive (`/constellations`).
 * Two genuinely separate concerns, same split `timeline/` already
 * follows: positioning the stars *within* one constellation
 * (`layoutConstellation`), and how constellations recede with age
 * *across* the whole page (`computeDepth`, `groupByYear`). No React/DOM,
 * no `Date` objects even — every timestamp here is compared as a raw
 * millisecond number via `Date.parse`, since nothing in this module
 * needs calendar semantics (a bare-date/timezone split the way
 * `dates.ts` draws it), only relative ordering and spacing.
 *
 * Deterministic on purpose: positions are derived from each point's own
 * `id` via a stable string hash, never `Math.random()` — a server-
 * rendered SVG has to produce the same markup on every request (and
 * match on the client for hydration), and a fixed layout also means a
 * completed goal's constellation doesn't visibly rearrange itself between
 * visits.
 */

/**
 * A djb2 accumulation, finished with a Murmur3-style avalanche mix
 * (`fmix32`), mapped to [0, 1) — the one source of "randomness"
 * everything below (and `ConstellationFigure`'s own twinkle timing)
 * uses, always seeded by a real id string, never `Math.random()` or
 * wall-clock time.
 *
 * The finalizer isn't decoration: plain djb2 (`hash = hash*33 ^ c`)
 * barely nudges its own high bits for a short input — two or three
 * characters in, most of the 32-bit range is still zero, so ids that
 * differ only in their last character or two (verified directly against
 * this app's own real task/milestone UUIDs during P5.3's build, where
 * it wasn't actually a problem — but caught for real against short
 * placeholder ids in a manual render check, which is exactly the kind
 * of input this function has no way to rule out from a caller) come out
 * almost identical, clustering every star in a constellation onto
 * nearly the same `cy`. `Math.imul` keeps every multiply a real 32-bit
 * operation (avoiding float-precision drift for longer inputs); the
 * mix afterward — xor-shift, multiply, xor-shift, multiply, xor-shift —
 * scrambles bits thoroughly regardless of how many characters produced
 * them, so short and long ids spread just as evenly.
 */
export function hashToUnit(id: string): number {
  let hash = 5381;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash, 33) ^ id.charCodeAt(i);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  // >>> 0 forces an unsigned 32-bit value before normalising.
  return (hash >>> 0) / 0xffffffff;
}

export type ConstellationPoint = {
  id: string;
  title: string;
  /** Any parseable timestamp — when this point "lit" (a task's/milestone's own `completed_at`), or an ordering fallback for a point that never completed (see `buildConstellationPoints` in the component layer). */
  date: string;
  /** Milestones render brighter/bigger than tasks — the brief's own distinction ("completed milestones are brighter points"). */
  brightness: "bright" | "normal";
};

export type PositionedPoint = ConstellationPoint & {
  /** 0–100, a viewBox-relative coordinate — the component decides the actual SVG size. */
  cx: number;
  cy: number;
};

export type ConstellationLayout = {
  points: PositionedPoint[];
  /** Point ids in completion order (brief: "connected in completion order") — the polyline to draw, not a graph; consecutive ids in this array are the edges. */
  pathOrder: string[];
};

const CY_MIN = 14;
const CY_MAX = 86;

/**
 * Deterministic placement order (mirrors `stacking.ts`'s
 * `comparePlacementOrder` precedent): date ascending, id as the final
 * tiebreak so two points sharing an instant still resolve to one stable
 * order rather than depending on array arrival order.
 */
function comparePointOrder(
  a: ConstellationPoint,
  b: ConstellationPoint,
): number {
  const dateDiff = Date.parse(a.date) - Date.parse(b.date);
  if (dateDiff !== 0) return dateDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Positions every point of one constellation: `cx` is the point's date
 * normalised across this constellation's *own* span (0 at the earliest
 * point, 100 at the latest) — a goal completed over three years spreads
 * its stars wide, one completed in a week draws them tight, same
 * "rendered pixel width reflects real duration" instinct `scale.ts`
 * already has elsewhere in this app, just applied to a scatter instead
 * of a bar. A single point (or every point sharing one instant) has no
 * span to normalise, so it centres at `cx = 50` rather than dividing by
 * zero. `cy` is unrelated to time — purely the id hash, mapped into
 * `[CY_MIN, CY_MAX]` (inset from the edges so a star's glow/label never
 * clips the figure's own bounds) — this is what keeps a constellation
 * from just being a straight horizontal line.
 */
export function layoutConstellation(
  points: ConstellationPoint[],
): ConstellationLayout {
  if (points.length === 0) {
    return { points: [], pathOrder: [] };
  }

  const ordered = [...points].sort(comparePointOrder);
  const times = ordered.map((p) => Date.parse(p.date));
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const span = maxT - minT;

  const positioned: PositionedPoint[] = ordered.map((point, i) => {
    const cx = span > 0 ? ((times[i]! - minT) / span) * 100 : 50;
    const cy = CY_MIN + hashToUnit(point.id) * (CY_MAX - CY_MIN);
    return { ...point, cx, cy };
  });

  return { points: positioned, pathOrder: positioned.map((p) => p.id) };
}

export type DepthStyle = {
  /** Uniform SVG scale — 1 for the most recent group, receding toward `MIN_SCALE` for the oldest. */
  scale: number;
  /** Opacity — same recede-into-the-distance treatment, floored at `MIN_OPACITY` rather than fading to nothing (an old constellation should still be readable, just quieter). */
  opacity: number;
};

const MIN_SCALE = 0.55;
const MIN_OPACITY = 0.4;

/**
 * "Newer constellations sit in the foreground; older ones recede."
 * (brief, verbatim). `rank` is 0 for the most recent group (a year, in
 * practice — see `groupByYear`) and increases with age; the mapping is
 * linear in rank, not in elapsed time, so the recede effect stays
 * legible whether the archive spans 3 years or 30 — a fixed number of
 * discrete steps rather than a scale that could compress to nothing
 * over a long enough history.
 */
export function computeDepth(rank: number, total: number): DepthStyle {
  if (total <= 1) {
    return { scale: 1, opacity: 1 };
  }
  const t = Math.min(Math.max(rank / (total - 1), 0), 1);
  return {
    scale: 1 - t * (1 - MIN_SCALE),
    opacity: 1 - t * (1 - MIN_OPACITY),
  };
}

export type YearGroup<T> = {
  year: number;
  items: T[];
};

/**
 * Buckets constellations by the calendar year of `dateOf(item)` (a goal's
 * `completed_at`/`abandoned_at`), most recent year first — the archive's
 * own row structure (brief: "the page is a night sky that fills up over
 * the years") and the unit the year filter operates on. `Date.parse` +
 * `getUTCFullYear`, not a timezone-resolved `today`-style bare date:
 * unlike task-dates.ts's careful timezone handling for "what day is it
 * for this user right now," a goal's `completed_at` is a fixed historical
 * instant — which calendar year it falls in doesn't shift with a
 * viewer's timezone the way "is this overdue today" would.
 */
export function groupByYear<T>(
  items: T[],
  dateOf: (item: T) => string,
): YearGroup<T>[] {
  const buckets = new Map<number, T[]>();
  for (const item of items) {
    const year = new Date(dateOf(item)).getUTCFullYear();
    const bucket = buckets.get(year) ?? [];
    bucket.push(item);
    buckets.set(year, bucket);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, groupItems]) => ({ year, items: groupItems }));
}
