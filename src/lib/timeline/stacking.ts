import { widthForItem } from "./scale";

/**
 * Collision stacking for one lane's timeline items (PHASE-3-REQUIREMENTS.MD's
 * R4 — "the real scope" of Phase 3). Pure, no React, no DOM: takes plain
 * `Date`s and a duck-typed scale (same `{ toPixel(date): number }` shape
 * `widthForItem` uses, so this works with either `TimelineScale` or
 * `MultiZoomScale`), and hands back sub-row assignments as numbers. What
 * to do with those numbers — row heights, colours, actual rendering — is
 * entirely the caller's problem, same separation `scale.ts`/`stack.ts`
 * already keep.
 *
 * Kin to `stack.ts`'s `stackIntervals` (same "minimum meeting rooms"
 * greedy algorithm), but not built on it: this module's placement order
 * is the calendar-date sort R4 requires (`starts_on`, then `sort_order`,
 * then `item_id`), which is a different axis from `stack.ts`'s
 * sort-by-pixel-start — piggybacking on that would mean relying on
 * `Array.prototype.sort`'s stability to smuggle the tiebreak through a
 * second, unrelated sort. Cheaper and clearer to write the ~15-line loop
 * fresh than to lean on that.
 */

export type StackableItemType = "goal" | "milestone" | "task";

export type StackableItem = {
  item_id: string;
  item_type: StackableItemType;
  /**
   * Already-parsed `Date`s, not this app's bare-date strings — same
   * boundary `scale.ts` draws. Convert `v_timeline_items`'s `starts_on`/
   * `ends_on` at the call site (`new Date(dateString)`, safe per
   * `scale.ts`'s module doc) before calling this.
   */
  starts_on: Date;
  ends_on: Date;
  sort_order: number;
  /** Only used to *estimate* label pixel width (see `estimateLabelWidth`) — never rendered by this module. */
  title: string;
};

export type AssignSubRowsOptions = {
  /** Minimum pixel gap between two items' visual footprints before they stop counting as colliding. R4's default. */
  minGapPx?: number;
  /**
   * Estimates a label's rendered pixel width from its text. Defaults to a
   * flat per-character estimate — deliberately crude, because real text
   * measurement (canvas `measureText`, or reading a rendered DOM node)
   * needs a DOM this module isn't allowed to touch. A component that
   * *does* have one can pass a real measurer here; the default exists so
   * the pure function still has sane, deterministic behaviour without it.
   */
  estimateLabelWidth?: (title: string) => number;
};

export type AssignSubRowsResult = {
  /** `item_id` -> assigned sub-row. Goals never appear here (see module doc). */
  subRows: Map<string, number>;
  /** 1 + the highest sub-row index used across the whole lane (milestone row included, if any). 0 for an empty `items`. */
  maxDepth: number;
};

const DEFAULT_MIN_GAP_PX = 4;
const AVG_CHAR_PX = 6.5; // rough glyph-advance estimate for this app's default UI text size — a stacking heuristic, not a rendering guarantee.
const LABEL_PADDING_PX = 8;

/**
 * The same crude, DOM-free per-character estimate `assignSubRows` uses
 * by default for its own collision footprint — exported so P3.6's
 * sticky/truncated-label decision (`overlays.ts`) uses the identical
 * heuristic rather than a second, independently-drifting guess at label
 * width. See `AssignSubRowsOptions.estimateLabelWidth`'s doc for why
 * this can't be a real text measurement.
 */
export function defaultEstimateLabelWidth(title: string): number {
  return title.length * AVG_CHAR_PX + LABEL_PADDING_PX;
}

/**
 * Deterministic placement order (R4): `starts_on` ascending, then
 * `sort_order`, then `item_id` as a final tiebreak so two items with
 * identical start and sort_order still resolve to one stable order
 * rather than whatever order they happened to arrive in.
 */
