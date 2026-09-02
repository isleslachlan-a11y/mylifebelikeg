import { describe, expect, it } from "vitest";

import {
  routeOrthogonal,
  selectCriticalPathEdges,
  shouldShowCriticalPathArrows,
  toSvgPoints,
  type DependencyEdgeInput,
} from "./critical-path";

describe("selectCriticalPathEdges", () => {
  const deps: DependencyEdgeInput[] = [
    { id: "e1", predecessor_task_id: "t1", successor_task_id: "t2" },
    { id: "e2", predecessor_task_id: "t2", successor_task_id: "t3" },
    { id: "e3", predecessor_task_id: "t3", successor_task_id: "t4" },
  ];

  it("keeps an edge only when both ends are critical and rendered", () => {
    const rendered = new Set(["t1", "t2", "t3"]);
    const edges = selectCriticalPathEdges(deps, rendered);
    expect(edges).toEqual([
      { edgeId: "e1", predecessorTaskId: "t1", successorTaskId: "t2" },
      { edgeId: "e2", predecessorTaskId: "t2", successorTaskId: "t3" },
    ]);
  });

  it("drops an edge whose successor isn't critical/rendered (t4 missing)", () => {
    const rendered = new Set(["t1", "t2", "t3"]);
    const edges = selectCriticalPathEdges(deps, rendered);
    expect(edges.some((e) => e.successorTaskId === "t4")).toBe(false);
  });

  it("drops an edge whose predecessor is critical but not currently rendered (e.g. windowed out or in a collapsed lane)", () => {
    // t1 is critical but not in the rendered set (off-screen); t2 is.
    const rendered = new Set(["t2", "t3"]);
    const edges = selectCriticalPathEdges(deps, rendered);
    expect(edges).toEqual([
      { edgeId: "e2", predecessorTaskId: "t2", successorTaskId: "t3" },
    ]);
  });

  it("returns nothing for an empty rendered set", () => {
    expect(selectCriticalPathEdges(deps, new Set())).toEqual([]);
  });
});

describe("routeOrthogonal", () => {
  it("is a single straight segment when both ends share a lane/column", () => {
    const from = { primaryStart: 0, primaryEnd: 100, cross: 40 };
    const to = { primaryStart: 150, primaryEnd: 250, cross: 40 };
    const points = routeOrthogonal(from, to);
    expect(points).toEqual([
      { primary: 100, cross: 40 },
      { primary: 150, cross: 40 },
    ]);
  });

  it("elbows through the gutter (3 turns) when cross values differ", () => {
    const from = { primaryStart: 0, primaryEnd: 100, cross: 40 };
    const to = { primaryStart: 200, primaryEnd: 300, cross: 120 };
    const points = routeOrthogonal(from, to, { leadPx: 10 });
    expect(points).toEqual([
      { primary: 100, cross: 40 }, // predecessor's exit
      { primary: 150, cross: 40 }, // midpoint of [100+10, 200-10] = (110+190)/2
      { primary: 150, cross: 120 }, // the cross-axis jog
      { primary: 200, cross: 120 }, // successor's entry
    ]);
  });

  it("still turns at the midpoint, not off the end, when the primary gap is smaller than 2*leadPx", () => {
    const from = { primaryStart: 0, primaryEnd: 100, cross: 40 };
    const to = { primaryStart: 104, primaryEnd: 200, cross: 120 }; // gap of only 4px
    const points = routeOrthogonal(from, to, { leadPx: 10 });
    // outPrimary (110) > inPrimary (94), so it falls back to splitting
    // the actual [100, 104] gap down the middle (102) instead of
    // overshooting past the successor's own start.
    expect(points[1]!.primary).toBe(102);
    expect(points[2]!.primary).toBe(102);
    expect(points[0]).toEqual({ primary: 100, cross: 40 });
    expect(points[3]).toEqual({ primary: 104, cross: 120 });
  });

  it("still produces a valid (if backwards-leaning) route for a non-FS edge whose predecessor ends after the successor starts", () => {
    const from = { primaryStart: 0, primaryEnd: 200, cross: 40 }; // ends at 200
    const to = { primaryStart: 50, primaryEnd: 150, cross: 120 }; // starts at 50, before 200
    const points = routeOrthogonal(from, to);
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual({ primary: 200, cross: 40 });
    expect(points[3]).toEqual({ primary: 50, cross: 120 });
  });
});

describe("toSvgPoints", () => {
  it("formats an orthogonal route as an SVG points string via the caller's own (primary, cross) -> (x, y) mapping", () => {
    const points = [
      { primary: 10, cross: 20 },
      { primary: 30, cross: 20 },
      { primary: 30, cross: 60 },
    ];
    // Horizontal orientation: primary -> x, cross -> y.
    expect(toSvgPoints(points, (p) => ({ x: p.primary, y: p.cross }))).toBe(
      "10,20 30,20 30,60",
    );
    // Vertical orientation: primary -> y, cross -> x (transposed, per R6).
    expect(toSvgPoints(points, (p) => ({ x: p.cross, y: p.primary }))).toBe(
      "20,10 20,30 60,30",
    );
  });
});

describe("shouldShowCriticalPathArrows", () => {
  it("shows arrows at day, week, and month zoom", () => {
    expect(shouldShowCriticalPathArrows("day")).toBe(true);
    expect(shouldShowCriticalPathArrows("week")).toBe(true);
    expect(shouldShowCriticalPathArrows("month")).toBe(true);
  });

  it("suppresses arrows at quarter and year zoom (brief, verbatim)", () => {
    expect(shouldShowCriticalPathArrows("quarter")).toBe(false);
    expect(shouldShowCriticalPathArrows("year")).toBe(false);
  });
});
