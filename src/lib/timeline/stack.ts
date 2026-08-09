/**
 * Interval stacking for timeline bars (PHASE-3-REQUIREMENTS.MD's R4):
 * assigns overlapping items to sub-rows so they render side by side
 * instead of on top of each other. This is the classic "minimum number
 * of meeting rooms" greedy interval-scheduling algorithm — sort by
 * start, and for each item reuse the first row whose last item already
 * ends (plus a gap) before this one starts, else open a new row.
 *
 * Overlap is decided in pixels, not dates: `getStart`/`getEnd` are
 * expected to already be pixel positions (from a `TimelineScale`), and
 * `minGap` is a pixel constant, not a calendar one — two items a day
 * apart can still visually collide at a compressed scale, and R4 is
 * explicit that this has to be judged in rendered space.
 *
 * Deliberately generic (not task-shaped) so Phase 3's full timeline can
 * reuse it for its own lanes, same as `scale.ts`.
 */

export type StackedItem<T> = {
  item: T;
  /** 0-based sub-row index within the stack. */
  row: number;
  /** Pixel x position (left edge). */
  x: number;
  /** Pixel width, already floored to at least `minWidth`. */
  width: number;
};

export function stackIntervals<T>(
  items: T[],
  getStart: (item: T) => number,
  getEnd: (item: T) => number,
  options: { minWidth?: number; minGap?: number } = {},
): StackedItem<T>[] {
  const minWidth = options.minWidth ?? 0;
  const minGap = options.minGap ?? 0;

  // Effective end accounts for the rendered minimum width up front, so a
  // pair of back-to-back zero-duration items that would otherwise not
  // overlap by date still stack correctly once minWidth makes them
  // visually touch.
  const withPixels = items
    .map((item) => {
      const start = getStart(item);
      const end = Math.max(getEnd(item), start + minWidth);
      return { item, start, end };
    })
    .sort((a, b) => a.start - b.start);

  const rowEnds: number[] = [];

  return withPixels.map(({ item, start, end }) => {
    let row = rowEnds.findIndex((rowEnd) => start >= rowEnd);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(end + minGap);
    } else {
      rowEnds[row] = end + minGap;
    }
    return { item, row, x: start, width: end - start };
  });
}

/** 1 + the highest row index used — how many sub-rows a stacked layout needs. */
export function stackedRowCount<T>(stacked: StackedItem<T>[]): number {
  return stacked.reduce((max, s) => Math.max(max, s.row + 1), 0);
}
