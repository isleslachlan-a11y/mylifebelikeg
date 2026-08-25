import { describe, expect, it } from "vitest";

import {
  createScale,
  createTimelineScale,
  widthForItem,
  type ZoomLevel,
} from "./scale";

const JAN_1 = new Date("2026-01-01");
const JAN_31 = new Date("2026-01-31");
const JAN_16 = new Date("2026-01-16"); // roughly the midpoint

describe("createTimelineScale", () => {
  it("maps the domain start and end to the range start and end", () => {
    const scale = createTimelineScale([JAN_1, JAN_31], [0, 300]);
    expect(scale.toPixel(JAN_1)).toBe(0);
    expect(scale.toPixel(JAN_31)).toBe(300);
  });

  it("maps a midpoint date to roughly the midpoint pixel", () => {
    const scale = createTimelineScale([JAN_1, JAN_31], [0, 300]);
    // Jan 16 is 15/30 of the way through Jan 1 -> Jan 31.
    expect(scale.toPixel(JAN_16)).toBeCloseTo(150, 0);
  });

  it("extrapolates for dates outside the domain, rather than clamping", () => {
    const scale = createTimelineScale([JAN_1, JAN_31], [0, 300]);
    const beforeStart = new Date("2025-12-27"); // 5 days before domain start
    expect(scale.toPixel(beforeStart)).toBeLessThan(0);
  });

  it("respects a non-zero range start (e.g. a left margin)", () => {
    const scale = createTimelineScale([JAN_1, JAN_31], [20, 320]);
    expect(scale.toPixel(JAN_1)).toBe(20);
    expect(scale.toPixel(JAN_31)).toBe(320);
  });

  describe("toPixelSpan", () => {
    it("is the pixel distance between two dates", () => {
      const scale = createTimelineScale([JAN_1, JAN_31], [0, 300]);
      // A 10-day span out of a 30-day, 300px domain -> 100px.
      const start = new Date("2026-01-01");
      const end = new Date("2026-01-11");
      expect(scale.toPixelSpan(start, end)).toBeCloseTo(100, 0);
    });

    it("is zero for a zero-duration span", () => {
      const scale = createTimelineScale([JAN_1, JAN_31], [0, 300]);
      expect(scale.toPixelSpan(JAN_16, JAN_16)).toBe(0);
    });

    it("is negative when end precedes start — the caller's problem to clamp, not this module's", () => {
      const scale = createTimelineScale([JAN_1, JAN_31], [0, 300]);
      expect(scale.toPixelSpan(JAN_31, JAN_1)).toBeLessThan(0);
    });
  });

  describe("ticks", () => {
    it("returns dates within (or very near) the domain", () => {
      const scale = createTimelineScale([JAN_1, JAN_31], [0, 300]);
      const ticks = scale.ticks(4);
      expect(ticks.length).toBeGreaterThan(0);
      for (const t of ticks) {
        expect(t.getTime()).toBeGreaterThanOrEqual(JAN_1.getTime());
        expect(t.getTime()).toBeLessThanOrEqual(JAN_31.getTime());
      }
    });

    it("returns roughly the requested count, not an exact naive split", () => {
      // d3's ticks() picks "nice" boundaries (e.g. week starts), so this
      // is a sanity range, not an exact match — that's the whole point
      // of using it instead of hand-rolling even spacing.
      const scale = createTimelineScale([JAN_1, JAN_31], [0, 300]);
      const ticks = scale.ticks(4);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(8);
    });
  });
});

const ZOOM_LEVELS: ZoomLevel[] = ["day", "week", "month", "quarter", "year"];
const ANCHOR = new Date("2026-06-15T00:00:00.000Z");

describe("createScale", () => {
  it.each(ZOOM_LEVELS)(
    "maps the domain start to pixel 0 and domain end to rangePx at %s zoom",
    (zoom) => {
      const scale = createScale(zoom, ANCHOR, 1000);
      expect(scale.toPixel(scale.domain[0])).toBeCloseTo(0, 6);
      expect(scale.toPixel(scale.domain[1])).toBeCloseTo(1000, 6);
    },
  );

  it.each(ZOOM_LEVELS)(
    "round-trips date -> pixel -> date losslessly to the day at %s zoom",
    (zoom) => {
      const scale = createScale(zoom, ANCHOR, 1000);
      const roundTripped = scale.toDate(scale.toPixel(ANCHOR));
      const dayMs = 86_400_000;
      expect(Math.abs(roundTripped.getTime() - ANCHOR.getTime())).toBeLessThan(
        dayMs,
      );
    },
  );

  it.each(ZOOM_LEVELS)(
    "produces a non-empty, ascending tick set at %s zoom",
    (zoom) => {
      const scale = createScale(zoom, ANCHOR, 1000);
      const ticks = scale.ticks();
      expect(ticks.length).toBeGreaterThan(0);
      const times = ticks.map((t) => t.getTime());
      const strictlyAscending = times.every(
        (t, i) => i === 0 || t > times[i - 1]!,
      );
      expect(strictlyAscending).toBe(true);
    },
  );

  it("centres the domain on the anchor date", () => {
    const scale = createScale("month", ANCHOR, 1000);
    const [start, end] = scale.domain;
    const toAnchor = ANCHOR.getTime() - start.getTime();
    const fromAnchor = end.getTime() - ANCHOR.getTime();
    // Equal on both sides of the anchor, not fit to any data extent.
    expect(toAnchor).toBeCloseTo(fromAnchor, -2);
  });

  it("shrinks pxPerDay as zoom widens (day zoom is denser than year zoom)", () => {
    const day = createScale("day", ANCHOR, 1000);
    const year = createScale("year", ANCHOR, 1000);
    expect(day.pxPerDay).toBeGreaterThan(year.pxPerDay);
  });
});

describe("widthForItem", () => {
  it("matches toPixel(end) - toPixel(start) on a TimelineScale", () => {
    const scale = createTimelineScale([JAN_1, JAN_31], [0, 300]);
    const start = new Date("2026-01-01");
    const end = new Date("2026-01-11");
    expect(widthForItem(start, end, scale)).toBeCloseTo(
      scale.toPixelSpan(start, end),
      6,
    );
  });

  it("works with a MultiZoomScale too", () => {
    const scale = createScale("month", ANCHOR, 1000);
    const start = scale.domain[0];
    const end = scale.toDate(500);
    expect(widthForItem(start, end, scale)).toBeCloseTo(500, 0);
  });

  it("is zero for a zero-duration item", () => {
    const scale = createTimelineScale([JAN_1, JAN_31], [0, 300]);
    expect(widthForItem(JAN_16, JAN_16, scale)).toBe(0);
  });
});
