"use client";

import { Fragment, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { isGracePeriod, type GoalRag } from "@/lib/rag";
import {
  routeOrthogonal,
  selectCriticalPathEdges,
  toSvgPoints,
  type AnchorRect,
  type CriticalPathEdge,
  type DependencyEdgeInput,
} from "@/lib/timeline/critical-path";
import {
  classifyItemStatus,
  isBeyondFinancialHorizon,
  type ItemVisualStatus,
} from "@/lib/timeline/item-status";
import type { Lane } from "@/lib/timeline/lanes";
import { computeOverlayLine, needsStickyLabel } from "@/lib/timeline/overlays";
import { widthForItem } from "@/lib/timeline/scale";
import { assignSubRows } from "@/lib/timeline/stacking";
import { cn } from "@/lib/utils";
import {
  toStackableItem,
  type DisplayTimelineItem,
} from "./timeline-item-adapter";

// P3.4's own layout constants — deliberately not exported, and not
// shared with vertical-timeline.tsx's own (P3.5, R6: "own its layout
// constants... do not share them with the vertical layout"). A number
// happening to match one used there is coincidence, not reuse.
const GUTTER_WIDTH_PX = 168;
const AXIS_HEIGHT_PX = 32;
const BAR_HEIGHT_PX = 20;
const ROW_GAP_PX = 4;
const LANE_PADDING_Y_PX = 6;
const LANE_HEADER_MIN_HEIGHT_PX = 40;
const DIAMOND_SIZE_PX = 10;
const MIN_BAR_WIDTH_PX = 4;
const GOAL_BAND_OPACITY = "opacity-15";
const MAX_CONTAINER_HEIGHT_PX = 640;
const DAY_MS = 86_400_000;
// P3.6: no real viewport measurement is wired up (this component has no
// ResizeObserver), so this stands in for "the item area a viewer can
// actually see at once" when deciding whether a label needs the sticky
// treatment's extra backdrop — a reasonable desktop content-width
// estimate, not a measurement. The sticky *positioning* itself (see
// ItemLabel) is applied unconditionally regardless of this constant's
// accuracy: `position: sticky` is inert on an item that never needs it,
// so correctness of the acceptance criteria never depends on this being
// exact, only the backdrop-chip styling's judgement does.
const ASSUMED_VIEWPORT_PX = 900;
// P5.1
const CRITICAL_PATH_ARROWHEAD_ID = "timeline-critical-path-arrowhead-h";

export type HorizontalTimelineScale = {
  toPixel(date: Date): number;
  ticks(count?: number): Date[];
  /**
   * Zoom-derived, anchor-independent (P3.8) — `computeLaneStackings`
   * memoises `assignSubRows` on this instead of the whole `scale`
   * object, since `scale` gets a new identity on every pan (anchor
   * change) even though relative pixel distances between two dates —
   * and therefore `assignSubRows`'s row assignments — only ever change
   * when zoom does.
   */
  pxPerDay: number;
};

export type HorizontalTimelineProps = {
  lanes: Lane<DisplayTimelineItem>[];
  scale: HorizontalTimelineScale;
  rangePx: number;
  /** Timezone-resolved, computed once per request by the caller (R2) — never `new Date()` in this component. */
  today: string;
  /**
   * Bare "YYYY-MM-DD" from `app.financial_horizon()` for the current
   * viewer, or `null` when they have no active funded goals — render
   * nothing in that case, not a line at epoch (P3.6).
   */
  financialHorizon: string | null;
  collapsedLaneIds: Set<string>;
  onToggleLane: (laneId: string) => void;
  /** The currently hovered/focused item (P3.7) — drives the ring highlight and which item `TimelineView` renders a hover card for. Not a click-selection; click navigates instead (`onNavigate`). */
  hoveredItemId: string | null;
  onHoverItem: (itemId: string | null) => void;
  /** Navigates to the item's goal — every item type resolves to `goal_id` (P3.7: "click an item -> navigate to its goal detail page"). */
  onNavigate: (goalId: string) => void;
  /**
   * From `v_goal_rag` (P4.2), keyed by `goal_id` — genuinely optional,
   * caller-supplied data this component has no way to compute itself
   * (same reason `ownerNames`/`goalTitles`/`scheduleVariances` already
   * are: `v_timeline_items` doesn't carry it). Goal bands render by RAG
   * when a goal has an entry here, replacing P3.4's original
   * `classifyItemStatus`-based colouring for goals specifically —
   * milestones and tasks keep that classification, since RAG is a
   * goal-level concept only. A goal missing from this map (map not
   * supplied at all, or no matching row) renders as a neutral
   * `bg-muted` band rather than falling back to the old date-based
   * classification, since that would silently reintroduce exactly the
   * colouring this is meant to replace.
   */
  goalRag?: Map<string, GoalRag>;
  /**
   * P5.1's "Show critical path" toggle — off by default, caller-owned
   * (`TimelineView`). Gates the bar outline treatment for critical
   * tasks. Arrows are gated separately (`showCriticalPathArrows`) since
   * they're suppressed at coarse zoom even while this stays on — the
   * acceptance criterion is explicit that zooming out hides arrows
   * without hiding the highlighting.
   */
  showCriticalPath?: boolean;
  /**
   * `showCriticalPath && shouldShowCriticalPathArrows(zoom)`, computed
   * by `TimelineView` — this component only ever sees `scale`'s
   * derived `pxPerDay`, not the `zoom` enum itself (R1's usual
   * boundary; see `critical-path.ts`'s module doc for why arrow
   * suppression is the one decision in `timeline/` that's keyed off the
   * zoom label rather than rendered pixels).
   */
  showCriticalPathArrows?: boolean;
  /**
   * Raw dependency edges among tasks `useCriticalPathEdges` currently
   * believes are on the critical path — this component still narrows
   * that down itself via `selectCriticalPathEdges` before drawing
   * anything, since "critical" here also has to mean "currently has a
   * rendered rect" (not windowed out, not in a collapsed lane).
   * Optional/empty is the normal state whenever the toggle is off or a
   * goal has no dependency network at all, not an error.
   */
  dependencyEdges?: DependencyEdgeInput[];
};

/**
 * One lane's stacking result, computed once for all lanes together
 * (P5.1) rather than per-`LaneGridRow` (P3.2–P3.8's original shape) —
 * hoisted up so the parent can also compute each lane's cumulative Y
 * offset, which arrow routing needs and no earlier package did: CSS
 * Grid places lanes without any component ever knowing their absolute
 * position (P3.6's `OverlayLines` gets away with spanning every lane
 * via `grid-row: 1 / -1` precisely because a *uniform* line doesn't
 * need to). An arrow between two specific points does need that
 * position, so this is the one place `timeline/`'s "let CSS Grid handle
 * layout, don't compute it in JS" precedent has to bend — see the
 * module-level comment above `HorizontalTimeline` for the rest of the
 * reasoning.
 */
type LaneStacking = {
  laneId: string;
  goalBands: DisplayTimelineItem[];
  stackableItems: DisplayTimelineItem[];
  subRows: Map<string, number>;
  maxDepth: number;
};

function computeLaneStackings(
  lanes: Lane<DisplayTimelineItem>[],
  scale: { toPixel(date: Date): number },
): LaneStacking[] {
  return lanes.map((lane) => {
    const goalBands = lane.items.filter((item) => item.item_type === "goal");
    const stackableItems = lane.items.filter(
      (item) => item.item_type !== "goal",
    );
    const { subRows, maxDepth } = assignSubRows(
      stackableItems.map(toStackableItem),
      scale,
    );
    return {
      laneId: lane.laneId,
      goalBands,
      stackableItems,
      subRows,
      maxDepth,
    };
  });
}

function laneBodyHeightPx(maxDepth: number, collapsed: boolean): number {
  if (collapsed) return LANE_HEADER_MIN_HEIGHT_PX;
  const rowCount = Math.max(maxDepth, 1);
  return Math.max(
    rowCount * BAR_HEIGHT_PX +
      (rowCount - 1) * ROW_GAP_PX +
      LANE_PADDING_Y_PX * 2,
    LANE_HEADER_MIN_HEIGHT_PX,
  );
}

/** Shared by rendering and by P5.1's rect-building, so an arrow's endpoint is always pixel-identical to the bar it's pointing at. */
function taskBarSpan(
  start: Date,
  end: Date,
  scale: HorizontalTimelineScale,
): { left: number; width: number } {
  const left = scale.toPixel(start);
  const width = Math.max(widthForItem(start, end, scale), MIN_BAR_WIDTH_PX);
  return { left, width };
}

/**
 * The desktop (≥768px) timeline layout (P3.4/P3.6/P5.1): a fixed left
 * gutter of lane labels, a horizontally scrolling item region, and a
 * sticky date axis on top — all inside a *single* `overflow-auto`
 * container, with `position: sticky` doing the pinning independently
 * per axis (`top` for the axis row, `left` for the gutter column, both
 * for the corner cell). That single-container-plus-sticky-children
 * structure is deliberate, not incidental: it's what R1's warning is
 * actually about — nothing between here and the scrolling ancestor may
 * carry `overflow-hidden`/`overflow-clip`, because that's the exact bug
 * that made the P0.8 spike's band labels vanish on scroll. Rounded
 * corners (where used) come from `rounded-*` without `overflow-hidden`
 * — a corner that isn't clipped just doesn't clip its content either,
 * which is what's wanted here anyway.
 *
 * Bars anchor at `starts_on` and extend by duration (R3) — no centring
 * anywhere in this file. Milestones render as diamonds centred on their
 * date, sharing the reserved sub-row `assignSubRows` already gives them
 * (P3.2) — bars and milestones go through *one* `assignSubRows` call per
 * lane so that reservation is honoured automatically. Goals render as a
 * full lane-height tinted band, `z-0`, behind bars/milestones (`z-10`+):
 * goals never appear in `assignSubRows`'s output (P3.2 excludes them by
 * design), so they're pulled out and positioned separately, by their own
 * `starts_on`/`ends_on`, not a sub-row.
 *
 * P3.6 adds two more layers, both spanning every lane via CSS Grid's
 * `grid-row: 1 / -1` rather than needing to know the total content
 * height in JS: the today marker and financial horizon overlay lines
 * (`OverlayLines`), and sticky/truncated bar+band labels (`ItemLabel`).
 * Only bars and goal bands get visible labels — milestones stay
 * tooltip-only (native `title`), matching `goal-timeline.tsx`'s existing
 * "no inline text on tiny shapes" precedent; the brief's own examples
 * (a task, a multi-year goal) never mention milestones either.
 *
 * P3.7: every bar/diamond/band is a `<button>` with `onMouseEnter`/
 * `onFocus` -> `onHoverItem` (drives the ring highlight here and
 * `TimelineView`'s hover card — hover and keyboard focus are treated as
 * the same signal, so the card is reachable without a mouse) and
 * `onClick` -> `onNavigate(goal_id)`. No drag, no resize, no inline
 * editing anywhere in this file by design — editing happens on the goal
 * detail page this navigates to.
 *
 * P5.1 adds critical-path highlighting and dependency arrows, both
 * behind the "Show critical path" toggle: a critical task's bar gets a
 * heavier outline (`criticalPathOutlineClass`) rather than a new fill
 * colour, so it never collides with P4.2's RAG palette; a third layer,
 * `CriticalPathArrows`, spans every lane the same `grid-row: 1 / -1`
 * way `OverlayLines` does, drawing right-angle routes (`critical-path.ts`'s
 * `routeOrthogonal`) between whichever critical tasks currently have a
 * rendered rect. Unlike `OverlayLines`, this needed each lane's absolute
 * Y offset to place those routes — `computeLaneStackings` was hoisted
 * out of `LaneGridRow` (previously per-lane, P3.2–P3.8) specifically so
 * the parent could compute that cumulative offset once, across every
 * lane, before rendering any of them.
 */
export function HorizontalTimeline({
  lanes,
  scale,
  rangePx,
  today,
  financialHorizon,
  collapsedLaneIds,
  onToggleLane,
  hoveredItemId,
  onHoverItem,
  onNavigate,
  goalRag,
  showCriticalPath = false,
  showCriticalPathArrows = false,
  dependencyEdges = [],
}: HorizontalTimelineProps) {
  // P3.8's memoisation fix, unchanged in spirit — keyed on `pxPerDay`
  // (zoom-derived), not the whole `scale` object, since `assignSubRows`'s
  // row assignments are anchor-invariant at a fixed zoom. Now computed
  // once for every lane in a single pass (P5.1) rather than once per
  // `LaneGridRow` — see the `LaneStacking` doc above for why.
  const laneStackings = useMemo(
    () => computeLaneStackings(lanes, scale),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lanes, scale.pxPerDay],
  );

  // Cumulative per-lane Y offset, relative to the same origin
  // `OverlayLines`' own `top-0` already uses (the top of the axis row) —
  // cheap O(lanes) arithmetic, not memoised, same as the `.map` below
  // that renders the lanes already isn't. Only computed because P5.1's
  // arrows need it; nothing else in this file does (see the module doc).
  const laneOffsetsY: number[] = [];
  let cumulativeY = AXIS_HEIGHT_PX;
  for (const ls of laneStackings) {
    laneOffsetsY.push(cumulativeY);
    cumulativeY += laneBodyHeightPx(
      ls.maxDepth,
      collapsedLaneIds.has(ls.laneId),
    );
  }
  const totalContentHeightPx = cumulativeY;

  const arrowsActive = showCriticalPath && showCriticalPathArrows;

  // Every currently-critical, currently-rendered task's rect, keyed by
  // item_id (== task_id) — skipped entirely (empty map) unless arrows
  // are actually going to be drawn, since nothing else in this file
  // reads it. A task inside a collapsed lane is excluded (its body isn't
  // rendered, so it has no rect to point an arrow at) — the same
  // "nothing to draw between" reasoning `critical-path.ts`'s
  // `selectCriticalPathEdges` doc gives.
  const criticalTaskRects = useMemo(() => {
    const rects = new Map<string, AnchorRect>();
    if (!arrowsActive) return rects;
    laneStackings.forEach((ls, i) => {
      if (collapsedLaneIds.has(ls.laneId)) return;
      const offsetY = laneOffsetsY[i]!;
      for (const item of ls.stackableItems) {
        if (item.item_type !== "task" || !item.is_critical) continue;
        const row = ls.subRows.get(item.item_id) ?? 0;
        const start = new Date(item.starts_on);
        const end = new Date(item.ends_on);
        const { left, width } = taskBarSpan(start, end, scale);
        const top = LANE_PADDING_Y_PX + row * (BAR_HEIGHT_PX + ROW_GAP_PX);
        rects.set(item.item_id, {
          primaryStart: left,
          primaryEnd: left + width,
          cross: offsetY + top + BAR_HEIGHT_PX / 2,
        });
      }
    });
    return rects;
    // laneOffsetsY is derived fresh from laneStackings/collapsedLaneIds
    // every render, not an independent input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneStackings, collapsedLaneIds, arrowsActive, scale.pxPerDay]);

  const criticalPathEdges = useMemo(
    () =>
      arrowsActive
        ? selectCriticalPathEdges(
            dependencyEdges,
            new Set(criticalTaskRects.keys()),
          )
        : [],
    [arrowsActive, dependencyEdges, criticalTaskRects],
  );

  return (
    <div
      className="overflow-auto"
      style={{ maxHeight: MAX_CONTAINER_HEIGHT_PX }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${GUTTER_WIDTH_PX}px ${rangePx}px`,
          width: GUTTER_WIDTH_PX + rangePx,
        }}
      >
        <div
          className="bg-surface border-subtle sticky top-0 left-0 z-30 border-r border-b"
          style={{ height: AXIS_HEIGHT_PX }}
        />
        <AxisRow scale={scale} rangePx={rangePx} />

        {lanes.map((lane, i) => {
          const ls = laneStackings[i]!;
          return (
            <LaneGridRow
              key={lane.laneId}
              lane={lane}
              goalBands={ls.goalBands}
              stackableItems={ls.stackableItems}
              subRows={ls.subRows}
              maxDepth={ls.maxDepth}
              scale={scale}
              rangePx={rangePx}
              today={today}
              collapsed={collapsedLaneIds.has(lane.laneId)}
              onToggle={() => onToggleLane(lane.laneId)}
              hoveredItemId={hoveredItemId}
              onHoverItem={onHoverItem}
              onNavigate={onNavigate}
              goalRag={goalRag}
              showCriticalPath={showCriticalPath}
              financialHorizon={financialHorizon}
            />
          );
        })}

        <OverlayLines
          today={today}
          financialHorizon={financialHorizon}
          scale={scale}
          rangePx={rangePx}
        />

        {arrowsActive && criticalPathEdges.length > 0 && (
          <CriticalPathArrows
            edges={criticalPathEdges}
            rects={criticalTaskRects}
            rangePx={rangePx}
            totalHeightPx={totalContentHeightPx}
          />
        )}
      </div>
    </div>
  );
}

function AxisRow({
  scale,
  rangePx,
}: {
  scale: HorizontalTimelineScale;
  rangePx: number;
}) {
  const tickDates = scale.ticks();
  return (
    <div
      className="bg-surface border-subtle sticky top-0 z-20 border-b"
      style={{ height: AXIS_HEIGHT_PX, width: rangePx }}
    >
      <div className="relative h-full">
        {tickDates.map((tick, i) => (
          <div
            key={tick.getTime()}
            className="absolute top-0 flex h-full flex-col items-start"
            style={{ left: scale.toPixel(tick) }}
          >
            <span className="border-subtle h-2 border-l" />
            <span className="text-muted-foreground pl-1 text-[10px] whitespace-nowrap">
              {formatTick(tick, i === 0 ? null : (tickDates[i - 1] ?? null))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The today marker and financial horizon line, each spanning every
 * lane's full height via `grid-row: 1 / -1` — one grid cell overlapping
 * the whole items column rather than something rendered per-lane, so
 * this never has to compute total content height in JS. `pointer-events:
 * none` on the wrapper so it never intercepts clicks meant for the bars/
 * milestones beneath it.
 */
function OverlayLines({
  today,
  financialHorizon,
  scale,
  rangePx,
}: {
  today: string;
  financialHorizon: string | null;
  scale: HorizontalTimelineScale;
  rangePx: number;
}) {
  const todayLine = computeOverlayLine(
    new Date(`${today}T00:00:00.000Z`),
    scale,
    rangePx,
  );
  const horizonLine = financialHorizon
    ? computeOverlayLine(
        new Date(`${financialHorizon}T00:00:00.000Z`),
        scale,
        rangePx,
      )
    : null;

  return (
    <div
      className="pointer-events-none relative"
      style={{ gridColumn: 2, gridRow: "1 / -1" }}
    >
      {todayLine.visible && (
        <div
          className="bg-primary-soft absolute top-0 z-15 h-full w-px"
          style={{ left: todayLine.px }}
        >
          <span
            className="bg-primary-soft text-background sticky block w-max rounded-b px-1 text-[9px] font-medium"
            style={{ top: AXIS_HEIGHT_PX }}
          >
            Today
          </span>
        </div>
      )}

      {horizonLine?.visible && (
        <div
          className="border-rag-amber absolute top-0 z-15 h-full border-l-2 border-dashed"
          style={{ left: horizonLine.px }}
        >
          <span
            className="bg-rag-amber text-background sticky block w-max rounded-b px-1 text-[9px] font-medium"
            style={{ top: AXIS_HEIGHT_PX }}
          >
            Financial horizon
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * P5.1: dependency-arrow layer, spanning every lane the same
 * `grid-row: 1 / -1` way `OverlayLines` does — sized to the exact
 * `rangePx x totalHeightPx` the caller already computed (see
 * `HorizontalTimeline`'s `laneOffsetsY`/`totalContentHeightPx`), rather
 * than left to stretch, so there's no dependence on how the grid cell
 * and the SVG's own intrinsic sizing happen to interact. `pointer-events:
 * none` for the same reason `OverlayLines` has it — never intercepts a
 * bar's click/hover. Each edge becomes one `<polyline>` via
 * `routeOrthogonal` + `toSvgPoints`, mapping the abstract (primary,
 * cross) route onto real (x, y) with primary -> x, cross -> y — this
 * orientation's own choice, per `critical-path.ts`'s module doc.
 */
function CriticalPathArrows({
  edges,
  rects,
  rangePx,
  totalHeightPx,
}: {
  edges: CriticalPathEdge[];
  rects: Map<string, AnchorRect>;
  rangePx: number;
  totalHeightPx: number;
}) {
  return (
    <svg
      aria-hidden
      className="text-foreground pointer-events-none z-16 block"
      style={{ gridColumn: 2, gridRow: "1 / -1" }}
      width={rangePx}
      height={totalHeightPx}
    >
      <defs>
        <marker
          id={CRITICAL_PATH_ARROWHEAD_ID}
          markerWidth={8}
          markerHeight={8}
          refX={6}
          refY={3}
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const from = rects.get(edge.predecessorTaskId);
        const to = rects.get(edge.successorTaskId);
        if (!from || !to) return null;
        const points = routeOrthogonal(from, to);
        return (
          <polyline
            key={edge.edgeId}
            points={toSvgPoints(points, (p) => ({ x: p.primary, y: p.cross }))}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            markerEnd={`url(#${CRITICAL_PATH_ARROWHEAD_ID})`}
          />
        );
      })}
    </svg>
  );
}

