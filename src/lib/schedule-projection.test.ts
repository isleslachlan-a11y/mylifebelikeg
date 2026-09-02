import { describe, expect, it } from "vitest";

import {
  describeFloatSummary,
  describeProjectedEnd,
  summarizeFloat,
} from "./schedule-projection";

const format = (d: string) =>
  new Date(`${d}T00:00:00.000Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

describe("describeProjectedEnd", () => {
  it("states the gap plainly when projected is after target (brief's own example)", () => {
    expect(describeProjectedEnd("2026-03-14", "2026-03-01", format)).toBe(
      "Projected March 14, target March 1 — 13 days over.",
    );
  });

  it("uses singular 'day' for a 1-day gap", () => {
    expect(describeProjectedEnd("2026-03-02", "2026-03-01", format)).toBe(
      "Projected March 2, target March 1 — 1 day over.",
    );
  });

  it("says 'to spare' when projected finishes before target", () => {
    expect(describeProjectedEnd("2026-02-25", "2026-03-01", format)).toBe(
      "Projected February 25, target March 1 — 4 days to spare.",
    );
  });

  it("says 'right on target' for an exact match", () => {
    expect(describeProjectedEnd("2026-03-01", "2026-03-01", format)).toBe(
      "Projected March 1, target March 1 — right on target.",
    );
  });

  it("omits the target comparison when the goal has no target date", () => {
    expect(describeProjectedEnd("2026-03-14", null, format)).toBe(
      "Projected March 14.",
    );
  });

  it("returns null when there's no projection yet (no dated tasks)", () => {
    expect(describeProjectedEnd(null, "2026-03-01", format)).toBeNull();
    expect(describeProjectedEnd(null, null, format)).toBeNull();
  });
});

describe("summarizeFloat", () => {
  it("counts slack and critical tasks separately, ignoring tasks outside the network", () => {
    const summary = summarizeFloat([
      { is_critical: true, total_float_days: 0 },
      { is_critical: true, total_float_days: 0 },
      { is_critical: false, total_float_days: 3 },
      { is_critical: false, total_float_days: null }, // no network / cancelled
    ]);
    expect(summary).toEqual({ slackCount: 1, criticalCount: 2 });
  });

  it("returns null when nothing has a dependency network at all", () => {
    expect(
      summarizeFloat([
        { is_critical: false, total_float_days: null },
        { is_critical: false, total_float_days: null },
      ]),
    ).toBeNull();
    expect(summarizeFloat([])).toBeNull();
  });
});

describe("describeFloatSummary", () => {
  it("matches the brief's own example verbatim (order: slack, then critical)", () => {
    expect(describeFloatSummary({ slackCount: 3, criticalCount: 4 })).toBe(
      "3 tasks have slack; 4 are on the critical path.",
    );
  });

  it("uses correct singular grammar for exactly one of each", () => {
    expect(describeFloatSummary({ slackCount: 1, criticalCount: 1 })).toBe(
      "1 task has slack; 1 is on the critical path.",
    );
  });

  it("handles zero of either without breaking grammar", () => {
    expect(describeFloatSummary({ slackCount: 0, criticalCount: 5 })).toBe(
      "0 tasks have slack; 5 are on the critical path.",
    );
  });
});
