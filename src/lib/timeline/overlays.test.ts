import { describe, expect, it } from "vitest";

import {
  computeOverlayLine,
  needsStickyLabel,
  needsTruncatedLabel,
} from "./overlays";
import { createTimelineScale } from "./scale";

const JAN_1 = new Date("2026-01-01");
const JAN_31 = new Date("2026-01-31");
const SCALE = createTimelineScale([JAN_1, JAN_31], [0, 300]);

describe("computeOverlayLine", () => {
  it("positions a date within the domain as visible", () => {
    const line = computeOverlayLine(new Date("2026-01-16"), SCALE, 300);
    expect(line.px).toBeCloseTo(150, 0);
    expect(line.visible).toBe(true);
  });

  it("is visible exactly at the range edges (inclusive)", () => {
    expect(computeOverlayLine(JAN_1, SCALE, 300).visible).toBe(true);
    expect(computeOverlayLine(JAN_31, SCALE, 300).visible).toBe(true);
  });

  it("is not visible once scrolled past either edge of the range", () => {
    const before = computeOverlayLine(new Date("2025-12-01"), SCALE, 300);
    expect(before.px).toBeLessThan(0);
    expect(before.visible).toBe(false);

    const after = computeOverlayLine(new Date("2026-03-01"), SCALE, 300);
    expect(after.px).toBeGreaterThan(300);
    expect(after.visible).toBe(false);
  });
});

describe("needsStickyLabel", () => {
  it("is true once rendered width exceeds the viewport", () => {
    expect(needsStickyLabel(1200, 1000)).toBe(true);
  });

  it("is false for an item that fits within the viewport", () => {
    expect(needsStickyLabel(90, 1000)).toBe(false);
  });

  it("is false exactly at the viewport width (not strictly wider)", () => {
    expect(needsStickyLabel(1000, 1000)).toBe(false);
  });

  it("doesn't care why the item is wide — a short task at day zoom and a multi-year goal at year zoom are the same decision", () => {
    // A 3-day task at day zoom (~40px/day per PHASE-3-REQUIREMENTS.MD's
    // P3.0 table) can exceed a narrow viewport just like a 2-year goal at
    // year zoom (~0.25px/day) can stay under one — same function, same
    // rule, no branch on duration_days anywhere.
    const threeDayTaskWidthPx = 3 * 40;
    const twoYearGoalWidthPx = 2 * 365 * 0.25;
    expect(needsStickyLabel(threeDayTaskWidthPx, 100)).toBe(true);
    expect(needsStickyLabel(twoYearGoalWidthPx, 300)).toBe(false);
  });
});

describe("needsTruncatedLabel", () => {
  it("is true when the item is narrower than its label", () => {
    expect(needsTruncatedLabel(20, 90)).toBe(true);
  });

  it("is false when the item is at least as wide as its label", () => {
    expect(needsTruncatedLabel(120, 90)).toBe(false);
    expect(needsTruncatedLabel(90, 90)).toBe(false);
  });
});
