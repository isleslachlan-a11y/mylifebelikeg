import { describe, expect, it } from "vitest";

import {
  computeScheduleVariance,
  formatScheduleVariance,
} from "./schedule-variance";

const OLD_ENOUGH = "2026-01-01T00:00:00Z"; // well past the 14-day grace period from `now` below
const NOW = new Date("2026-03-01T12:00:00Z");

describe("computeScheduleVariance", () => {
  it("matches the acceptance example: half-elapsed, a quarter of tasks done -> ~-25pp", () => {
    // 30-day goal, 15 days elapsed (50%). 4 one-day tasks, 1 done (25%).
    const result = computeScheduleVariance({
      createdAt: OLD_ENOUGH,
      startDate: "2026-02-14",
      targetDate: "2026-03-16",
      tasks: [
        { durationDays: 1, status: "done" },
        { durationDays: 1, status: "not_started" },
        { durationDays: 1, status: "not_started" },
        { durationDays: 1, status: "not_started" },
      ],
      now: NOW,
    });
    expect(result).toBe(-25);
  });

  it("is null before the 14-day grace period, regardless of everything else", () => {
    const result = computeScheduleVariance({
      createdAt: "2026-02-25T00:00:00Z", // 4 days before `now`
      startDate: "2026-01-01",
      targetDate: "2026-06-01",
      tasks: [{ durationDays: 1, status: "not_started" }],
      now: NOW,
    });
    expect(result).toBeNull();
  });

  it("is null with no start date", () => {
    expect(
      computeScheduleVariance({
        createdAt: OLD_ENOUGH,
        startDate: null,
        targetDate: "2026-06-01",
        tasks: [{ durationDays: 1, status: "done" }],
        now: NOW,
      }),
    ).toBeNull();
  });

  it("is null with no target date", () => {
    expect(
      computeScheduleVariance({
        createdAt: OLD_ENOUGH,
        startDate: "2026-01-01",
        targetDate: null,
        tasks: [{ durationDays: 1, status: "done" }],
        now: NOW,
      }),
    ).toBeNull();
  });

  it("is null with no tasks", () => {
    expect(
      computeScheduleVariance({
        createdAt: OLD_ENOUGH,
        startDate: "2026-01-01",
        targetDate: "2026-06-01",
        tasks: [],
        now: NOW,
      }),
    ).toBeNull();
  });

  it("is null when every task is cancelled — excluded from the total, same as no tasks", () => {
    expect(
      computeScheduleVariance({
        createdAt: OLD_ENOUGH,
        startDate: "2026-01-01",
        targetDate: "2026-06-01",
        tasks: [
          { durationDays: 3, status: "cancelled" },
          { durationDays: 2, status: "cancelled" },
        ],
        now: NOW,
      }),
    ).toBeNull();
  });

  it("weights a zero-duration task as 1 day, not 0", () => {
    // Two zero-duration tasks, one done -> 50% progress regardless of duration_days=0.
    const result = computeScheduleVariance({
      createdAt: OLD_ENOUGH,
      startDate: "2026-03-01", // today, per NOW below -> elapsed 0%
      targetDate: "2026-04-01",
      tasks: [
        { durationDays: 0, status: "done" },
        { durationDays: 0, status: "not_started" },
      ],
      now: NOW,
    });
    expect(result).toBe(50); // 50% progress - 0% elapsed
  });

  it("treats target_date <= start_date as fully elapsed (100%)", () => {
    const result = computeScheduleVariance({
      createdAt: OLD_ENOUGH,
      startDate: "2026-03-01",
      targetDate: "2026-03-01", // same day
      tasks: [{ durationDays: 1, status: "done" }], // 100% progress
      now: NOW,
    });
    expect(result).toBe(0); // 100% progress - 100% elapsed
  });

  it("clamps elapsed at 100% even when now is past the target date", () => {
    const result = computeScheduleVariance({
      createdAt: OLD_ENOUGH,
      startDate: "2026-01-01",
      targetDate: "2026-01-31",
      tasks: [{ durationDays: 1, status: "not_started" }], // 0% progress
      now: NOW, // well past the target date
    });
    expect(result).toBe(-100); // 0% progress - 100% elapsed (clamped)
  });

  it("clamps elapsed at 0% when now is before the start date", () => {
    const result = computeScheduleVariance({
      createdAt: OLD_ENOUGH,
      startDate: "2026-06-01", // in the future relative to `now`
      targetDate: "2026-07-01",
      tasks: [{ durationDays: 1, status: "not_started" }],
      now: NOW,
    });
    expect(result).toBe(0); // 0% progress - 0% elapsed (clamped)
  });
});

describe("formatScheduleVariance", () => {
  it("reads 'on track' within ±5pp inclusive", () => {
    expect(formatScheduleVariance(0)).toBe("on track");
    expect(formatScheduleVariance(5)).toBe("on track");
    expect(formatScheduleVariance(-5)).toBe("on track");
  });

  it("reads behind for negative variance beyond the band", () => {
    expect(formatScheduleVariance(-25)).toBe("25% behind schedule");
    expect(formatScheduleVariance(-6)).toBe("6% behind schedule");
  });

  it("reads ahead for positive variance beyond the band", () => {
    expect(formatScheduleVariance(12)).toBe("12% ahead");
    expect(formatScheduleVariance(6)).toBe("6% ahead");
  });

  it("rounds to the nearest whole percent for display", () => {
    expect(formatScheduleVariance(-24.6)).toBe("25% behind schedule");
  });
});
