/**
 * P3.6's overlay layer: today marker, financial horizon line, and the
 * sticky-vs-truncated label decision. Pure, no React/DOM — same
 * convention as the rest of `timeline/`, and genuinely shared by both
 * orientations this time (unlike the layout constants in
 * `horizontal-timeline.tsx`/`vertical-timeline.tsx`, which explicitly
 * are not) — a pixel position on the time axis, or a width-vs-viewport
 * comparison, doesn't care which way the axis is drawn.
 *
 * The actual "stays pinned while any part of the item is on screen"
 * mechanic is plain CSS `position: sticky` on the label, nested inside
 * the (absolutely positioned) bar — no JS scroll math needed, and
 * nothing here computes a scroll-relative offset. What *is* worth
 * computing in code, and testing, is the *decision* of which treatment
 * an item gets, which is exactly what R1 says must come from rendered
 * pixel width, never `duration_days`.
 */

/** A vertical/horizontal guideline's position within the current scale's range — `visible` is false once it's scrolled out of `[0, rangePx]`, not that it doesn't exist. */
export type OverlayLine = {
  px: number;
  visible: boolean;
};

/**
 * Positions a single-point-in-time overlay line (today marker, financial
 * horizon) against `scale`. Callers decide *whether* to compute this at
 * all for a nullable date (financial horizon returns null when there are
 * no active funded goals — render nothing, not a line at epoch, per the
 * P3.6 brief) — this function only ever takes a real `Date`.
 */
export function computeOverlayLine(
  date: Date,
  scale: { toPixel(date: Date): number },
  rangePx: number,
): OverlayLine {
  const px = scale.toPixel(date);
  return { px, visible: px >= 0 && px <= rangePx };
}

/**
 * R1's generalisation from the spike: an item whose *rendered* width
 * exceeds the viewport needs a sticky label, regardless of how long it
 * spans calendar-wise. A three-day task at day zoom can be wider than
 * the viewport; a two-year goal at year zoom can be 90px — multi-year
 * goals are simply the common case of this, not a special one, so there
 * is deliberately no separate "is this a goal" branch anywhere near this
 * decision.
 */
export function needsStickyLabel(
  itemWidthPx: number,
  viewportPx: number,
): boolean {
  return itemWidthPx > viewportPx;
}

/**
 * The other half of R1: an item narrower than its own label needs
 * truncation (with a tooltip covering the rest — this app already has
 * one for free, the native `title` attribute every bar/band already
 * carries). Both this and `needsStickyLabel` read the same
 * `widthForItem()` output; neither ever branches on `duration_days`.
 */
export function needsTruncatedLabel(
  itemWidthPx: number,
  labelWidthPx: number,
): boolean {
  return itemWidthPx < labelWidthPx;
}
