import { describe, expect, it } from "vitest";

import { formatCheckInPeriod } from "./format-period";

describe("formatCheckInPeriod", () => {
  it("names the actual weekday of periodEnd, not a hardcoded day", () => {
    // 2026-08-23 is a Sunday.
    expect(formatCheckInPeriod("2026-08-23")).toBe("week ending Sunday");
  });

  it("follows check_in_day to whatever weekday it is (P4.1: configurable)", () => {
    // 2026-08-26 is a Wednesday.
    expect(formatCheckInPeriod("2026-08-26")).toBe("week ending Wednesday");
  });

  it("reads the bare date as UTC, unaffected by the runtime's local timezone", () => {
    // A date-only string parsed naively (`new Date("2026-08-23")`) is
    // already UTC-midnight in JS, so this mostly guards against a future
    // refactor accidentally introducing a local-timezone parse.
    expect(formatCheckInPeriod("2026-01-01")).toBe("week ending Thursday");
  });
});
