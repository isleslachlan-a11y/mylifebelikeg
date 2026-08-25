import { describe, expect, it } from "vitest";

import { createScale, createTimelineScale } from "./scale";
import { assignSubRows, type StackableItem } from "./stacking";

function item(
  overrides: Partial<StackableItem> & Pick<StackableItem, "item_id">,
): StackableItem {
  return {
    item_type: "task",
    starts_on: new Date("2026-01-01"),
    ends_on: new Date("2026-01-02"),
    sort_order: 0,
    title: "Item",
    ...overrides,
  };
}

// 10 px/day, domain Jan 1 - Dec 31 2026 (365 days -> 3650px) — round
// numbers, easy to reason about by hand.
const YEAR_2026_SCALE = createTimelineScale(
  [new Date("2026-01-01"), new Date("2026-12-31")],
  [0, 3650],
);

describe("assignSubRows — basic greedy placement", () => {
  it("two non-overlapping items share sub-row 0", () => {
    const items = [
      item({
        item_id: "a",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-05"),
      }),
      item({
        item_id: "b",
        starts_on: new Date("2026-01-20"),
        ends_on: new Date("2026-01-25"),
      }),
    ];
    const { subRows, maxDepth } = assignSubRows(items, YEAR_2026_SCALE);
    expect(subRows.get("a")).toBe(0);
    expect(subRows.get("b")).toBe(0);
    expect(maxDepth).toBe(1);
  });

  it("two overlapping items get rows 0 and 1", () => {
    const items = [
      item({
        item_id: "a",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-10"),
      }),
      item({
        item_id: "b",
        starts_on: new Date("2026-01-05"),
        ends_on: new Date("2026-01-15"),
      }),
    ];
    const { subRows, maxDepth } = assignSubRows(items, YEAR_2026_SCALE);
    expect(subRows.get("a")).toBe(0);
    expect(subRows.get("b")).toBe(1);
    expect(maxDepth).toBe(2);
  });

  it("three mutually overlapping items get rows 0, 1, 2", () => {
    const items = [
      item({
        item_id: "a",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-30"),
        sort_order: 0,
      }),
      item({
        item_id: "b",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-30"),
        sort_order: 1,
      }),
      item({
        item_id: "c",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-30"),
        sort_order: 2,
      }),
    ];
    const { subRows, maxDepth } = assignSubRows(items, YEAR_2026_SCALE);
    expect(subRows.get("a")).toBe(0);
    expect(subRows.get("b")).toBe(1);
    expect(subRows.get("c")).toBe(2);
    expect(maxDepth).toBe(3);
  });

  it("is empty for an empty item list", () => {
    const { subRows, maxDepth } = assignSubRows([], YEAR_2026_SCALE);
    expect(subRows.size).toBe(0);
    expect(maxDepth).toBe(0);
  });
});

describe("assignSubRows — label-space collisions (R4)", () => {
  // 0.1 px/day — coarse enough that a long label dominates over calendar
  // distance, same as a real zoomed-out year view.
  const COARSE_SCALE = createTimelineScale(
    [new Date("2026-01-01"), new Date("2027-01-01")],
    [0, 36.5],
  );

  it("stacks items that don't overlap in calendar time but do in label footprint", () => {
    const items = [
      item({
        item_id: "a",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-02"),
        title: "A very long task title that needs lots of label space",
      }),
      // Starts well after "a" ends — zero calendar overlap.
      item({
        item_id: "b",
        starts_on: new Date("2026-01-10"),
        ends_on: new Date("2026-01-11"),
        title: "B",
      }),
    ];
    const { subRows, maxDepth } = assignSubRows(items, COARSE_SCALE);
    expect(subRows.get("a")).toBe(0);
    expect(subRows.get("b")).toBe(1);
    expect(maxDepth).toBe(2);
  });

  it("does not stack the same dates under a custom zero-width label estimator", () => {
    // Far enough apart (~58 days, > 40px worth of minGapPx at 0.1 px/day)
    // that only the label footprint — not minGapPx alone — could force a
    // second row.
    const items = [
      item({
        item_id: "a",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-02"),
        title: "A very long task title",
      }),
      item({
        item_id: "b",
        starts_on: new Date("2026-03-01"),
        ends_on: new Date("2026-03-02"),
        title: "B",
      }),
    ];
    const { subRows } = assignSubRows(items, COARSE_SCALE, {
      estimateLabelWidth: () => 0,
    });
    expect(subRows.get("a")).toBe(0);
    expect(subRows.get("b")).toBe(0);
  });
});

