import { describe, expect, it } from "vitest";

import {
  dateToBareDate,
  describeTimeRemaining,
  formatDate,
  formatDateRange,
  formatTimeRemaining,
  fromGoalOffset,
  isOverdue,
  isRelativeTimePrimary,
  todayInZone,
  toGoalOffset,
} from "./dates";

const BRISBANE = "Australia/Brisbane"; // UTC+10, no DST
const LONDON = "Europe/London"; // UTC+0 in January

describe("dateToBareDate", () => {
  it("reads a Date back as its UTC calendar day", () => {
    expect(dateToBareDate(new Date("2026-03-14T00:00:00.000Z"))).toBe(
      "2026-03-14",
    );
  });

  it("does not shift for a time near the UTC day boundary", () => {
    expect(dateToBareDate(new Date("2026-03-14T23:59:00.000Z"))).toBe(
      "2026-03-14",
    );
  });

  it("round-trips with bareDateToUtcMs via new Date(bareDate)", () => {
    // A date-only ISO string parses as UTC midnight (scale.ts's module
    // doc), so this is the same round-trip real callers do.
    expect(dateToBareDate(new Date("2026-06-15"))).toBe("2026-06-15");
  });
});

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

describe("todayInZone", () => {
  it("uses the viewer's timezone to decide what 'today' is", () => {
    // 23:30 UTC on Jan 14 is already Jan 15 in Brisbane but still Jan 14 in London.
    const lateUtc = new Date("2026-01-14T23:30:00Z");
    expect(todayInZone(BRISBANE, lateUtc)).toBe("2026-01-15");
    expect(todayInZone(LONDON, lateUtc)).toBe("2026-01-14");
  });
});

describe("isOverdue", () => {
  const today = "2026-03-14";

  it("is false for today and future dates", () => {
    expect(isOverdue("2026-03-14", today)).toBe(false);
    expect(isOverdue("2026-03-15", today)).toBe(false);
  });

  it("is true for past dates", () => {
    expect(isOverdue("2026-03-13", today)).toBe(true);
    expect(isOverdue("2026-01-01", today)).toBe(true);
  });

  it("knows nothing about completion — that's the caller's job", () => {
    // Pure date comparison: a completed item due yesterday is still,
    // definitionally, an overdue *date*. Callers combine this with their
    // own completed_at check to decide what that means for display.
    expect(isOverdue("2026-03-13", today)).toBe(true);
  });
});

describe("formatTimeRemaining", () => {
  const today = "2026-03-14";

  it("today and tomorrow", () => {
    expect(formatTimeRemaining("2026-03-14", today)).toBe("today");
    expect(formatTimeRemaining("2026-03-15", today)).toBe("tomorrow");
  });

  it("yesterday", () => {
    expect(formatTimeRemaining("2026-03-13", today)).toBe("yesterday");
  });

  it("the acceptance example: a task due in 5 days", () => {
    expect(formatTimeRemaining("2026-03-19", today)).toBe("in 5 days");
  });

  it("day bucket ago", () => {
    expect(formatTimeRemaining("2026-03-09", today)).toBe("5 days ago");
  });

  it("day/week boundary: 6 days is still days, 7 is a week", () => {
    expect(formatTimeRemaining("2026-03-20", today)).toBe("in 6 days");
    expect(formatTimeRemaining("2026-03-21", today)).toBe("in 1 week");
  });

  it("weeks, future and overdue", () => {
    expect(formatTimeRemaining("2026-04-04", today)).toBe("in 3 weeks"); // +21
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, -21), today)).toBe(
      "3 weeks overdue",
    );
  });

  it("week/month boundary: 29 days is weeks, 30 is a month", () => {
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, 29), today)).toBe(
      "in 4 weeks",
    );
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, 30), today)).toBe(
      "in 1 month",
    );
  });

  it("months, future and overdue", () => {
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, 120), today)).toBe(
      "in 4 months",
    );
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, -120), today)).toBe(
      "4 months overdue",
    );
  });

  it("month/year boundary: never says '12 months' — rolls over to 1 year first", () => {
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, 364), today)).toBe(
      "in 1 year",
    );
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, 365), today)).toBe(
      "in 1 year",
    );
  });

  it("the acceptance example: a goal two years out", () => {
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, 730), today)).toBe(
      "in 2 years",
    );
  });

  it("required boundary set: 0, 1, 89, 90, 91 days, and negatives", () => {
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, 0), today)).toBe(
      "today",
    );
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, 1), today)).toBe(
      "tomorrow",
    );
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, 89), today)).toBe(
      "in 3 months",
    );
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, 90), today)).toBe(
      "in 3 months",
    );
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, 91), today)).toBe(
      "in 3 months",
    );
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, -1), today)).toBe(
      "yesterday",
    );
    expect(formatTimeRemaining(fromGoalOffsetHelper(today, -90), today)).toBe(
      "3 months overdue",
    );
  });
});