function LaneGridRow({
  lane,
  goalBands,
  stackableItems,
  subRows,
  maxDepth,
  scale,
  rangePx,
  today,
  collapsed,
  onToggle,
  hoveredItemId,
  onHoverItem,
  onNavigate,
  goalRag,
  showCriticalPath,
  financialHorizon,
}: {
  lane: Lane<DisplayTimelineItem>;
  goalBands: DisplayTimelineItem[];
  stackableItems: DisplayTimelineItem[];
  subRows: Map<string, number>;
  maxDepth: number;
  scale: HorizontalTimelineScale;
  rangePx: number;
  today: string;
  collapsed: boolean;
  onToggle: () => void;
  hoveredItemId: string | null;
  onHoverItem: (itemId: string | null) => void;
  onNavigate: (goalId: string) => void;
  goalRag?: Map<string, GoalRag>;
  showCriticalPath: boolean;
  financialHorizon: string | null;
}) {
  const bodyHeight = laneBodyHeightPx(maxDepth, collapsed);

  return (
    <Fragment>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="bg-surface border-subtle hover:bg-muted sticky left-0 z-10 flex items-center justify-between gap-2 border-r border-b px-3 text-left font-sans text-sm transition-colors"
        style={{ height: bodyHeight }}
      >
        <span className="flex min-w-0 items-center gap-2">
          {lane.colour && (
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: lane.colour }}
            />
          )}
          <span className="truncate">{lane.name}</span>
        </span>
        <Badge variant="secondary">{lane.items.length}</Badge>
      </button>

      <div
        className="border-subtle relative border-b"
        // content-visibility: auto (P3.8): lets the browser skip layout/
        // paint for a lane body scrolled off the page, without a
        // windowing rewrite (the brief's own suggested cheap lever) —
        // real here in a way it wouldn't be inside vertical-timeline.tsx's
        // single expanded lane, whose own tall scroll area rarely if ever
        // fully leaves *its own* scroll viewport while actively being
        // scrolled through (considered and deliberately not applied
        // there for that reason).
        //
        // `containIntrinsicSize` avoids layout shift when a lane's
        // content is skipped — safe here specifically because
        // `bodyHeight`/`rangePx` are already fixed by this component's
        // own math, not derived from the children being skipped.
        //
        // Checked against R1 before adding: `content-visibility: auto`
        // implies `contain: paint`, which clips descendants to this
        // div's own box — the same *mechanism* `overflow-hidden` uses,
        // which is exactly what broke the spike's sticky labels. The
        // difference here: `ItemLabel`'s sticky span only ever needs to
        // render somewhere within `[0, rangePx]` — this div's own full
        // width — never outside it, since that's the entire scrollable
        // domain, not a viewport-sized window into it. There's nothing
        // for the clip to cut off. (Not verified in a real browser —
        // see PERF-NOTES.md.)
        style={{
          height: bodyHeight,
          width: rangePx,
          contentVisibility: "auto",
          containIntrinsicSize: `${rangePx}px ${bodyHeight}px`,
        }}
      >
        {!collapsed && (
          <>
            {goalBands.map((goal) => {
              const start = new Date(goal.starts_on);
              const end = new Date(goal.ends_on);
              const left = scale.toPixel(start);
              const width = Math.max(
                widthForItem(start, end, scale),
                MIN_BAR_WIDTH_PX,
              );
              const hovered = hoveredItemId === goal.item_id;
              return (
                <button
                  key={goal.item_id}
                  type="button"
                  title={goal.title}
                  onMouseEnter={() => onHoverItem(goal.item_id)}
                  onMouseLeave={() => onHoverItem(null)}
                  onFocus={() => onHoverItem(goal.item_id)}
                  onBlur={() => onHoverItem(null)}
                  onClick={() => onNavigate(goal.goal_id)}
                  className={cn(
                    // No overflow-hidden (R1) — ItemLabel below is
                    // sometimes `position: sticky`.
                    "absolute top-0 z-0 h-full text-left",
                    GOAL_BAND_OPACITY,
                    ragFillClass(goalRag?.get(goal.goal_id)),
                    hovered && "ring-foreground ring-2 ring-offset-1",
                  )}
                  style={{ left, width }}
                >
                  <ItemLabel title={goal.title} itemWidthPx={width} />
                </button>
              );
            })}

            {stackableItems.map((item) => {
              const start = new Date(item.starts_on);
              const end = new Date(item.ends_on);
              const row = subRows.get(item.item_id) ?? 0;
              const status = classifyItemStatus(item, today);
              const hovered = hoveredItemId === item.item_id;
              const top =
                LANE_PADDING_Y_PX + row * (BAR_HEIGHT_PX + ROW_GAP_PX);

              if (item.item_type === "milestone") {
                // Centred on its date — the one deliberate exception to
                // "anchor, don't centre" (R3): milestones are
                // zero-duration points, not intervals.
                const cx = scale.toPixel(start);
                const cy = top + BAR_HEIGHT_PX / 2;
                return (
                  <button
                    key={item.item_id}
                    type="button"
                    title={item.title}
                    onMouseEnter={() => onHoverItem(item.item_id)}
                    onMouseLeave={() => onHoverItem(null)}
                    onFocus={() => onHoverItem(item.item_id)}
                    onBlur={() => onHoverItem(null)}
                    onClick={() => onNavigate(item.goal_id)}
                    className={cn(
                      "absolute z-10 rotate-45",
                      statusFillClass(status),
                      hovered && "ring-foreground ring-2 ring-offset-1",
                    )}
                    style={{
                      left: cx - DIAMOND_SIZE_PX / 2,
                      top: cy - DIAMOND_SIZE_PX / 2,
                      width: DIAMOND_SIZE_PX,
                      height: DIAMOND_SIZE_PX,
                    }}
                  />
                );
              }

              if (item.item_type === "trip_stop") {
                // P6.5: "distinct visual treatment from tasks — this is
                // travel, not work" (brief). A capsule/circle shape
                // (rounded-full), never task's rectangle or milestone's
                // diamond, coloured by the stop's own booking state
                // rather than the date-derived status every other bar
                // uses.
                const beyondHorizon = isBeyondFinancialHorizon(
                  item.starts_on,
                  financialHorizon,
                );

                if (item.is_point) {
                  // Zero-night stop — a point, like a milestone, but a
                  // circle so it never reads as one.
                  const cx = scale.toPixel(start);
                  const cy = top + BAR_HEIGHT_PX / 2;
                  return (
                    <button
                      key={item.item_id}
                      type="button"
                      title={item.title}
                      onMouseEnter={() => onHoverItem(item.item_id)}
                      onMouseLeave={() => onHoverItem(null)}
                      onFocus={() => onHoverItem(item.item_id)}
                      onBlur={() => onHoverItem(null)}
                      onClick={() => onNavigate(item.goal_id)}
                      className={cn(
                        "absolute z-10 rounded-full",
                        bookingStateFillClass(item.status),
                        beyondHorizon && BEYOND_HORIZON_OUTLINE,
                        hovered && "ring-foreground ring-2 ring-offset-1",
                      )}
                      style={{
                        left: cx - DIAMOND_SIZE_PX / 2,
                        top: cy - DIAMOND_SIZE_PX / 2,
                        width: DIAMOND_SIZE_PX,
                        height: DIAMOND_SIZE_PX,
                      }}
                    />
                  );
                }

                // Bar spanning arrival to departure — anchored at
                // starts_on same as a task bar (R3), just pill-shaped.
                const { left, width } = taskBarSpan(start, end, scale);
                return (
                  <button
                    key={item.item_id}
                    type="button"
                    title={item.title}
                    onMouseEnter={() => onHoverItem(item.item_id)}
                    onMouseLeave={() => onHoverItem(null)}
                    onFocus={() => onHoverItem(item.item_id)}
                    onBlur={() => onHoverItem(null)}
                    onClick={() => onNavigate(item.goal_id)}
                    className={cn(
                      "absolute z-10 rounded-full",
                      bookingStateFillClass(item.status),
                      beyondHorizon && BEYOND_HORIZON_OUTLINE,
                      hovered && "ring-foreground ring-2 ring-offset-1",
                    )}
                    style={{ left, width, top, height: BAR_HEIGHT_PX }}
                  >
                    <ItemLabel title={item.title} itemWidthPx={width} />
                  </button>
                );
              }

              // Task bar — anchored at starts_on, extends by duration.
              // Not centred (R3): this exact bug is what the spike hit.
              const { left, width } = taskBarSpan(start, end, scale);
              return (
                <button
                  key={item.item_id}
                  type="button"
                  title={item.title}
                  onMouseEnter={() => onHoverItem(item.item_id)}
                  onMouseLeave={() => onHoverItem(null)}
                  onFocus={() => onHoverItem(item.item_id)}
                  onBlur={() => onHoverItem(null)}
                  onClick={() => onNavigate(item.goal_id)}
                  className={cn(
                    // No overflow-hidden here (R1) — this button contains
                    // ItemLabel, which is sometimes `position: sticky`;
                    // clipping it would defeat the whole point.
                    "absolute z-10 rounded",
                    statusFillClass(status),
                    criticalPathOutlineClass(item, showCriticalPath),
                    hovered && "ring-foreground ring-2 ring-offset-1",
                  )}
                  style={{ left, width, top, height: BAR_HEIGHT_PX }}
                >
                  <ItemLabel title={item.title} itemWidthPx={width} />
                </button>
              );
            })}
          </>
        )}
      </div>
    </Fragment>
  );
}

