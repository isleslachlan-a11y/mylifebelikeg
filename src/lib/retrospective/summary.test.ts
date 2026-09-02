import { describe, expect, it } from "vitest";

import {
  averageRatingByMonth,
  categorizeGoalsForYear,
  computeCheckinCoverage,
  enumeratePeriodStarts,
  estimateActiveGoalCountByMonth,
  estimateYearStartCohort,
  getYearRange,
  summarizeMoneyByLifeArea,
  type RetroGoalInput,
} from "./summary";

const goal = (overrides: Partial<RetroGoalInput>): RetroGoalInput => ({
  id: "g1",
  title: "Goal",
  state: "active",
  lifeAreaId: "la1",
  createdOn: "2025-01-01",
  completedOn: null,
  abandonedOn: null,
  abandonReason: null,
  ...overrides,
});

describe("getYearRange", () => {
  it("spans Jan 1 to Dec 31", () => {
    expect(getYearRange(2026)).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
    });
  });
});

describe("categorizeGoalsForYear", () => {
  const range = getYearRange(2026);

  it("buckets completed, abandoned, and carried-forward goals separately", () => {
    const goals = [
      goal({ id: "c1", completedOn: "2026-03-01" }),
      goal({
        id: "a1",
        abandonedOn: "2026-06-01",
        abandonReason: "No longer relevant",
      }),
      goal({ id: "open1", state: "active" }),
      goal({ id: "open2", state: "someday" }),
    ];
    const { completed, abandoned, carriedForward } = categorizeGoalsForYear(
      goals,
      range,
    );
    expect(completed.map((g) => g.id)).toEqual(["c1"]);
    expect(abandoned.map((g) => g.id)).toEqual(["a1"]);
    expect(carriedForward.map((g) => g.id).sort()).toEqual(["open1", "open2"]);
  });

  it("excludes a completion/abandonment from a different year", () => {
    const goals = [
      goal({
        id: "c-last-year",
        state: "completed",
        completedOn: "2025-12-31",
      }),
      goal({
        id: "a-next-year",
        state: "abandoned",
        abandonedOn: "2027-01-01",
      }),
    ];
    const { completed, abandoned, carriedForward } = categorizeGoalsForYear(
      goals,
      range,
    );
    expect(completed).toEqual([]);
    expect(abandoned).toEqual([]);
    // Neither falls into carriedForward either — completed/abandoned
    // goals aren't "active"/"someday" any more.
    expect(carriedForward).toEqual([]);
  });

  it("excludes a goal created after the year ends from carriedForward", () => {
    const goals = [goal({ id: "future", createdOn: "2027-01-01" })];
    expect(categorizeGoalsForYear(goals, range).carriedForward).toEqual([]);
  });
});

