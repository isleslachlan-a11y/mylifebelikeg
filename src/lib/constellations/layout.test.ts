import { describe, expect, it } from "vitest";

import {
  computeDepth,
  groupByYear,
  layoutConstellation,
  type ConstellationPoint,
} from "./layout";

describe("layoutConstellation", () => {
  it("returns nothing for an empty constellation", () => {
    expect(layoutConstellation([])).toEqual({ points: [], pathOrder: [] });
  });

  it("orders points chronologically, spreading cx from 0 to 100 across the constellation's own span", () => {
    const points: ConstellationPoint[] = [
      { id: "c", title: "Third", date: "2026-03-01", brightness: "normal" },
      { id: "a", title: "First", date: "2026-01-01", brightness: "normal" },
      { id: "b", title: "Second", date: "2026-02-01", brightness: "normal" },
    ];
    const { points: positioned, pathOrder } = layoutConstellation(points);

    expect(pathOrder).toEqual(["a", "b", "c"]);
    const byId = Object.fromEntries(positioned.map((p) => [p.id, p]));
    expect(byId.a!.cx).toBeCloseTo(0, 5);
    expect(byId.c!.cx).toBeCloseTo(100, 5);
    // b's date is exactly the midpoint (Jan 1 – Mar 1, Feb 1 in between,
    // though not exactly halfway by day count — just check it's strictly
    // between the two ends, not pinned to a specific value).
    expect(byId.b!.cx).toBeGreaterThan(byId.a!.cx);
    expect(byId.b!.cx).toBeLessThan(byId.c!.cx);
  });

  it("centres a single point at cx = 50 rather than dividing by zero", () => {
    const { points } = layoutConstellation([
      { id: "solo", title: "Only", date: "2026-01-01", brightness: "normal" },
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]!.cx).toBe(50);
  });

  it("centres every point at cx = 50 when they all share one instant (zero span)", () => {
    const points: ConstellationPoint[] = [
      {
        id: "x",
        title: "X",
        date: "2026-01-01T00:00:00Z",
        brightness: "normal",
      },
      {
        id: "y",
        title: "Y",
        date: "2026-01-01T00:00:00Z",
        brightness: "normal",
      },
    ];
    const { points: positioned } = layoutConstellation(points);
    expect(positioned.every((p) => p.cx === 50)).toBe(true);
  });

  it("keeps cy within the inset bounds, and is deterministic across calls (same id -> same cy)", () => {
    const points: ConstellationPoint[] = Array.from({ length: 20 }, (_, i) => ({
      id: `task-${i}`,
      title: `Task ${i}`,
      date: "2026-01-01",
      brightness: "normal" as const,
    }));
    const first = layoutConstellation(points);
    const second = layoutConstellation(points);
    for (const p of first.points) {
      expect(p.cy).toBeGreaterThanOrEqual(14);
      expect(p.cy).toBeLessThanOrEqual(86);
    }
    expect(first.points.map((p) => p.cy)).toEqual(
      second.points.map((p) => p.cy),
    );
  });

  it("genuinely spreads cy across the inset range, including for short/similar ids — not just clustered near one end", () => {
    // Regression check for a real bug caught during P5.3's build: plain
    // djb2 under-mixes a short input's high bits, so ids differing only
    // in their last character or two (e.g. a hand-written fixture using
    // "t1"/"t2"/"m1") used to hash to nearly identical cy values —
    // every star in a constellation landing on the same horizontal line
    // instead of a scatter. Real task/milestone ids are full UUIDs,
    // where plain djb2 alone was already fine — this exists so a future
    // caller with shorter ids (or another test fixture) can't
    // regress silently, since the bug only ever showed up in an actual
    // rendered image, never in a type check or a bounds-only assertion
    // like the test above.
    const points: ConstellationPoint[] = [
      { id: "t1", title: "A", date: "2026-01-01", brightness: "normal" },
      { id: "t2", title: "B", date: "2026-01-01", brightness: "normal" },
      { id: "m1", title: "C", date: "2026-01-01", brightness: "normal" },
      { id: "t3", title: "D", date: "2026-01-01", brightness: "normal" },
      { id: "t4", title: "E", date: "2026-01-01", brightness: "normal" },
      { id: "m2", title: "F", date: "2026-01-01", brightness: "normal" },
    ];
    const { points: positioned } = layoutConstellation(points);
    const cys = positioned.map((p) => p.cy);
    expect(Math.max(...cys) - Math.min(...cys)).toBeGreaterThan(20);
  });

  it("breaks a tie on identical dates by id, deterministically", () => {
    const points: ConstellationPoint[] = [
      { id: "z", title: "Z", date: "2026-01-01", brightness: "normal" },
      { id: "a", title: "A", date: "2026-01-01", brightness: "normal" },
    ];
    expect(layoutConstellation(points).pathOrder).toEqual(["a", "z"]);
  });

  it("preserves brightness on the positioned point", () => {
    const { points } = layoutConstellation([
      { id: "m", title: "Milestone", date: "2026-01-01", brightness: "bright" },
    ]);
    expect(points[0]!.brightness).toBe("bright");
  });
});

describe("computeDepth", () => {
  it("is full scale/opacity for the only (or most recent) group", () => {
    expect(computeDepth(0, 1)).toEqual({ scale: 1, opacity: 1 });
    expect(computeDepth(0, 5)).toEqual({ scale: 1, opacity: 1 });
  });

  it("recedes (smaller scale, lower opacity) as rank increases", () => {
    const near = computeDepth(1, 5);
    const far = computeDepth(4, 5);
    expect(far.scale).toBeLessThan(near.scale);
    expect(far.opacity).toBeLessThan(near.opacity);
    expect(near.scale).toBeLessThan(1);
  });

  it("floors rather than fading to nothing for the oldest group", () => {
    const oldest = computeDepth(9, 10);
    expect(oldest.scale).toBeGreaterThan(0.5);
    expect(oldest.opacity).toBeGreaterThan(0.3);
  });
});

describe("groupByYear", () => {
  it("buckets by calendar year, most recent first", () => {
    const items = [
      { id: "1", when: "2025-06-01T00:00:00Z" },
      { id: "2", when: "2027-01-01T00:00:00Z" },
      { id: "3", when: "2026-12-31T23:59:59Z" },
      { id: "4", when: "2025-01-01T00:00:00Z" },
    ];
    const groups = groupByYear(items, (i) => i.when);
    expect(groups.map((g) => g.year)).toEqual([2027, 2026, 2025]);
    expect(groups.find((g) => g.year === 2025)!.items.map((i) => i.id)).toEqual(
      ["1", "4"],
    );
  });

  it("returns an empty array for no items", () => {
    expect(groupByYear([], () => "2026-01-01")).toEqual([]);
  });
});
