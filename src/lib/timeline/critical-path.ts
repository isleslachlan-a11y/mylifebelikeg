import type { ZoomLevel } from "./scale";

/**
 * P5.1's critical-path highlighting and dependency-arrow routing. Pure,
 * no React/DOM — same convention as the rest of `timeline/`. Two
 * genuinely separate concerns live here, both shared between
 * `horizontal-timeline.tsx` and `vertical-timeline.tsx`:
 *
 * - Which edges are even worth drawing (`selectCriticalPathEdges`) — a
 *   filtering decision, orientation-independent.
 * - How to route one edge as a right-angle polyline
 *   (`routeOrthogonal`) — genuinely orientation-agnostic like `scale.ts`:
 *   it works in an abstract (primary, cross) space, where "primary" is
 *   the time axis and "cross" is whatever runs perpendicular to it (lane
 *   Y in the horizontal layout, column X in the vertical one, per R6's
 *   usual split). Each orientation component maps (primary, cross) to
 *   real (x, y) itself — the same boundary `scale.ts` already draws
 *   between "pixel maths" and "which screen axis that maths applies to."
 *
 * `shouldShowCriticalPathArrows` is the one exception to this app's
 * "decide from rendered pixels, never the zoom label" rule (R1) that the
 * rest of `timeline/` follows — the brief names the suppressed levels
 * directly ("at year and quarter zoom, suppress arrows entirely"), and
 * unlike R1's label/collision decisions (which genuinely vary with
 * `rangePx` at a fixed zoom), arrow clutter is what the brief is
 * actually keying off, not a measured pixel density.
 */

export type CriticalPathEdge = {
  /** `task_dependencies.id` — used as the React key for the rendered arrow. */
  edgeId: string;
  predecessorTaskId: string;
  successorTaskId: string;
};

/** Minimal shape `selectCriticalPathEdges` needs from a dependency row — matches `task_dependencies`'s own column names loosely typed, not the full generated `Row`, so callers don't have to import `Database` just to filter edges. */
export type DependencyEdgeInput = {
  id: string;
  predecessor_task_id: string;
  successor_task_id: string;
};

/**
 * Filters `dependencies` down to the ones worth drawing: both ends on
 * the critical path *and* both ends currently rendered.
 * `renderedCriticalTaskIds` is the caller's job to build (critical +
 * windowed-in + not sitting inside a collapsed lane) — this function
 * doesn't know about lanes or collapse state, only about which task ids
 * currently have a rect to point an arrow at. An edge missing either end
 * has nothing to draw between, so it's dropped rather than rendered
 * with a dangling side — same "known, accepted limitation, not a bug"
 * reasoning `lanes.ts`'s own module doc gives for its synthetic
 * fallback lane.
 */
export function selectCriticalPathEdges(
  dependencies: DependencyEdgeInput[],
  renderedCriticalTaskIds: ReadonlySet<string>,
): CriticalPathEdge[] {
  return dependencies
    .filter(
      (dep) =>
        renderedCriticalTaskIds.has(dep.predecessor_task_id) &&
        renderedCriticalTaskIds.has(dep.successor_task_id),
    )
    .map((dep) => ({
      edgeId: dep.id,
      predecessorTaskId: dep.predecessor_task_id,
      successorTaskId: dep.successor_task_id,
    }));
}

/** One item's rendered rect in the abstract (primary, cross) space `routeOrthogonal` works in — see the module doc. */
export type AnchorRect = {
  /** Pixel position along the time axis where this item's bar begins. */
  primaryStart: number;
  /** Pixel position along the time axis where this item's bar ends. */
  primaryEnd: number;
  /** Pixel position along the cross axis at the bar's centre — already resolved to one shared coordinate space by the caller (cumulative lane offset + in-lane row offset, or the vertical layout's column offset). */
  cross: number;
};

export type OrthogonalPoint = { primary: number; cross: number };

