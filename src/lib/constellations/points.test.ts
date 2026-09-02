import { describe, expect, it } from "vitest";

import { buildConstellationPoints } from "./points";

const task = (
  overrides: Partial<Parameters<typeof buildConstellationPoints>[1][number]>,
) => ({
  id: "t1",
  title: "Task",
  status: "done",
  completed_at: null,
  computed_end: null,
  computed_start: null,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const milestone = (
  overrides: Partial<Parameters<typeof buildConstellationPoints>[2][number]>,
) => ({
  id: "m1",
  title: "Milestone",
  completed_at: null,
  due_date: "2026-01-01",
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("buildConstellationPoints", () => {
  it("a completed (lit) goal only includes items with a real completed_at", () => {
    const points = buildConstellationPoints(
      true,
      [
        task({ id: "done", completed_at: "2026-02-01T00:00:00Z" }),
        task({ id: "unfinished", completed_at: null }),
      ],
      [milestone({ id: "hit", completed_at: "2026-01-15T00:00:00Z" })],
    );
    expect(points.map((p) => p.id).sort()).toEqual(["done", "hit"]);
  });

  it("milestones are brighter than tasks", () => {
    const points = buildConstellationPoints(
      true,
      [task({ id: "t", completed_at: "2026-01-01T00:00:00Z" })],
      [milestone({ id: "m", completed_at: "2026-01-01T00:00:00Z" })],
    );
    expect(points.find((p) => p.id === "t")!.brightness).toBe("normal");
    expect(points.find((p) => p.id === "m")!.brightness).toBe("bright");
  });

  it("a lit goal with nothing completed yields no points at all — never falls back", () => {
    const points = buildConstellationPoints(
      true,
      [task({ id: "t", completed_at: null, computed_end: "2026-01-01" })],
      [],
    );
    expect(points).toEqual([]);
  });

  it("an abandoned goal with some completions uses only those, same as lit", () => {
    const points = buildConstellationPoints(
      false,
      [
        task({ id: "done", completed_at: "2026-02-01T00:00:00Z" }),
        task({ id: "open", completed_at: null }),
      ],
      [],
    );
    expect(points.map((p) => p.id)).toEqual(["done"]);
  });

  it("an abandoned goal with nothing completed falls back to non-cancelled tasks/milestones", () => {
    const points = buildConstellationPoints(
      false,
      [
        task({
          id: "open",
          completed_at: null,
          computed_end: "2026-03-01",
          status: "not_started",
        }),
        task({ id: "cancelled", completed_at: null, status: "cancelled" }),
      ],
      [milestone({ id: "due", completed_at: null, due_date: "2026-02-15" })],
    );
    const ids = points.map((p) => p.id).sort();
    expect(ids).toEqual(["due", "open"]);
    expect(points.find((p) => p.id === "open")!.date).toBe("2026-03-01");
  });

  it("fallback prefers computed_end, then computed_start, then created_at for a task", () => {
    const onlyStart = buildConstellationPoints(
      false,
      [
        task({
          id: "a",
          computed_end: null,
          computed_start: "2026-01-10",
          created_at: "2026-01-01T00:00:00Z",
        }),
      ],
      [],
    );
    expect(onlyStart[0]!.date).toBe("2026-01-10");

    const onlyCreated = buildConstellationPoints(
      false,
      [
        task({
          id: "b",
          computed_end: null,
          computed_start: null,
          created_at: "2026-01-05T00:00:00Z",
        }),
      ],
      [],
    );
    expect(onlyCreated[0]!.date).toBe("2026-01-05T00:00:00Z");
  });

  it("returns nothing for an abandoned goal with no tasks or milestones at all", () => {
    expect(buildConstellationPoints(false, [], [])).toEqual([]);
  });
});