/**
 * R1's generalisation, applied: `needsStickyLabel` (against
 * `ASSUMED_VIEWPORT_PX` — see that constant's doc) decides whether this
 * label gets the sticky treatment's backdrop chip, so it stays legible
 * once it detaches from its item's edge mid-scroll. The sticky
 * *positioning* itself (`sticky left-0 right-0`) is applied
 * unconditionally regardless of that decision — inert until the item is
 * actually wider than the real viewport, so correctness never hinges on
 * `ASSUMED_VIEWPORT_PX` being exact. Truncation is likewise unconditional
 * CSS (`truncate`, bounded by the item's own rendered width via the
 * parent's fixed `width`) rather than a second gated branch — narrower-
 * than-its-label naturally falls out of that without needing to check
 * `needsTruncatedLabel` here too. Multi-year goals hit the exact same
 * path as any other wide item — no separate "is this a goal" branch.
 */
function ItemLabel({
  title,
  itemWidthPx,
}: {
  title: string;
  itemWidthPx: number;
}) {
  const sticky = needsStickyLabel(itemWidthPx, ASSUMED_VIEWPORT_PX);
  return (
    <span
      className={cn(
        "block truncate px-1 text-[10px] leading-[inherit]",
        sticky &&
          "sticky left-0 z-20 float-left max-w-full rounded bg-black/25 backdrop-blur-[1px]",
      )}
    >
      {title}
    </span>
  );
}

