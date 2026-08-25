"use client";

import { Fragment, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import {
  classifyItemStatus,
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

export type HorizontalTimelineScale = {
  toPixel(date: Date): number;
  ticks(count?: number): Date[];
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
};

/**
 * The desktop (≥768px) timeline layout (P3.4/P3.6): a fixed left gutter
 * of lane labels, a horizontally scrolling item region, and a sticky
 * date axis on top — all inside a *single* `overflow-auto` container,
 * with `position: sticky` doing the pinning independently per axis
 * (`top` for the axis row, `left` for the gutter column, both for the
 * corner cell). That single-container-plus-sticky-children structure is
 * deliberate, not incidental: it's what R1's warning is actually about
 * — nothing between here and the scrolling ancestor may carry
 * `overflow-hidden`/`overflow-clip`, because that's the exact bug that
 * made the P0.8 spike's band labels vanish on scroll. Rounded corners
 * (where used) come from `rounded-*` without `overflow-hidden` — a
 * corner that isn't clipped just doesn't clip its content either, which
 * is what's wanted here anyway.
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
}: HorizontalTimelineProps) {
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

        {lanes.map((lane) => (
          <LaneGridRow
            key={lane.laneId}
            lane={lane}
            scale={scale}
            rangePx={rangePx}
            today={today}
            collapsed={collapsedLaneIds.has(lane.laneId)}
            onToggle={() => onToggleLane(lane.laneId)}
            hoveredItemId={hoveredItemId}
            onHoverItem={onHoverItem}
            onNavigate={onNavigate}
          />
        ))}

        <OverlayLines
          today={today}
          financialHorizon={financialHorizon}
          scale={scale}
          rangePx={rangePx}
        />
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

function LaneGridRow({
  lane,
  scale,
  rangePx,
  today,
  collapsed,
  onToggle,
  hoveredItemId,
  onHoverItem,
  onNavigate,
}: {
  lane: Lane<DisplayTimelineItem>;
  scale: { toPixel(date: Date): number };
  rangePx: number;
  today: string;
  collapsed: boolean;
  onToggle: () => void;
  hoveredItemId: string | null;
  onHoverItem: (itemId: string | null) => void;
  onNavigate: (goalId: string) => void;
}) {
  const goalBands = lane.items.filter((item) => item.item_type === "goal");
  const stackableItems = lane.items.filter((item) => item.item_type !== "goal");

  const { subRows, maxDepth } = useMemo(
    () => assignSubRows(stackableItems.map(toStackableItem), scale),
    // stackableItems is re-derived from `lane.items` every render; keying
    // off `lane.items` directly keeps this from recomputing on renders
    // where the lane object itself hasn't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lane.items, scale],
  );

  const rowCount = Math.max(maxDepth, 1);
  const bodyHeight = collapsed
    ? LANE_HEADER_MIN_HEIGHT_PX
    : Math.max(
        rowCount * BAR_HEIGHT_PX +
          (rowCount - 1) * ROW_GAP_PX +
          LANE_PADDING_Y_PX * 2,
        LANE_HEADER_MIN_HEIGHT_PX,
      );

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
        style={{ height: bodyHeight, width: rangePx }}
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
              const status = classifyItemStatus(goal, today);
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
                    statusFillClass(status),
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

              // Task bar — anchored at starts_on, extends by duration.
              // Not centred (R3): this exact bug is what the spike hit.
              const left = scale.toPixel(start);
              const width = Math.max(
                widthForItem(start, end, scale),
                MIN_BAR_WIDTH_PX,
              );
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

// Completed -> star, overdue -> rag-red, in-progress -> primary,
// not-started -> a border-subtle outline with no fill (a hollow bar
// reads as "hasn't started" more clearly than a fourth solid colour
// would). Colocated with the component that uses it, matching
// goal-timeline.tsx's taskFill/milestoneFill precedent, rather than
// living in lib/timeline/ — Tailwind class selection is a rendering
// concern, not shared layout math.
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
