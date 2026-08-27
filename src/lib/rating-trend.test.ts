import { describe, expect, it } from "vitest";

import { buildRatingTrend, describeDivergence } from "./rating-trend";

describe("buildRatingTrend", () => {
  const names = { u1: "You", u2: "Sophia" };

  it("builds one series per participant, sorted oldest first, plus the shared period axis", () => {
    const points = [
      { userId: "u1", periodStart: "2026-01-12", score: 4 },
      { userId: "u1", periodStart: "2026-01-05", score: 3 },
      { userId: "u2", periodStart: "2026-01-05", score: 5 },
    ];
    const { periods, series } = buildRatingTrend(points, names);
    expect(periods).toEqual(["2026-01-05", "2026-01-12"]);

    const u1 = series.find((s) => s.userId === "u1")!;
    expect(u1.points.map((p) => p.periodStart)).toEqual([
      "2026-01-05",
      "2026-01-12",
    ]);
    expect(u1.name).toBe("You");

    const u2 = series.find((s) => s.userId === "u2")!;
    expect(u2.points).toEqual([{ periodStart: "2026-01-05", score: 5 }]);
  });

  it("keeps only the most recent maxPeriods distinct calendar periods, shared across participants", () => {
    const points = Array.from({ length: 15 }, (_, i) => ({
      userId: "u1",
      periodStart: `2026-01-${String(i + 1).padStart(2, "0")}`,
      score: 3,
    }));
    const { periods, series } = buildRatingTrend(points, names, 12);
    expect(periods).toHaveLength(12);
    expect(periods[0]).toBe("2026-01-04");
    expect(periods[11]).toBe("2026-01-15");
    expect(series[0]!.points).toHaveLength(12);
  });

  it("omits a participant entirely when none of their ratings fall in the window", () => {
    const points = [
      { userId: "u1", periodStart: "2026-01-01", score: 4 },
      { userId: "u2", periodStart: "2025-01-01", score: 5 },
    ];
    // maxPeriods=1 keeps only 2026-01-01, which u2 never rated.
    const { series } = buildRatingTrend(points, names, 1);
    expect(series.map((s) => s.userId)).toEqual(["u1"]);
  });

  it("falls back to a placeholder name for an unrecognised user id", () => {
    const { series } = buildRatingTrend(
      [{ userId: "ghost", periodStart: "2026-01-01", score: 3 }],
      names,
    );
    expect(series[0]!.name).toBe("Someone");
  });
});

describe("describeDivergence", () => {
  it("matches the brief's example verbatim", () => {
    expect(
      describeDivergence([
        { name: "You", score: 5, isYou: true },
        { name: "Sophia", score: 2, isYou: false },
      ]),
    ).toBe("You rated this 5, Sophia rated it 2.");
  });

  it("generalises to more than two raters without editorialising order", () => {
    expect(
      describeDivergence([
        { name: "Sophia", score: 2, isYou: false },
        { name: "Priya", score: 4, isYou: false },
        { name: "You", score: 5, isYou: true },
      ]),
    ).toBe("Sophia rated it 2, Priya rated it 4, You rated this 5.");
  });
});