// P4.2: goal bands only — replaces this file's own P3.4 date-based
// classification for goals specifically (statusFillClass below still
// colours milestones/tasks; RAG is a goal-level concept, not theirs). No
// entry (map not supplied, or no matching row) renders neutral rather
// than falling back to the old classification — the whole point of
// "replacing" is that a goal band's colour stops being date-derived.
// Grace-period goals (P4.2: "don't render a colour... render 'new'")
// get the same neutral treatment as "no data" here, on a compact band
// with no room for a text badge — the goal detail page is where "new"
// actually reads as a word.
function ragFillClass(rag: GoalRag | undefined): string {
  if (!rag || isGracePeriod(rag)) {
    return "bg-muted";
  }
  switch (rag.effective_status) {
    case "green":
      return "bg-rag-green";
    case "amber":
      return "bg-rag-amber";
    case "red":
      return "bg-rag-red";
    case "grey":
    default:
      return "bg-rag-grey";
  }
}

// Completed -> star, overdue -> rag-red, in-progress -> primary,
// not-started -> a border-subtle outline with no fill (a hollow bar
// reads as "hasn't started" more clearly than a fourth solid colour
// would). Colocated with the component that uses it, matching
// goal-timeline.tsx's taskFill/milestoneFill precedent, rather than
// living in lib/timeline/ — Tailwind class selection is a rendering
// concern, not shared layout math. Still used for milestones/tasks —
// only goal bands switched to ragFillClass above.
function statusFillClass(status: ItemVisualStatus): string {
  switch (status) {
    case "completed":
      return "bg-star";
    case "in_progress":
      return "bg-primary";
    case "overdue":
      return "bg-rag-red";
    case "not_started":
      return "border border-subtle bg-transparent";
  }
}

