import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateRange,
  fromGoalOffset,
  relativeDays,
  toGoalOffset,
} from "./dates";

const BRISBANE = "Australia/Brisbane"; // UTC+10, no DST
const LONDON = "Europe/London"; // UTC+0 in January

describe("formatDate — bare dates are never shifted by timezone", () => {
  it("shows the same calendar day for a Brisbane user and a London user", () => {
    expect(formatDate("2026-03-14", BRISBANE)).toBe(
      formatDate("2026-03-14", LONDON),
    );
    expect(formatDate("2026-03-14", BRISBANE)).toBe("Mar 14, 2026");
  });
});

describe("formatDate — timestamptz IS converted, and can land on a different day", () => {
  // 23:30 UTC, mid-January (outside BST, so London is a clean UTC+0).
  const instant = "2026-01-14T23:30:00Z";

  it("shows a different calendar day in Brisbane (UTC+10) than in London (UTC+0)", () => {
    const inBrisbane = formatDate(instant, BRISBANE);
    const inLondon = formatDate(instant, LONDON);

    expect(inBrisbane).toBe("Jan 15, 2026");
    expect(inLondon).toBe("Jan 14, 2026");
    expect(inBrisbane).not.toBe(inLondon);
  });
});

describe("formatDateRange", () => {
  it("collapses a same-month range", () => {
    expect(formatDateRange("2026-03-14", "2026-03-20", BRISBANE)).toContain(
      "Mar 14",
    );
  });

  it("is timezone-stable for bare dates", () => {
    expect(formatDateRange("2026-03-14", "2026-03-20", BRISBANE)).toBe(
      formatDateRange("2026-03-14", "2026-03-20", LONDON),
    );
  });
});

describe("toGoalOffset / fromGoalOffset", () => {
  it("round-trips", () => {
    const goalStart = "2026-01-01";
    expect(toGoalOffset("2026-03-15", goalStart)).toBe(73);
    expect(fromGoalOffset(73, goalStart)).toBe("2026-03-15");
  });

  it("handles a zero offset", () => {
    expect(toGoalOffset("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("handles a negative offset (before the goal start)", () => {
    expect(toGoalOffset("2025-12-25", "2026-01-01")).toBe(-7);
    expect(fromGoalOffset(-7, "2026-01-01")).toBe("2025-12-25");
  });
});

describe("relativeDays", () => {
  const now = new Date("2026-03-14T12:00:00Z");

  it("today", () => {
    expect(relativeDays("2026-03-14", BRISBANE, now)).toBe("today");
  });

  it("future", () => {
    expect(relativeDays("2026-03-26", BRISBANE, now)).toBe("in 12 days");
    expect(relativeDays("2026-03-15", BRISBANE, now)).toBe("in 1 day");
  });

  it("past", () => {
    expect(relativeDays("2026-03-11", BRISBANE, now)).toBe("3 days ago");
    expect(relativeDays("2026-03-13", BRISBANE, now)).toBe("1 day ago");
  });

  it("uses the viewer's timezone to decide what 'today' is", () => {
    // 23:30 UTC on Jan 14 is already Jan 15 in Brisbane but still Jan 14 in London.
    const lateUtc = new Date("2026-01-14T23:30:00Z");
    expect(relativeDays("2026-01-15", BRISBANE, lateUtc)).toBe("today");
    expect(relativeDays("2026-01-15", LONDON, lateUtc)).toBe("in 1 day");
  });
});
