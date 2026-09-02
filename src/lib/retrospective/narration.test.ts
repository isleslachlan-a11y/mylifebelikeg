import { describe, expect, it } from "vitest";

import {
  describeAbandonedListDerek,
  describeYearSummaryFluffy,
} from "./narration";

describe("describeYearSummaryFluffy", () => {
  it("summarises completed/abandoned/carried-forward counts", () => {
    expect(
      describeYearSummaryFluffy({
        year: 2026,
        completedCount: 4,
        abandonedCount: 2,
        carriedForwardCount: 3,
      }),
    ).toBe(
      "2026, in short: 4 goals finished, 2 let go, 3 still open. Every one of them real, whatever happened to it.",
    );
  });

  it("omits the abandoned/carried-forward clauses when they're zero", () => {
    expect(
      describeYearSummaryFluffy({
        year: 2026,
        completedCount: 1,
        abandonedCount: 0,
        carriedForwardCount: 0,
      }),
    ).toBe(
      "2026, in short: 1 goal finished. Every one of them real, whatever happened to it.",
    );
  });

  it("has a distinct message for a year with nothing in it at all", () => {
    expect(
      describeYearSummaryFluffy({
        year: 2030,
        completedCount: 0,
        abandonedCount: 0,
        carriedForwardCount: 0,
      }),
    ).toBe(
      "2030 doesn't have anything in it yet — this page fills in as the year does.",
    );
  });
});

describe("describeAbandonedListDerek", () => {
  it("names every abandoned goal, states the count, and nothing else", () => {
    const text = describeAbandonedListDerek([
      { title: "Learn pottery" },
      { title: "Start a podcast" },
    ]);
    expect(text).toBe(
      "2 goals abandoned this year: Learn pottery, Start a podcast.",
    );
  });

  it("uses singular grammar for exactly one", () => {
    expect(describeAbandonedListDerek([{ title: "Learn pottery" }])).toBe(
      "1 goal abandoned this year: Learn pottery.",
    );
  });

  it("has a plain, non-judgemental message for zero abandonments", () => {
    expect(describeAbandonedListDerek([])).toBe(
      "Nothing abandoned this year. Not every year needs one.",
    );
  });
});