// P6.5: "distinct visual treatment from tasks — this is travel, not
// work. Booking state drives colour: idea faint, researching medium,
// booked solid, done in the star token" (brief, verbatim). Purple
// (`--primary`, the same hue P6.2's map markers already draw a stop in)
// at increasing opacity for idea -> researching -> booked, so a stop
// never reads as an in-progress task (`statusFillClass`'s solid
// `bg-primary`) until it's actually booked solid; `done` reuses the
// exact "completed -> star" mapping every other item type already has,
// rather than inventing a second meaning for gold. `cancelled` isn't
// named in the brief — treated the same hollow way `statusFillClass`
// treats `not_started`, since "nothing is happening here" applies
// either way. Colocated with the component that uses it, same reasoning
// as `statusFillClass` above.
function bookingStateFillClass(status: string | null): string {
  switch (status) {
    case "idea":
      return "bg-primary/25";
    case "researching":
      return "bg-primary/60";
    case "booked":
      return "bg-primary";
    case "done":
      return "bg-star";
    default:
      return "border border-subtle bg-transparent opacity-60";
  }
}

// P6.5: "a trip whose stops sit beyond [the financial horizon] is one
// you can't yet afford... visibly aspirational" (brief). A dashed
// outline, not a new fill colour — same "outline, don't invent a colour"
// move P5.1's critical-path treatment already makes, and for the same
// reason: this is a caveat layered on whatever booking-state colour the
// stop already has, not a replacement for it. Dashed (not solid, which
// is already the critical-path outline's own look) so the two read as
// visually distinct if a stop were ever both — not possible today (only
// tasks go critical), but this keeps the vocabulary open for that.
const BEYOND_HORIZON_OUTLINE =
  "outline outline-2 outline-dashed outline-offset-1 outline-muted-foreground";