describe("estimateYearStartCohort", () => {
  const range = getYearRange(2026);

  it("only includes goals created before the year started", () => {
    const goals = [
      goal({ id: "old", createdOn: "2025-06-01" }),
      goal({ id: "new", createdOn: "2026-01-01" }),
    ];
    const cohort = estimateYearStartCohort(goals, range, "2026-12-31");
    expect(cohort.map((c) => c.goal.id)).toEqual(["old"]);
  });

  it("reports completed/abandoned when the terminal date is on or before the cutoff", () => {
    const goals = [
      goal({ id: "done", createdOn: "2025-01-01", completedOn: "2026-05-01" }),
      goal({ id: "gone", createdOn: "2025-01-01", abandonedOn: "2026-05-01" }),
    ];
    const cohort = estimateYearStartCohort(goals, range, "2026-12-31");
    expect(cohort.find((c) => c.goal.id === "done")!.outcome).toBe("completed");
    expect(cohort.find((c) => c.goal.id === "gone")!.outcome).toBe("abandoned");
  });

  it("reports still_active when the completion happens after the cutoff", () => {
    const goals = [
      goal({
        id: "not-yet",
        createdOn: "2025-01-01",
        completedOn: "2027-01-15",
        state: "completed",
      }),
    ];
    const cohort = estimateYearStartCohort(goals, range, "2026-12-31");
    expect(cohort[0]!.outcome).toBe("still_active");
  });

  it("reads archived/someday from current state when neither terminal date applies", () => {
    const goals = [
      goal({ id: "shelved", createdOn: "2025-01-01", state: "archived" }),
      goal({ id: "deferred", createdOn: "2025-01-01", state: "someday" }),
      goal({ id: "ongoing", createdOn: "2025-01-01", state: "active" }),
    ];
    const cohort = estimateYearStartCohort(goals, range, "2026-12-31");
    expect(cohort.find((c) => c.goal.id === "shelved")!.outcome).toBe(
      "archived",
    );
    expect(cohort.find((c) => c.goal.id === "deferred")!.outcome).toBe(
      "moved_to_someday",
    );
    expect(cohort.find((c) => c.goal.id === "ongoing")!.outcome).toBe(
      "still_active",
    );
  });

  it("caps the cutoff at today for a year still in progress", () => {
    const goals = [
      goal({
        id: "completed-after-today",
        createdOn: "2025-01-01",
        completedOn: "2026-08-01",
      }),
    ];
    // "Today" is mid-year — the completion hasn't happened yet as far as
    // this retrospective (generated mid-2026) can know.
    const cohort = estimateYearStartCohort(goals, range, "2026-06-01");
    expect(cohort[0]!.outcome).toBe("still_active");
  });
});

describe("summarizeMoneyByLifeArea", () => {
  const range = getYearRange(2026);
  const lifeAreaByGoal = new Map([
    ["g-travel", "la-travel"],
    ["g-home", "la-home"],
  ]);

  it("sums contributions as saved and expenses as spent, grouped by life area", () => {
    const totals = summarizeMoneyByLifeArea(
      [
        {
          entryType: "contribution",
          baseAmountMinor: 10000,
          goalId: "g-travel",
          occurredOn: "2026-03-01",
        },
        {
          entryType: "contribution",
          baseAmountMinor: 5000,
          goalId: "g-travel",
          occurredOn: "2026-06-01",
        },
        {
          entryType: "expense",
          baseAmountMinor: 2000,
          goalId: "g-home",
          occurredOn: "2026-04-01",
        },
      ],
      range,
      lifeAreaByGoal,
    );
    const travel = totals.find((t) => t.lifeAreaId === "la-travel")!;
    const home = totals.find((t) => t.lifeAreaId === "la-home")!;
    expect(travel.savedMinor).toBe(15000);
    expect(travel.spentMinor).toBe(0);
    expect(home.spentMinor).toBe(2000);
  });

  it("groups goal-less entries and unmapped-life-area entries under null", () => {
    const totals = summarizeMoneyByLifeArea(
      [
        {
          entryType: "contribution",
          baseAmountMinor: 100,
          goalId: null,
          occurredOn: "2026-01-01",
        },
        {
          entryType: "expense",
          baseAmountMinor: 50,
          goalId: "unknown-goal",
          occurredOn: "2026-01-01",
        },
      ],
      range,
      lifeAreaByGoal,
    );
    expect(totals).toHaveLength(1);
    expect(totals[0]!.lifeAreaId).toBeNull();
    expect(totals[0]!.savedMinor).toBe(100);
    expect(totals[0]!.spentMinor).toBe(50);
  });

  it("excludes entries outside the year range", () => {
    const totals = summarizeMoneyByLifeArea(
      [
        {
          entryType: "contribution",
          baseAmountMinor: 999,
          goalId: "g-travel",
          occurredOn: "2025-12-31",
        },
        {
          entryType: "contribution",
          baseAmountMinor: 999,
          goalId: "g-travel",
          occurredOn: "2027-01-01",
        },
      ],
      range,
      lifeAreaByGoal,
    );
    expect(totals).toEqual([]);
  });
});