function comparePlacementOrder(a: StackableItem, b: StackableItem): number {
  const startDiff = a.starts_on.getTime() - b.starts_on.getTime();
  if (startDiff !== 0) return startDiff;
  const sortOrderDiff = a.sort_order - b.sort_order;
  if (sortOrderDiff !== 0) return sortOrderDiff;
  if (a.item_id < b.item_id) return -1;
  if (a.item_id > b.item_id) return 1;
  return 0;
}

/**
 * Greedy interval partitioning: for each item (in placement order), reuse
 * the lowest-numbered row whose last-placed item's effective end is
 * already at or before this item's pixel start; otherwise open a new
 * row. `rowEnds[i]` is the effective pixel end of the last item placed in
 * row `i` so far.
 *
 * "Effective end" is the item's own end pixel plus `minGapPx` plus its
 * estimated label width — R4's point that an item's visual footprint is
 * its bar *plus* its label, and labels collide long before bars do. Two
 * items a day apart at year zoom have practically touching bars but can
 * easily have overlapping labels; effective end is what makes that show
 * up as a collision here instead of only at render time.
 */
function stackByRow(
  sortedItems: StackableItem[],
  scale: { toPixel(date: Date): number },
  minGapPx: number,
  estimateLabelWidth: (title: string) => number,
): { subRows: Map<string, number>; rowCount: number } {
  const rowEnds: number[] = [];
  const subRows = new Map<string, number>();

  for (const item of sortedItems) {
    const startPx = scale.toPixel(item.starts_on);
    const widthPx = Math.max(
      widthForItem(item.starts_on, item.ends_on, scale),
      0,
    );
    const labelPx = Math.max(estimateLabelWidth(item.title), 0);
    const effectiveEndPx = startPx + widthPx + minGapPx + labelPx;

    let row = rowEnds.findIndex((rowEnd) => startPx >= rowEnd);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(effectiveEndPx);
    } else {
      rowEnds[row] = effectiveEndPx;
    }
    subRows.set(item.item_id, row);
  }

  return { subRows, rowCount: rowEnds.length };
}

/**
 * Assigns each milestone/task in `items` a sub-row within its lane.
 *
 * - Goals are filtered out entirely — a goal renders as a background band
 *   across its whole lane (P3.4), not as a competing bar, so it never
 *   gets a sub-row and never appears in the returned map.
 * - Milestones are assigned first, all to sub-row 0 — "a reserved
 *   sub-row" (singular, R4's own wording): they're placed, not stacked
 *   among themselves. A dense cluster of same-week milestones sharing
 *   row 0 is a known, accepted limitation of this package, not a bug —
 *   R1's truncation/tooltip handling is the mitigation, at render time,
 *   not this module's job. The row only exists at all if `items`
 *   actually contains at least one milestone; a lane with none stacks
 *   its bars starting at row 0 directly.
 * - Tasks ("bars") are stacked beneath the milestone row (if any) via
 *   greedy interval partitioning, in the deterministic order
 *   `comparePlacementOrder` defines.
 */
export function assignSubRows(
  items: StackableItem[],
  scale: { toPixel(date: Date): number },
  opts: AssignSubRowsOptions = {},
): AssignSubRowsResult {
  const minGapPx = opts.minGapPx ?? DEFAULT_MIN_GAP_PX;
  const estimateLabelWidth =
    opts.estimateLabelWidth ?? defaultEstimateLabelWidth;

  const milestones = items.filter((item) => item.item_type === "milestone");
  const bars = items.filter((item) => item.item_type === "task");

  const subRows = new Map<string, number>();

  const milestoneRowCount = milestones.length > 0 ? 1 : 0;
  for (const milestone of [...milestones].sort(comparePlacementOrder)) {
    subRows.set(milestone.item_id, 0);
  }

  const sortedBars = [...bars].sort(comparePlacementOrder);
  const { subRows: barSubRows, rowCount: barRowCount } = stackByRow(
    sortedBars,
    scale,
    minGapPx,
    estimateLabelWidth,
  );
  for (const [itemId, row] of barSubRows) {
    subRows.set(itemId, milestoneRowCount + row);
  }

  return { subRows, maxDepth: milestoneRowCount + barRowCount };
}
