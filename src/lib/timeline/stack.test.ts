import { describe, expect, it } from "vitest";

import { stackedRowCount, stackIntervals } from "./stack";

type Bar = { id: string; start: number; end: number };

function bar(id: string, start: number, end: number): Bar {
  return { id, start, end };
}

const getStart = (b: Bar) => b.start;
const getEnd = (b: Bar) => b.end;

describe("stackIntervals", () => {
  it("gives non-overlapping items the same row", () => {
    const result = stackIntervals(
      [bar("a", 0, 10), bar("b", 20, 30), bar("c", 40, 50)],
      getStart,
      getEnd,
    );
    expect(result.every((r) => r.row === 0)).toBe(true);
  });

  it("the acceptance example: three mutually overlapping items stack into three rows", () => {
    const result = stackIntervals(
      [bar("a", 0, 30), bar("b", 5, 35), bar("c", 10, 40)],
      getStart,
      getEnd,
    );
    const rows = result.map((r) => r.row).sort();
    expect(rows).toEqual([0, 1, 2]);
    expect(stackedRowCount(result)).toBe(3);
  });

  it("reuses a row once its item has ended", () => {
    // a: 0-10, b: 20-30 (after a ends, same row) — both fit in row 0.
    // c: 5-15 overlaps a, so it needs row 1.
    const result = stackIntervals(
      [bar("a", 0, 10), bar("b", 20, 30), bar("c", 5, 15)],
      getStart,
      getEnd,
    );
    const byId = Object.fromEntries(result.map((r) => [r.item.id, r.row]));
    expect(byId.a).toBe(0);
    expect(byId.b).toBe(0);
    expect(byId.c).toBe(1);
  });

  it("treats items within minGap of each other as overlapping", () => {
    // a ends at 10, b starts at 11 — 1px apart, less than a 5px minGap.
    const result = stackIntervals(
      [bar("a", 0, 10), bar("b", 11, 20)],
      getStart,
      getEnd,
      { minGap: 5 },
    );
    const byId = Object.fromEntries(result.map((r) => [r.item.id, r.row]));
    expect(byId.a).not.toBe(byId.b);
  });

  it("applies minWidth before deciding overlap — two zero-duration items back to back still collide", () => {
    const result = stackIntervals(
      [bar("a", 0, 0), bar("b", 2, 2)],
      getStart,
      getEnd,
      { minWidth: 8 },
    );
    const byId = Object.fromEntries(result.map((r) => [r.item.id, r.row]));
    expect(byId.a).not.toBe(byId.b);
    const aResult = result.find((r) => r.item.id === "a")!;
    expect(aResult.width).toBe(8);
  });

  it("is stable regardless of input order (sorts by start internally)", () => {
    const inOrder = stackIntervals(
      [bar("a", 0, 30), bar("b", 5, 35), bar("c", 10, 40)],
      getStart,
      getEnd,
    );
    const reversed = stackIntervals(
      [bar("c", 10, 40), bar("b", 5, 35), bar("a", 0, 30)],
      getStart,
      getEnd,
    );
    const rowsOf = (result: typeof inOrder) =>
      Object.fromEntries(result.map((r) => [r.item.id, r.row]));
    expect(rowsOf(inOrder)).toEqual(rowsOf(reversed));
  });
});

describe("stackedRowCount", () => {
  it("is 0 for an empty layout", () => {
    expect(stackedRowCount([])).toBe(0);
  });
});