describe("enumeratePeriodStarts", () => {
  it("enumerates every weekly period whose period_end falls in the range", () => {
    // checkInDay = 7 (Sunday). Jan 1 2026 is a Thursday.
    const periods = enumeratePeriodStarts(7, "2026-01-01", "2026-01-31");
    expect(periods).toEqual([
      "2025-12-29", // period ending Sun Jan 4 — starts in the prior year
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
    ]);
  });

  it("still returns the containing period when the range itself is a single day matching check-in day", () => {
    // Jan 4 2026 is a Sunday.
    const periods = enumeratePeriodStarts(7, "2026-01-04", "2026-01-04");
    expect(periods).toEqual(["2025-12-29"]);
  });

  it("returns nothing for a range with no period ending inside it", () => {
    expect(enumeratePeriodStarts(7, "2026-01-05", "2026-01-10")).toEqual([]);
  });
});

describe("computeCheckinCoverage", () => {
  it("counts how many of the possible periods were actually submitted", () => {
    const all = ["2026-01-05", "2026-01-12", "2026-01-19"];
    const submitted = new Set(["2026-01-05", "2026-01-19"]);
    expect(computeCheckinCoverage(all, submitted)).toEqual({
      submitted: 2,
      possible: 3,
    });
  });

  it("is 0/0 for no possible periods", () => {
    expect(computeCheckinCoverage([], new Set())).toEqual({
      submitted: 0,
      possible: 0,
    });
  });
});

describe("averageRatingByMonth", () => {
  it("returns all 12 months, averaging by the rating's period-end month", () => {
    const result = averageRatingByMonth(
      [
        { periodEnd: "2026-01-05", score: 4 },
        { periodEnd: "2026-01-12", score: 2 },
        { periodEnd: "2026-03-01", score: 5 },
      ],
      2026,
    );
    expect(result).toHaveLength(12);
    expect(result[0]).toEqual({ month: 1, average: 3 }); // (4+2)/2
    expect(result[1]).toEqual({ month: 2, average: null });
    expect(result[2]).toEqual({ month: 3, average: 5 });
  });

  it("buckets a boundary-spanning period by where it ends, not starts (matches computeCheckinCoverage's own convention)", () => {
    const result = averageRatingByMonth(
      [{ periodEnd: "2026-01-04", score: 5 }], // period_start would be 2025-12-29
      2026,
    );
    expect(result[0]!.average).toBe(5); // January, not excluded as "December"
  });

  it("ignores ratings from a different year", () => {
    const result = averageRatingByMonth(
      [{ periodEnd: "2025-01-05", score: 5 }],
      2026,
    );
    expect(result.every((m) => m.average === null)).toBe(true);
  });
});

describe("estimateActiveGoalCountByMonth", () => {
  it("counts a goal in every month from its creation until it completes/abandons", () => {
    const goals = [
      goal({
        id: "g",
        createdOn: "2026-02-15",
        completedOn: "2026-05-10",
        state: "completed",
      }),
    ];
    const result = estimateActiveGoalCountByMonth(goals, 2026, "2026-12-31");
    const byMonth = Object.fromEntries(result.map((r) => [r.month, r.count]));
    expect(byMonth[1]).toBe(0); // before creation
    expect(byMonth[2]).toBe(1); // created mid-Feb
    expect(byMonth[4]).toBe(1); // still active through April
    expect(byMonth[5]).toBe(0); // completed May 10, before month end
    expect(byMonth[6]).toBe(0);
  });

  it("excludes goals currently in someday state entirely", () => {
    const goals = [
      goal({ id: "g", createdOn: "2026-01-01", state: "someday" }),
    ];
    const result = estimateActiveGoalCountByMonth(goals, 2026, "2026-12-31");
    expect(result.every((r) => r.count === 0)).toBe(true);
  });

  it("only returns months up to today for the current year, not all 12", () => {
    const result = estimateActiveGoalCountByMonth([], 2026, "2026-06-15");
    expect(result).toHaveLength(6);
  });

  it("returns all 12 months for a fully elapsed past year", () => {
    const result = estimateActiveGoalCountByMonth([], 2026, "2027-03-01");
    expect(result).toHaveLength(12);
  });
});
