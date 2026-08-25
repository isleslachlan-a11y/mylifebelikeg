"use client";

import { useMemo } from "react";

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

// P3.5's own layout constants — not exported, not imported from (or by)
// horizontal-timeline.tsx. R6 and the P3.5 brief are both explicit that
// horizontal and vertical own separate constants even where a value
// happens to coincide; the spike found the *date* maths transfers
// cleanly across orientations but the layout numbers do not, which is
// exactly why this file exists instead of an `orientation` prop threaded
// through the horizontal component.
const RAIL_WIDTH_PX = 52;
const COLUMN_WIDTH_PX = 80;
const COLUMN_GAP_PX = 4;
const DIAMOND_SIZE_PX = 10;
const MIN_BAR_LENGTH_PX = 8;
const GOAL_BAND_OPACITY = "opacity-15";
const MAX_CONTAINER_HEIGHT_PX = 480;
const DAY_MS = 86_400_000;

export type VerticalTimelineScale = {
  toPixel(date: Date): number;
  ticks(count?: number): Date[];
  /**
   * Zoom-derived, anchor-independent (P3.8) — `VerticalLaneSection`
   * memoises `assignSubRows` on this instead of the whole `scale`
   * object, same reasoning as `horizontal-timeline.tsx`'s identical
   * comment: `scale` gets a new identity on every pan even though
   * `assignSubRows`'s row assignments only ever change with zoom.
   */
  pxPerDay: number;
};

