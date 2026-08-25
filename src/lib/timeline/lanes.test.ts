import { describe, expect, it } from "vitest";

import { groupIntoLanes, type LaneableItem, type LifeAreaMeta } from "./lanes";

function item(
  overrides: Partial<LaneableItem> & Pick<LaneableItem, "item_id">,
): LaneableItem {
  return {
    item_type: "task",
    goal_id: "g1",
    owner_id: "user-1",
    life_area_id: null,
    starts_on: "2026-01-01",
    title: "Item",
    ...overrides,
  };
}

describe("groupIntoLanes — life_area mode", () => {
  const lifeAreas: LifeAreaMeta[] = [
    { id: "career", name: "Career", colour: "#5B8DD9", sortOrder: 1 },
    { id: "health", name: "Health", colour: "#4FB8A5", sortOrder: 0 },
    { id: "uncat", name: "Uncategorised", colour: "#6B7280", sortOrder: 99 },
  ];

  it("returns one lane per area, in sortOrder, with each area's own colour", () => {
    const lanes = groupIntoLanes([], "life_area", { lifeAreas });
    expect(lanes.map((l) => l.laneId)).toEqual(["health", "career", "uncat"]);
    expect(lanes.find((l) => l.laneId === "health")?.colour).toBe("#4FB8A5");
  });

  it("keeps a lane present (with zero items) even when nothing is assigned to it", () => {
    const lanes = groupIntoLanes([], "life_area", { lifeAreas });
    expect(lanes).toHaveLength(3);
    expect(lanes.every((l) => l.items.length === 0)).toBe(true);
  });

  it("buckets items into the matching area by life_area_id", () => {
    const items = [
      item({ item_id: "a", life_area_id: "career" }),
      item({ item_id: "b", life_area_id: "health" }),
      item({ item_id: "c", life_area_id: "career" }),
    ];
    const lanes = groupIntoLanes(items, "life_area", { lifeAreas });
    expect(
      lanes.find((l) => l.laneId === "career")?.items.map((i) => i.item_id),
    ).toEqual(["a", "c"]);
    expect(
      lanes.find((l) => l.laneId === "health")?.items.map((i) => i.item_id),
    ).toEqual(["b"]);
  });

  it("routes an item matching the real, system-seeded Uncategorised area into that named lane, not the synthetic fallback", () => {
    const items = [item({ item_id: "a", life_area_id: "uncat" })];
    const lanes = groupIntoLanes(items, "life_area", { lifeAreas });
    expect(lanes.find((l) => l.laneId === "uncat")?.items).toHaveLength(1);
    expect(lanes.some((l) => l.laneId === "__uncategorised__")).toBe(false);
  });

  it("omits the synthetic Uncategorised lane entirely when nothing needs it", () => {
    const items = [item({ item_id: "a", life_area_id: "career" })];
    const lanes = groupIntoLanes(items, "life_area", { lifeAreas });
    expect(lanes.some((l) => l.laneId === "__uncategorised__")).toBe(false);
  });

  it("adds a synthetic Uncategorised lane for a null or unmatched life_area_id, only once it has items", () => {
    const items = [
      item({ item_id: "a", life_area_id: null }),
      item({ item_id: "b", life_area_id: "does-not-exist" }),
    ];
    const lanes = groupIntoLanes(items, "life_area", { lifeAreas });
    const fallbackLane = lanes.find((l) => l.laneId === "__uncategorised__");
    expect(fallbackLane).toBeDefined();
    expect(fallbackLane?.name).toBe("Uncategorised");
    expect(fallbackLane?.items.map((i) => i.item_id)).toEqual(["a", "b"]);
  });
});

