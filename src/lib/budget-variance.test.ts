import { describe, expect, it } from "vitest";

import { computeBudgetVariance, formatBudgetVariance } from "./budget-variance";

// Well past the 14-day grace period from every `now` used below, unlike
// schedule-variance.test.ts's OLD_ENOUGH, which is only far enough
// before that file's single fixed NOW — several tests here use their own
// `now` values close to startDate, so this needs to be safely early
// relative to all of them, not just one.
const OLD_ENOUGH = "2020-01-01T00:00:00Z";
const NOW = new Date("2026-03-01T12:00:00Z");

describe("computeBudgetVariance", () => {
  it("matches the acceptance example: £3,000 of £7,500 needed by now — 40%", () => {
    // 10-day goal, 5 days elapsed -> 50% required-to-date of a
    // £15,000 (1500000 minor) target = £7,500 (750000 minor) required.
    // £3,000 (300000 minor) contributed against that = 40%.
    const result = computeBudgetVariance({
      funding: "save_toward",
      targetAmountMinor: 1500000,
      contributedMinor: 300000,
      spentMinor: null,
      createdAt: OLD_ENOUGH,
      startDate: "2026-01-01",
      targetDate: "2026-01-11",
      now: new Date("2026-01-06T00:00:00Z"), // 5 of 10 days elapsed -> 50%
    });
    expect(result).toEqual({
      kind: "save_toward",
      requiredToDateMinor: 750000,
      contributedMinor: 300000,
      percent: 40,
    });
  });

  it("save_toward: under what's required reads below 100%", () => {
    const result = computeBudgetVariance({
      funding: "save_toward",
      targetAmountMinor: 1000000,
      contributedMinor: 300000, // £3,000
      spentMinor: null,
      createdAt: OLD_ENOUGH,
      startDate: "2026-01-01",
      targetDate: "2026-01-11", // 10 days
      now: new Date("2026-01-05T00:00:00Z"), // 4/10 = 40% elapsed -> required 400000
    });
    expect(result).toEqual({
      kind: "save_toward",
      requiredToDateMinor: 400000,
      contributedMinor: 300000,
      percent: 75, // 300000 / 400000
    });
  });

  it("spend_against: matches the acceptance example — 22% over pace", () => {
    const result = computeBudgetVariance({
      funding: "spend_against",
      targetAmountMinor: 1000000,
      contributedMinor: null,
      spentMinor: 620000, // 62% spent
      createdAt: OLD_ENOUGH,
      startDate: "2026-01-01",
      targetDate: "2026-01-11",
      now: new Date("2026-01-05T00:00:00Z"), // 40% elapsed
    });
    expect(result).toEqual({ kind: "spend_against", variancePp: 22 });
  });

  it("spend_against: under elapsed reads negative (under pace)", () => {
    const result = computeBudgetVariance({
      funding: "spend_against",
      targetAmountMinor: 1000000,
      contributedMinor: null,
      spentMinor: 100000, // 10% spent
      createdAt: OLD_ENOUGH,
      startDate: "2026-01-01",
      targetDate: "2026-01-11",
      now: new Date("2026-01-05T00:00:00Z"), // 40% elapsed
    });
    expect(result).toEqual({ kind: "spend_against", variancePp: -30 });
  });

  it("is null with no target amount", () => {
    expect(
      computeBudgetVariance({
        funding: "save_toward",
        targetAmountMinor: null,
        contributedMinor: 100,
        spentMinor: null,
        createdAt: OLD_ENOUGH,
        startDate: "2026-01-01",
        targetDate: "2026-06-01",
        now: NOW,
      }),
    ).toBeNull();
  });

  it("is null with a zero or negative target amount", () => {
    expect(
      computeBudgetVariance({
        funding: "save_toward",
        targetAmountMinor: 0,
        contributedMinor: 100,
        spentMinor: null,
        createdAt: OLD_ENOUGH,
        startDate: "2026-01-01",
        targetDate: "2026-06-01",
        now: NOW,
      }),
    ).toBeNull();
  });

  it("is null before the 14-day grace period", () => {
    expect(
      computeBudgetVariance({
        funding: "save_toward",
        targetAmountMinor: 100000,
        contributedMinor: 0,
        spentMinor: null,
        createdAt: "2026-02-25T00:00:00Z", // 4 days before `now`
        startDate: "2026-01-01",
        targetDate: "2026-06-01",
        now: NOW,
      }),
    ).toBeNull();
  });

  it("is null with no start or target date", () => {
    expect(
      computeBudgetVariance({
        funding: "save_toward",
        targetAmountMinor: 100000,
        contributedMinor: 0,
        spentMinor: null,
        createdAt: OLD_ENOUGH,
        startDate: null,
        targetDate: "2026-06-01",
        now: NOW,
      }),
    ).toBeNull();
  });

  it("save_toward: null when nothing is required yet (goal hasn't started)", () => {
    const result = computeBudgetVariance({
      funding: "save_toward",
      targetAmountMinor: 100000,
      contributedMinor: 0,
      spentMinor: null,
      createdAt: OLD_ENOUGH,
      startDate: "2026-06-01", // in the future relative to now
      targetDate: "2026-07-01",
      now: NOW,
    });
    expect(result).toBeNull();
  });

  it("save_toward: missing contributedMinor treated as zero", () => {
    const result = computeBudgetVariance({
      funding: "save_toward",
      targetAmountMinor: 1000000,
      contributedMinor: null,
      spentMinor: null,
      createdAt: OLD_ENOUGH,
      startDate: "2026-01-01",
      targetDate: "2026-01-11",
      now: new Date("2026-01-05T00:00:00Z"),
    });
    expect(result).toEqual({
      kind: "save_toward",
      requiredToDateMinor: 400000,
      contributedMinor: 0,
      percent: 0,
    });
  });
});

describe("formatBudgetVariance", () => {
  it("formats the save_toward acceptance example exactly", () => {
    expect(
      formatBudgetVariance(
        {
          kind: "save_toward",
          requiredToDateMinor: 750000,
          contributedMinor: 300000,
          percent: 40,
        },
        "GBP",
      ),
    ).toBe("£3,000.00 of £7,500.00 needed by now — 40%");
  });

  it("formats spend_against over/under/on pace", () => {
    expect(
      formatBudgetVariance({ kind: "spend_against", variancePp: 22 }, "GBP"),
    ).toBe("22% over pace");
    expect(
      formatBudgetVariance({ kind: "spend_against", variancePp: -30 }, "GBP"),
    ).toBe("30% under pace");
    expect(
      formatBudgetVariance({ kind: "spend_against", variancePp: 3 }, "GBP"),
    ).toBe("on pace");
    expect(
      formatBudgetVariance({ kind: "spend_against", variancePp: -5 }, "GBP"),
    ).toBe("on pace");
  });

  it("rounds to the nearest whole percentage point", () => {
    expect(
      formatBudgetVariance({ kind: "spend_against", variancePp: 21.6 }, "GBP"),
    ).toBe("22% over pace");
  });
});