export type VerticalTimelineProps = {
  lanes: Lane<DisplayTimelineItem>[];
  scale: VerticalTimelineScale;
  /** Total pixel length of the visible time domain — a length now, not a width (time runs top to bottom here). */
  rangePx: number;
  /** Timezone-resolved, computed once per request by the caller (R2) — never `new Date()` in this component. */
  today: string;
  /**
   * Bare "YYYY-MM-DD" from `app.financial_horizon()` for the current
   * viewer, or `null` when they have no active funded goals — P3.6
   * renders nothing in that case, not a line at epoch.
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
 * The mobile (<768px) timeline layout (P3.5/P3.6): time runs top to
 * bottom, lanes stack as vertical collapsible sections (one expanded at
 * a time — `TimelineView` already enforces that via `collapsedLaneIds`,
 * same as P3.3), and within the expanded lane a fixed left rail carries
 * the date axis. `assignSubRows`'s sub-row numbers become *horizontal*
 * offsets here instead of vertical ones — an item overlapping another
 * sits to its right, not below it — so lane width, not height, is what
 * depth drives. Milestones land in the reserved sub-row `assignSubRows`
 * already gives them (P3.2), which — read as a column here — is exactly
 * "a reserved left column."
 *
 * Same single-`overflow-auto`-container-plus-sticky-children structure
 * as `horizontal-timeline.tsx` (R1: nothing between the sticky rail and
 * its scrolling ancestor may carry `overflow-hidden`/`overflow-clip`),
 * just with the sticky axis pinned `left` instead of `top` — because
 * here it's the *rail* that must stay put while scrolling through time,
 * not a header while scrolling through lanes.
 *
 * P3.6's overlay layer transposes the same way: the today marker and
 * financial horizon line run *horizontally* here (`top: px`, spanning
 * the item columns) instead of vertically, and only ever render inside
 * whichever one lane is currently expanded — with only one lane's body
 * in the DOM at a time on mobile, "across all lanes" already means
 * "within the expanded one," there's nothing else to span. Item labels
 * stick to `top` (not `left`) for the same reason: as you scroll down
 * through a long item, its label should stay pinned near the top of the
 * visible scroll area, not the side.
 *
 * Deliberately shares only `scale.ts`, `stacking.ts`, and `overlays.ts`
 * with the horizontal layout (`groupIntoLanes`/`classifyItemStatus` too,
 * but those are data-shaping, not layout) — no orientation prop, no
 * shared layout constants, per R6 and the P3.5 brief.
 *
 * P3.7: same `onHoverItem`/`onNavigate` split as `horizontal-timeline.tsx`
 * — hover/focus previews (and drives `TimelineView`'s hover card), click
 * navigates. No drag, no resize, no inline editing here either; editing
 * happens on the goal detail page this navigates to.
 */
export function VerticalTimeline({
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
}: VerticalTimelineProps) {
  return (
    <div className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
      {lanes.map((lane) => (
        <VerticalLaneSection
          key={lane.laneId}
          lane={lane}
          scale={scale}
          rangePx={rangePx}
          today={today}
          financialHorizon={financialHorizon}
          collapsed={collapsedLaneIds.has(lane.laneId)}
          onToggle={() => onToggleLane(lane.laneId)}
          hoveredItemId={hoveredItemId}
          onHoverItem={onHoverItem}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

function VerticalLaneSection({
  lane,
  scale,
  rangePx,
  today,
  financialHorizon,
  collapsed,
  onToggle,
  hoveredItemId,
  onHoverItem,
  onNavigate,
}: {
  lane: Lane<DisplayTimelineItem>;
  scale: VerticalTimelineScale;
  rangePx: number;
  today: string;
  financialHorizon: string | null;
  collapsed: boolean;
  onToggle: () => void;
  hoveredItemId: string | null;
  onHoverItem: (itemId: string | null) => void;
  onNavigate: (goalId: string) => void;
}) {
  const goalBands = lane.items.filter((item) => item.item_type === "goal");
  const stackableItems = lane.items.filter((item) => item.item_type !== "goal");

  // P3.8: keyed on pxPerDay, not the whole `scale` object — see
  // horizontal-timeline.tsx's identical fix and comment for the full
  // reasoning (anchor-invariance of assignSubRows's output at fixed
  // zoom) and PERF-NOTES.md for what this was actually measured to cost
  // before being fixed.
  const { subRows, maxDepth } = useMemo(
    () => assignSubRows(stackableItems.map(toStackableItem), scale),
    // stackableItems is re-derived from lane.items every render, so
    // keying off lane.items directly (rather than the fresh array)
    // avoids recomputing on renders where the lane itself hasn't
    // actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lane.items, scale.pxPerDay],
  );

  const columnCount = Math.max(maxDepth, 1);
  const itemsWidth =
    columnCount * COLUMN_WIDTH_PX + (columnCount - 1) * COLUMN_GAP_PX;

  return (
    <div className="border-subtle bg-surface rounded-xl border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="hover:bg-muted flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-sans text-sm transition-colors"
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

      {!collapsed && (
        <div
          className="border-subtle overflow-auto border-t"
          style={{ maxHeight: MAX_CONTAINER_HEIGHT_PX }}
        >
          <div
            className="relative"
            style={{ height: rangePx, width: RAIL_WIDTH_PX + itemsWidth }}
          >
            {/* Date rail — sticky left, scrolls vertically with the body. */}
            <div
              className="bg-surface border-subtle sticky left-0 z-10 border-r"
              style={{ width: RAIL_WIDTH_PX, height: rangePx }}
            >
              {scale.ticks().map((tick, i, ticks) => (
                <div
                  key={tick.getTime()}
                  className="absolute left-0 flex w-full items-center gap-1"
                  style={{ top: scale.toPixel(tick) }}
                >
                  <span className="border-subtle w-1.5 border-t" />
                  <span className="text-muted-foreground text-[9px] whitespace-nowrap">
                    {formatTick(tick, i === 0 ? null : (ticks[i - 1] ?? null))}
                  </span>
                </div>
              ))}
            </div>

            <div
              className="absolute top-0"
              style={{
                left: RAIL_WIDTH_PX,
                width: itemsWidth,
                height: rangePx,
              }}
            >
              {goalBands.map((goal) => {
                const start = new Date(goal.starts_on);
                const end = new Date(goal.ends_on);
                const top = scale.toPixel(start);
                const height = Math.max(
                  widthForItem(start, end, scale),
                  MIN_BAR_LENGTH_PX,
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
                      "absolute left-0 z-0 w-full text-left",
                      GOAL_BAND_OPACITY,
                      statusFillClass(status),
                      hovered && "ring-foreground ring-2 ring-offset-1",
                    )}
                    style={{ top, height }}
                  >
                    <ItemLabel title={goal.title} itemHeightPx={height} />
                  </button>
                );
              })}

              {stackableItems.map((item) => {
                const start = new Date(item.starts_on);
                const end = new Date(item.ends_on);
                const column = subRows.get(item.item_id) ?? 0;
                const left = column * (COLUMN_WIDTH_PX + COLUMN_GAP_PX);
                const status = classifyItemStatus(item, today);
                const hovered = hoveredItemId === item.item_id;

                if (item.item_type === "milestone") {
                  // Centred on its date — same one exception to
                  // "anchor, don't centre" horizontal-timeline.tsx makes
                  // for milestones (they're points, not intervals).
                  const cy = scale.toPixel(start);
                  const cx = left + COLUMN_WIDTH_PX / 2;
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

                // Bar — anchored at starts_on (top edge), extends
                // downward by duration. Not centred (R3's rule applies
                // just as much on this axis as the horizontal one).
                const top = scale.toPixel(start);
                const height = Math.max(
                  widthForItem(start, end, scale),
                  MIN_BAR_LENGTH_PX,
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
                      // No overflow-hidden (R1) — ItemLabel below is
                      // sometimes `position: sticky`; clipping it here
                      // would defeat the point.
                      "absolute z-10 rounded",
                      statusFillClass(status),
                      hovered && "ring-foreground ring-2 ring-offset-1",
                    )}
                    style={{
                      left,
                      top,
                      width: COLUMN_WIDTH_PX - COLUMN_GAP_PX,
                      height,
                    }}
                  >
                    <ItemLabel title={item.title} itemHeightPx={height} />
                  </button>
                );
              })}

              <OverlayLines
                today={today}
                financialHorizon={financialHorizon}
                scale={scale}
                rangePx={rangePx}
                widthPx={itemsWidth}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The today marker and financial horizon line, spanning the expanded
 * lane's item columns horizontally at `top: px` — the transposed
 * counterpart of `horizontal-timeline.tsx`'s `OverlayLines`. No grid-span
 * trick needed here (unlike horizontal, which spans every lane via
 * `grid-row: 1 / -1`): only one lane's body ever exists in the DOM at
 * once on mobile, so this renders once, inside it.
 */
function OverlayLines({
  today,
  financialHorizon,
  scale,
  rangePx,
  widthPx,
}: {
  today: string;
  financialHorizon: string | null;
  scale: VerticalTimelineScale;
  rangePx: number;
  widthPx: number;
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
      className="pointer-events-none absolute top-0 left-0"
      style={{ width: widthPx, height: rangePx }}
    >
      {todayLine.visible && (
        <div
          className="bg-primary-soft absolute left-0 z-15 h-px"
          style={{ top: todayLine.px, width: widthPx }}
        >
          <span className="bg-primary-soft text-background sticky left-0 block w-max rounded-r px-1 text-[9px] font-medium">
            Today
          </span>
        </div>
      )}

      {horizonLine?.visible && (
        <div
          className="border-rag-amber absolute left-0 z-15 border-t-2 border-dashed"
          style={{ top: horizonLine.px, width: widthPx }}
        >
          <span className="bg-rag-amber text-background sticky left-0 block w-max rounded-r px-1 text-[9px] font-medium">
            Financial horizon
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Transposed counterpart of `horizontal-timeline.tsx`'s `ItemLabel`:
 * `needsStickyLabel` compares against *height* here (against
 * `MAX_CONTAINER_HEIGHT_PX`, a real bound — the scroll body's own fixed
 * `maxHeight`, not a guess — unlike horizontal's approximated viewport
 * width) rather than width, since duration drives an item's length along
 * the vertical axis in this orientation. Sticky positioning pins `top`,
 * not `left`. Truncation is still unconditional CSS bounded by the
 * item's fixed column width (duration never affects that here), so it
 * needs no separate gated decision, same reasoning as the horizontal
 * version.
 */
function ItemLabel({
  title,
  itemHeightPx,
}: {
  title: string;
  itemHeightPx: number;
}) {
  const sticky = needsStickyLabel(itemHeightPx, MAX_CONTAINER_HEIGHT_PX);
  return (
    <span
      className={cn(
        "block truncate px-1 text-[10px] leading-[1.4]",
        sticky &&
          "sticky top-0 z-20 float-left max-w-full rounded bg-black/25 backdrop-blur-[1px]",
      )}
    >
      {title}
    </span>
  );
}

// Same four-way palette as horizontal-timeline.tsx, deliberately
// duplicated rather than imported: colocated with the component that
// renders it (matching goal-timeline.tsx's taskFill/milestoneFill
// precedent) rather than shared, same reasoning as the layout constants
// above — Tailwind class selection here is presentation, not the kind of
// "date maths" R6 says should transfer between orientations.
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

// Compact day-of-week + day-of-month at tight tick spacing (day/week
// zoom — the ones the brief calls out as actually useful on a phone);
// month (+ year on change) otherwise. Same tick-spacing-derived approach
// as horizontal-timeline.tsx's formatTick, independently written (not
// imported) for the same "own its constants/logic" reasoning.
function formatTick(date: Date, previous: Date | null): string {
  const showYear =
    previous === null || date.getUTCFullYear() !== previous.getUTCFullYear();
  const gapDays = previous
    ? Math.abs(date.getTime() - previous.getTime()) / DAY_MS
    : Infinity;
  if (gapDays < 9) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: gapDays < 32 ? "numeric" : undefined,
    year: showYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(date);
}