describe("groupIntoLanes — owner mode", () => {
  it("groups by each item's own owner_id — goal/milestone rows by the goal's owner, task rows by the task's own owner", () => {
    const items = [
      item({ item_id: "goal-row", item_type: "goal", owner_id: "alex" }),
      item({
        item_id: "milestone-row",
        item_type: "milestone",
        owner_id: "alex",
      }),
      // A task on a shared goal, owned by a different participant.
      item({ item_id: "task-row", item_type: "task", owner_id: "sam" }),
    ];
    const lanes = groupIntoLanes(items, "owner", {
      ownerNames: new Map([
        ["alex", "Alex"],
        ["sam", "Sam"],
      ]),
    });
    expect(lanes.map((l) => l.laneId).sort()).toEqual(["alex", "sam"]);
    expect(
      lanes
        .find((l) => l.laneId === "alex")
        ?.items.map((i) => i.item_id)
        .sort(),
    ).toEqual(["goal-row", "milestone-row"]);
    expect(
      lanes.find((l) => l.laneId === "sam")?.items.map((i) => i.item_id),
    ).toEqual(["task-row"]);
  });

  it("falls back to the raw owner_id when no name is supplied", () => {
    const items = [item({ item_id: "a", owner_id: "user-1" })];
    const lanes = groupIntoLanes(items, "owner", {});
    expect(lanes[0]?.name).toBe("user-1");
  });

  it("orders lanes alphabetically by resolved name", () => {
    const items = [
      item({ item_id: "a", owner_id: "u2" }),
      item({ item_id: "b", owner_id: "u1" }),
    ];
    const lanes = groupIntoLanes(items, "owner", {
      ownerNames: new Map([
        ["u1", "Alex"],
        ["u2", "Zoe"],
      ]),
    });
    expect(lanes.map((l) => l.name)).toEqual(["Alex", "Zoe"]);
  });
});

describe("groupIntoLanes — goal mode", () => {
  it("groups by goal_id and names the lane from the goal's own row when present", () => {
    const items = [
      item({
        item_id: "goal-1",
        item_type: "goal",
        goal_id: "goal-1",
        title: "London move",
      }),
      item({
        item_id: "t1",
        item_type: "task",
        goal_id: "goal-1",
        title: "Book flights",
      }),
    ];
    const lanes = groupIntoLanes(items, "goal", {});
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.laneId).toBe("goal-1");
    expect(lanes[0]?.name).toBe("London move");
    expect(lanes[0]?.items).toHaveLength(2);
  });

  it("falls back to goalTitles when the goal's own row isn't in the item set", () => {
    const items = [
      item({ item_id: "t1", item_type: "task", goal_id: "goal-2" }),
    ];
    const lanes = groupIntoLanes(items, "goal", {
      goalTitles: new Map([["goal-2", "Buy a house"]]),
    });
    expect(lanes[0]?.name).toBe("Buy a house");
  });

  it("falls back to the raw goal_id when neither the goal row nor a title lookup is available", () => {
    const items = [
      item({ item_id: "t1", item_type: "task", goal_id: "goal-3" }),
    ];
    const lanes = groupIntoLanes(items, "goal", {});
    expect(lanes[0]?.name).toBe("goal-3");
  });

  it("orders lanes by the goal row's own start date when present", () => {
    const items = [
      item({
        item_id: "goal-later",
        item_type: "goal",
        goal_id: "goal-later",
        starts_on: "2026-06-01",
      }),
      item({
        item_id: "goal-earlier",
        item_type: "goal",
        goal_id: "goal-earlier",
        starts_on: "2026-01-01",
      }),
    ];
    const lanes = groupIntoLanes(items, "goal", {});
    expect(lanes.map((l) => l.laneId)).toEqual(["goal-earlier", "goal-later"]);
  });

  it("falls back to the earliest item date when the goal's own row isn't present", () => {
    const items = [
      // No item_type: "goal" row for either goal — order must come from
      // each goal's own earliest task/milestone instead.
      item({
        item_id: "t1",
        item_type: "task",
        goal_id: "goal-later",
        starts_on: "2026-08-01",
      }),
      item({
        item_id: "t2",
        item_type: "task",
        goal_id: "goal-earlier",
        starts_on: "2026-02-01",
      }),
      item({
        item_id: "t3",
        item_type: "task",
        goal_id: "goal-earlier",
        starts_on: "2026-05-01",
      }),
    ];
    const lanes = groupIntoLanes(items, "goal", {});
    expect(lanes.map((l) => l.laneId)).toEqual(["goal-earlier", "goal-later"]);
  });

  it("falls back to goal_id ordering when a goal has no dated items at all", () => {
    const items = [
      item({
        item_id: "t1",
        item_type: "task",
        goal_id: "goal-z",
        starts_on: null,
      }),
      item({
        item_id: "t2",
        item_type: "task",
        goal_id: "goal-a",
        starts_on: null,
      }),
    ];
    const lanes = groupIntoLanes(items, "goal", {});
    expect(lanes.map((l) => l.laneId)).toEqual(["goal-a", "goal-z"]);
  });
});
