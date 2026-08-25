import { describe, expect, it } from "vitest";

import { groupIntoLanes, type LaneableItem, type LifeAreaMeta } from "./lanes";
import { createScale } from "./scale";
import { assignSubRows, type StackableItem } from "./stacking";

/**
 * P3.8's performance pass: a reusable realistic dataset (200+ items, 6
 * lanes, 3 years — the brief's own minimum) plus timing assertions that
 * double as a regression guard. This is the "baseline for Phase 5" the
 * brief asks PERF-NOTES.md to record — rerun this file (`npx vitest run
 * src/lib/timeline/perf.test.ts`) whenever timeline rendering changes,
 * and compare against the numbers in PERF-NOTES.md.
 *
 * Scope: this measures the *pure logic* (grouping, stacking, scale
 * math) in Node, which is everything in `timeline/` that can be timed
 * without a browser. It does not and cannot measure actual paint/scroll
 * frame rate, DOM node count cost, or real device behaviour — see
 * PERF-NOTES.md for what that requires and why it isn't done here.
 */

const LIFE_AREA_COUNT = 6;
const GOAL_COUNT = 24;
const YEARS = 3;
const START = new Date("2024-01-01T00:00:00.000Z");
const DAY_MS = 86_400_000;

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * A realistic-shaped dataset: `goalCount` goals (24 by default — the
 * brief's own minimum works out to 240 items at that count) spread
 * across 6 life areas over 3 years, each with a handful of milestones
 * and a cluster of tasks (some deliberately overlapping, to actually
 * exercise the stacking algorithm rather than measuring a best case
 * where nothing collides). Deterministic (no `Math.random`) so repeated
 * runs are comparable. `goalCount` is a parameter (not just a module
 * constant) so the stress-test block below can reuse this at 10x scale
 * without a second, drifting copy of the generator.
 */
function generateDataset(goalCount = GOAL_COUNT): LaneableItem[] {
  const items: LaneableItem[] = [];
  const lifeAreaIds = Array.from(
    { length: LIFE_AREA_COUNT },
    (_, i) => `life-area-${i}`,
  );

  for (let g = 0; g < goalCount; g++) {
    const goalId = `goal-${g}`;
    const lifeAreaId = lifeAreaIds[g % LIFE_AREA_COUNT];
    const ownerId = g % 5 === 0 ? "user-collaborator" : "user-owner";
    const goalStartOffset = Math.floor((g / goalCount) * YEARS * 365);
    const goalDurationDays = 60 + (g % 5) * 30; // 60-180 days

    items.push({
      item_id: goalId,
      item_type: "goal",
      goal_id: goalId,
      owner_id: ownerId,
      life_area_id: lifeAreaId ?? null,
      starts_on: addDays(START, goalStartOffset),
      title: `Goal ${g}`,
    });

    // 3 milestones per goal.
    for (let m = 0; m < 3; m++) {
      items.push({
        item_id: `${goalId}-milestone-${m}`,
        item_type: "milestone",
        goal_id: goalId,
        owner_id: ownerId,
        life_area_id: lifeAreaId ?? null,
        starts_on: addDays(
          START,
          goalStartOffset + Math.floor((goalDurationDays / 3) * m),
        ),
        title: `Goal ${g} milestone ${m}`,
      });
    }

    // ~6 tasks per goal, deliberately overlapping in pairs/triples so
    // the collision-stacking path is actually exercised, not just the
    // greedy loop's cheap "no overlap" branch.
    for (let t = 0; t < 6; t++) {
      const taskStartOffset =
        goalStartOffset + Math.floor((t / 2) * (goalDurationDays / 4));
      items.push({
        item_id: `${goalId}-task-${t}`,
        item_type: "task",
        goal_id: goalId,
        owner_id: ownerId,
        life_area_id: lifeAreaId ?? null,
        starts_on: addDays(START, taskStartOffset),
        title: `Goal ${g} task ${t} — a reasonably realistic task title`,
      });
    }
  }

  return items;
}

/** Bare-date items need real end dates for `assignSubRows`; goals/tasks get a duration, milestones stay zero-duration (both starts_on and ends_on equal). */
function toStackable(item: LaneableItem, durationDays: number): StackableItem {
  const starts = new Date(`${item.starts_on}T00:00:00.000Z`);
  const ends =
    item.item_type === "milestone"
      ? starts
      : new Date(starts.getTime() + durationDays * DAY_MS);
  return {
    item_id: item.item_id,
    item_type: item.item_type,
    starts_on: starts,
    ends_on: ends,
    sort_order: 0,
    title: item.title,
  };
}

describe("P3.8 perf: realistic dataset shape", () => {
  it("is at least 200 items across 6 lanes spanning 3 years (the brief's own minimum)", () => {
    const items = generateDataset();
    expect(items.length).toBeGreaterThanOrEqual(200);

    const lifeAreaIds = new Set(items.map((i) => i.life_area_id));
    expect(lifeAreaIds.size).toBe(LIFE_AREA_COUNT);

    const dates = items
      .map((i) => i.starts_on)
      .filter((d): d is string => d != null)
      .map((d) => new Date(d).getTime());
    const spanDays = (Math.max(...dates) - Math.min(...dates)) / DAY_MS;
    expect(spanDays).toBeGreaterThanOrEqual(YEARS * 365 - 90); // allow the last goal's own slack
  });
});

describe("P3.8 perf: scroll container size at week zoom (R5 / spike regression check)", () => {
  it("never grows with data span — rangePx is caller-chosen, domain is what's capped (P3.0)", () => {
    // The spike measured ~65,700px because its container width scaled
    // with calendar span x a fixed px/day. This architecture inverts
    // that: rangePx is fixed by the caller (e.g. the viewport), and the
    // *domain* (which dates fit in it) is what's zoom-capped instead —
    // so container width is structurally independent of both zoom and
    // data span. Proven directly, not by rendering anything.
    for (const rangePx of [800, 1000, 2400]) {
      const weekScale = createScale("week", new Date("2025-06-15"), rangePx);
      const yearScale = createScale("year", new Date("2025-06-15"), rangePx);
      // Same rangePx in, same rangePx out, regardless of zoom or how
      // much data exists — there is no code path in createScale that
      // can make this anything but rangePx.
      expect(weekScale.toPixel(weekScale.domain[1])).toBeCloseTo(rangePx, 6);
      expect(yearScale.toPixel(yearScale.domain[1])).toBeCloseTo(rangePx, 6);
    }
  });

  it("week zoom's domain itself stays capped at 6 months, not 3 years", () => {
    const scale = createScale("week", new Date("2025-06-15"), 1000);
    const spanDays =
      (scale.domain[1].getTime() - scale.domain[0].getTime()) / DAY_MS;
    expect(spanDays).toBeCloseTo(182, 0); // P3.0's ZOOM_CONFIG.week.maxSpanDays
  });
});

describe("P3.8 perf: grouping + stacking cost on the realistic dataset", () => {
  it("groupIntoLanes completes well within budget", () => {
    const items = generateDataset();
    const lifeAreas: LifeAreaMeta[] = Array.from(
      { length: LIFE_AREA_COUNT },
      (_, i) => ({
        id: `life-area-${i}`,
        name: `Life area ${i}`,
        colour: "#000000",
        sortOrder: i,
      }),
    );

    const start = performance.now();
    const lanes = groupIntoLanes(items, "life_area", { lifeAreas });
    const elapsedMs = performance.now() - start;

    console.log(
      `[perf] groupIntoLanes: ${items.length} items -> ${lanes.length} lanes in ${elapsedMs.toFixed(3)}ms`,
    );
    expect(lanes.length).toBe(LIFE_AREA_COUNT);
    // Generous budget — this is O(n), the real cost lives in per-lane
    // stacking below. Catches an accidental O(n^2) regression, not
    // meant to be a tight ceiling.
    expect(elapsedMs).toBeLessThan(50);
  });

  it("assignSubRows across all 6 lanes (one pass, as a single render would do) completes well within a 16ms frame budget", () => {
    const items = generateDataset();
    const lifeAreas: LifeAreaMeta[] = Array.from(
      { length: LIFE_AREA_COUNT },
      (_, i) => ({
        id: `life-area-${i}`,
        name: `Life area ${i}`,
        colour: "#000000",
        sortOrder: i,
      }),
    );
    const lanes = groupIntoLanes(items, "life_area", { lifeAreas });
    const scale = createScale("month", new Date("2025-06-15"), 1000);

    const start = performance.now();
    let totalDepth = 0;
    for (const lane of lanes) {
      const stackable = lane.items.map((item) => toStackable(item, 5));
      const { maxDepth } = assignSubRows(stackable, scale);
      totalDepth += maxDepth;
    }
    const elapsedMs = performance.now() - start;

    console.log(
      `[perf] assignSubRows x ${lanes.length} lanes (${items.length} items total): ${elapsedMs.toFixed(3)}ms, total depth ${totalDepth}`,
    );
    // 60fps's frame budget is ~16.7ms for *everything* in a frame,
    // stacking included — this should be a small fraction of that.
    expect(elapsedMs).toBeLessThan(16);
  });

  it("repeating assignSubRows for 30 simulated pan steps at a fixed zoom (no memoisation) shows the real cost of recomputing on every anchor change", () => {
    const items = generateDataset();
    const lifeAreas: LifeAreaMeta[] = Array.from(
      { length: LIFE_AREA_COUNT },
      (_, i) => ({
        id: `life-area-${i}`,
        name: `Life area ${i}`,
        colour: "#000000",
        sortOrder: i,
      }),
    );
    const lanes = groupIntoLanes(items, "life_area", { lifeAreas });
    const stackableByLane = lanes.map((lane) =>
      lane.items.map((item) => toStackable(item, 5)),
    );

    const start = performance.now();
    for (let step = 0; step < 30; step++) {
      // A pan step: same zoom, new anchor -> a genuinely new scale
      // object, matching what TimelineView's createScale(zoom, anchor,
      // rangePx) produces on every pan click before the P3.8 fix.
      const anchor = new Date(
        new Date("2025-06-15").getTime() + step * 7 * DAY_MS,
      );
      const scale = createScale("month", anchor, 1000);
      for (const stackable of stackableByLane) {
        assignSubRows(stackable, scale);
      }
    }
    const elapsedMs = performance.now() - start;

    console.log(
      `[perf] 30 pan steps x ${lanes.length} lanes, unmemoised: ${elapsedMs.toFixed(3)}ms total, ${(elapsedMs / 30).toFixed(3)}ms/step`,
    );
    // Documents the cost, doesn't gate on it — see PERF-NOTES.md for the
    // memoisation fix this motivated and the before/after comparison.
    expect(elapsedMs).toBeGreaterThan(0);
  });
});

describe("P3.8 perf: stress scale (10x the brief's minimum, to see where the curve bends)", () => {
  it("assignSubRows across all 6 lanes at ~2,400 items", () => {
    const items = generateDataset(GOAL_COUNT * 10);
    const lifeAreas: LifeAreaMeta[] = Array.from(
      { length: LIFE_AREA_COUNT },
      (_, i) => ({
        id: `life-area-${i}`,
        name: `Life area ${i}`,
        colour: "#000000",
        sortOrder: i,
      }),
    );
    const lanes = groupIntoLanes(items, "life_area", { lifeAreas });
    const scale = createScale("month", new Date("2025-06-15"), 1000);

    const start = performance.now();
    for (const lane of lanes) {
      const stackable = lane.items.map((item) => toStackable(item, 5));
      assignSubRows(stackable, scale);
    }
    const elapsedMs = performance.now() - start;

    console.log(
      `[perf] assignSubRows x ${lanes.length} lanes (${items.length} items total, 10x): ${elapsedMs.toFixed(3)}ms`,
    );
    // Not a real frame budget at this size — nobody's rendering 2,400
    // DOM nodes in one frame regardless of stacking cost (P3.1's range
    // windowing wouldn't fetch this many at once either). This just
    // confirms the algorithm stays roughly linear rather than blowing up
    // — O(n log n) sort dominating, no accidental O(n^2) comparison.
    expect(elapsedMs).toBeLessThan(200);
  });
});