describe("isRelativeTimePrimary", () => {
  const today = "2026-03-14";

  it("required boundary set: 89 and 90 are primary, 91 is not", () => {
    expect(isRelativeTimePrimary(fromGoalOffsetHelper(today, 89), today)).toBe(
      true,
    );
    expect(isRelativeTimePrimary(fromGoalOffsetHelper(today, 90), today)).toBe(
      true,
    );
    expect(isRelativeTimePrimary(fromGoalOffsetHelper(today, 91), today)).toBe(
      false,
    );
  });

  it("0 and 1 are primary", () => {
    expect(isRelativeTimePrimary(today, today)).toBe(true);
    expect(isRelativeTimePrimary(fromGoalOffsetHelper(today, 1), today)).toBe(
      true,
    );
  });

  it("any negative (overdue) is primary, regardless of magnitude", () => {
    expect(isRelativeTimePrimary(fromGoalOffsetHelper(today, -1), today)).toBe(
      true,
    );
    expect(
      isRelativeTimePrimary(fromGoalOffsetHelper(today, -1000), today),
    ).toBe(true);
  });
});

describe("describeTimeRemaining", () => {
  const today = "2026-03-14";

  it("within 90 days (inclusive): relative is primary", () => {
    expect(
      describeTimeRemaining(fromGoalOffsetHelper(today, 90), today).primary,
    ).toBe("in 3 months");
  });

  it("beyond 90 days: absolute (month + year) is primary", () => {
    const result = describeTimeRemaining(
      fromGoalOffsetHelper(today, 91),
      today,
    );
    expect(result.primary).not.toBe("in 3 months");
    expect(result.secondary).toBe("in 3 months");
  });

  it("the acceptance example: a goal two years out reads as a month and year", () => {
    const result = describeTimeRemaining(
      fromGoalOffsetHelper(today, 730),
      today,
    );
    expect(result.primary).toMatch(/^[A-Z][a-z]+ \d{4}$/); // e.g. "March 2028"
    expect(result.secondary).toBe("in 2 years");
  });

  it("overdue is always relative-primary, regardless of distance", () => {
    expect(
      describeTimeRemaining(fromGoalOffsetHelper(today, -5), today).primary,
    ).toBe("5 days ago");
    expect(
      describeTimeRemaining(fromGoalOffsetHelper(today, -730), today).primary,
    ).toBe("2 years overdue");
  });

  it("today (0) and tomorrow (1) are within the relative-primary band", () => {
    expect(describeTimeRemaining(today, today).primary).toBe("today");
    expect(
      describeTimeRemaining(fromGoalOffsetHelper(today, 1), today).primary,
    ).toBe("tomorrow");
  });
});

/** Local test helper: the bare date `days` after `base` — a thin wrapper over fromGoalOffset, just for readability in these tables. */
function fromGoalOffsetHelper(base: string, days: number): string {
  return fromGoalOffset(days, base);
}