describe("assignSubRows — milestones", () => {
  it("reserves sub-row 0 for milestones and never interleaves them with bars", () => {
    const items = [
      item({
        item_id: "m1",
        item_type: "milestone",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-01"),
      }),
      item({
        item_id: "t1",
        item_type: "task",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-02"),
      }),
    ];
    const { subRows, maxDepth } = assignSubRows(items, YEAR_2026_SCALE);
    expect(subRows.get("m1")).toBe(0);
    expect(subRows.get("t1")).toBe(1);
    expect(maxDepth).toBe(2);
  });

  it("does not reserve a milestone row when there are no milestones", () => {
    const items = [
      item({
        item_id: "t1",
        item_type: "task",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-02"),
      }),
    ];
    const { subRows, maxDepth } = assignSubRows(items, YEAR_2026_SCALE);
    expect(subRows.get("t1")).toBe(0);
    expect(maxDepth).toBe(1);
  });

  it("places every milestone at row 0, even a cluster of overlapping ones", () => {
    const items = [
      item({
        item_id: "m1",
        item_type: "milestone",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-01"),
      }),
      item({
        item_id: "m2",
        item_type: "milestone",
        starts_on: new Date("2026-01-02"),
        ends_on: new Date("2026-01-02"),
      }),
      item({
        item_id: "m3",
        item_type: "milestone",
        starts_on: new Date("2026-01-03"),
        ends_on: new Date("2026-01-03"),
      }),
    ];
    const { subRows, maxDepth } = assignSubRows(items, YEAR_2026_SCALE);
    expect(subRows.get("m1")).toBe(0);
    expect(subRows.get("m2")).toBe(0);
    expect(subRows.get("m3")).toBe(0);
    expect(maxDepth).toBe(1);
  });
});

describe("assignSubRows — goals are not stacked", () => {
  it("excludes goal items from the result entirely", () => {
    const items = [
      item({
        item_id: "g1",
        item_type: "goal",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-12-31"),
      }),
      item({
        item_id: "t1",
        item_type: "task",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-02"),
      }),
    ];
    const { subRows, maxDepth } = assignSubRows(items, YEAR_2026_SCALE);
    expect(subRows.has("g1")).toBe(false);
    expect(subRows.get("t1")).toBe(0);
    expect(maxDepth).toBe(1);
  });
});

describe("assignSubRows — determinism", () => {
  it("gives identical output for identical input at the same zoom", () => {
    const items = [
      item({
        item_id: "a",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-10"),
        sort_order: 1,
      }),
      item({
        item_id: "b",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-10"),
        sort_order: 0,
      }),
      item({
        item_id: "c",
        starts_on: new Date("2026-01-05"),
        ends_on: new Date("2026-01-20"),
      }),
    ];
    const first = assignSubRows(items, YEAR_2026_SCALE);
    const second = assignSubRows(
      items.map((i) => ({ ...i })), // fresh objects, same content
      YEAR_2026_SCALE,
    );
    expect(second.subRows).toEqual(first.subRows);
    expect(second.maxDepth).toBe(first.maxDepth);
  });

  it("breaks ties by sort_order, then item_id, regardless of input array order", () => {
    const inOrder = [
      item({
        item_id: "a",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-10"),
        sort_order: 0,
      }),
      item({
        item_id: "b",
        starts_on: new Date("2026-01-01"),
        ends_on: new Date("2026-01-10"),
        sort_order: 1,
      }),
    ];
    const reversed = [...inOrder].reverse();

    expect(assignSubRows(inOrder, YEAR_2026_SCALE).subRows).toEqual(
      assignSubRows(reversed, YEAR_2026_SCALE).subRows,
    );
  });
});

describe("assignSubRows — zoom monotonicity", () => {
  it("never increases depth for the same item set when zooming in", () => {
    const anchor = new Date("2026-06-15");
    const items = [
      item({
        item_id: "a",
        starts_on: anchor,
        ends_on: new Date("2026-06-16"),
        title: "A moderately long task title",
      }),
      // 14 days after "a" starts — zero calendar overlap either way.
      item({
        item_id: "b",
        starts_on: new Date("2026-06-29"),
        ends_on: new Date("2026-06-30"),
        title: "B",
      }),
    ];

    const yearScale = createScale("year", anchor, 1000);
    const dayScale = createScale("day", anchor, 1000);

    const yearDepth = assignSubRows(items, yearScale).maxDepth;
    const dayDepth = assignSubRows(items, dayScale).maxDepth;

    // Coarse enough (year) that the label footprint dominates the ~14-day
    // gap and forces a second row.
    expect(yearDepth).toBe(2);
    // Fine enough (day) that 14 real days of pixels comfortably clears
    // the same label footprint.
    expect(dayDepth).toBe(1);
    expect(dayDepth).toBeLessThanOrEqual(yearDepth);
  });

  it("holds across every adjacent zoom pair for a fixed item set", () => {
    const anchor = new Date("2026-06-15");
    const items = [
      item({
        item_id: "a",
        starts_on: anchor,
        ends_on: new Date("2026-06-16"),
        title: "Task with a decently long title",
      }),
      item({
        item_id: "b",
        starts_on: new Date("2026-06-20"),
        ends_on: new Date("2026-06-21"),
        title: "Task two",
      }),
      item({
        item_id: "c",
        starts_on: new Date("2026-06-25"),
        ends_on: new Date("2026-06-26"),
        title: "Task three",
      }),
    ];

    // Finest to coarsest — depth must never decrease along this order.
    const zoomOrder = ["day", "week", "month", "quarter", "year"] as const;
    const depths = zoomOrder.map(
      (zoom) => assignSubRows(items, createScale(zoom, anchor, 1000)).maxDepth,
    );

    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1] as number);
    }
  });
});