export type RouteOrthogonalOptions = {
  /** How far the route travels along the primary axis, out from the predecessor and in to the successor, before the cross-axis turn — keeps the elbow from starting its turn flush against a bar's edge. Defaults to 6px. */
  leadPx?: number;
};

const DEFAULT_LEAD_PX = 6;

/**
 * A right-angle elbow route from `from` (a predecessor's exit point) to
 * `to` (a successor's entry point) — orthogonal polylines, not curves
 * (brief: "they stay readable at every zoom and don't need recomputing
 * when lane heights change" — a curve's control points would, a
 * straight-segment polyline's endpoints don't need anything beyond the
 * two rects that were already computed for the bars themselves).
 *
 * Same `cross` value (same lane/column — the common case: same-goal
 * tasks usually share a lane, except under "owner" grouping where a
 * goal's tasks can have different `owner_id`s): a single straight
 * segment, predecessor's `primaryEnd` to successor's `primaryStart`, no
 * elbow needed.
 *
 * Different `cross` value ("route through the gutter between them",
 * brief, verbatim): a 3-segment elbow — out from the predecessor a
 * short `leadPx` on the primary axis, across to the successor's `cross`
 * value, then in to the successor's `primaryStart`. The turn happens at
 * the midpoint between the two `leadPx` offsets rather than fixed to
 * either end, which is what makes it read as passing *between* the two
 * lanes/columns rather than hugging one bar's edge.
 *
 * Assumes `from` ends at or before `to` starts (true for the common
 * zero-lag finish-to-start default — P5.0's one-click predecessor —
 * where CPM guarantees `predecessor.computed_end <= successor.computed_start`).
 * The other three dependency types (P5.0's "editable after the fact,
 * not the common case") can have a predecessor whose bar ends after the
 * successor's starts; this still produces a valid (if visually
 * backwards-leaning) polyline in that case rather than crashing, since
 * nothing here divides by the primary gap or assumes its sign — not
 * worth a special case for an edge type the UI itself steers away from.
 */
export function routeOrthogonal(
  from: AnchorRect,
  to: AnchorRect,
  opts: RouteOrthogonalOptions = {},
): OrthogonalPoint[] {
  const leadPx = opts.leadPx ?? DEFAULT_LEAD_PX;
  const start: OrthogonalPoint = {
    primary: from.primaryEnd,
    cross: from.cross,
  };
  const end: OrthogonalPoint = { primary: to.primaryStart, cross: to.cross };

  if (from.cross === to.cross) {
    return [start, end];
  }

  const outPrimary = start.primary + leadPx;
  const inPrimary = end.primary - leadPx;
  // If the two leads would cross (a short gap, or a backwards-leaning
  // non-FS edge — see the doc above), split the actual gap down the
  // middle instead of overshooting past the successor's own start.
  const turnPrimary =
    outPrimary <= inPrimary
      ? (outPrimary + inPrimary) / 2
      : (start.primary + end.primary) / 2;

  return [
    start,
    { primary: turnPrimary, cross: start.cross },
    { primary: turnPrimary, cross: end.cross },
    end,
  ];
}

/**
 * `points` (from `routeOrthogonal`) rendered as an SVG `points`
 * attribute value, in whichever real (x, y) mapping the caller's
 * orientation uses — a thin formatting step so neither orientation
 * component reimplements `"x,y x,y ..."` string-building itself.
 */
export function toSvgPoints(
  points: OrthogonalPoint[],
  toXY: (point: OrthogonalPoint) => { x: number; y: number },
): string {
  return points
    .map((point) => {
      const { x, y } = toXY(point);
      return `${x},${y}`;
    })
    .join(" ");
}

/**
 * The one zoom-label-keyed decision in `timeline/` — see the module doc
 * for why this departs from R1. Quarter and year are illegible/clutter
 * at the density the brief calls out; day/week/month all show arrows.
 */
export function shouldShowCriticalPathArrows(zoom: ZoomLevel): boolean {
  return zoom !== "quarter" && zoom !== "year";
}