// P5.1: a heavier outline, not a new fill colour (brief, verbatim: "not
// a separate colour, or it collides with the RAG palette from Phase 4
// and the user has to learn two systems"). `outline` (not `ring`, which
// the hover state already uses via box-shadow) so the two can stack
// without fighting over the same CSS property — a hovered critical task
// shows both at once. Only ever true for a task (`is_critical` is null
// on every goal/milestone row per 0022's migration, which
// `toDisplayItem` already coerces to `false`), but the `item_type` guard
// is kept anyway so this reads correctly on its own, not just by
// relying on that upstream coercion.
function criticalPathOutlineClass(
  item: DisplayTimelineItem,
  showCriticalPath: boolean,
): string {
  return showCriticalPath && item.item_type === "task" && item.is_critical
    ? "outline outline-2 outline-offset-1 outline-foreground"
    : "";
}

// Day + month once ticks are closer together than a month apart (day/week
// zoom); month (+ year on change, same rule goal-timeline.tsx already
// uses) otherwise. Derived from the actual tick spacing rather than a
// `zoom` prop, so this stays correct without this component needing to
// know which of the five zooms produced `scale`.
function formatTick(date: Date, previous: Date | null): string {
  const showYear =
    previous === null || date.getUTCFullYear() !== previous.getUTCFullYear();
  const gapDays = previous
    ? Math.abs(date.getTime() - previous.getTime()) / DAY_MS
    : Infinity;
  const showDay = gapDays < 32;
  return new Intl.DateTimeFormat("en-US", {
    day: showDay ? "numeric" : undefined,
    month: "short",
    year: showYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(date);
}
