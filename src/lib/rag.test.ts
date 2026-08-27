import { describe, expect, it } from "vitest";

import {
  describeBudgetDimension,
  describeMomentumDimension,
  describeScheduleDimension,
  describeVariance,
  hasScheduleMomentumMismatch,
  isGracePeriod,
  isUndefinedGoal,
} from "./rag";

describe("describeVariance", () => {
  it("reads within ±5pp as on track", () => {
    expect(describeVariance(0)).toBe("on track");
    expect(describeVariance(5)).toBe("on track");
    expect(describeVariance(-5)).toBe("on track");
  });

  it("reads negative beyond the band as behind", () => {
    expect(describeVariance(-22)).toBe("22% behind");
  });

  it("reads positive beyond the band as ahead", () => {
    expect(describeVariance(9)).toBe("9% ahead");
  });
});

describe("describeScheduleDimension", () => {
  it("matches the brief's example verbatim", () => {
    const rag = {
      schedule_variance_pp: -22,
      inputs: { elapsed_pct: 61 },
    };
    expect(describeScheduleDimension(rag, { done: 4, total: 12 })).toBe(
      "22% behind — 4 of 12 tasks done, 61% elapsed",
    );
  });

  it("mentions forced-red overdue counts when present", () => {
    const rag = {
      schedule_variance_pp: -30,
      inputs: { elapsed_pct: 50, overdue_milestones: 1 },
    };
    expect(describeScheduleDimension(rag, { done: 1, total: 4 })).toBe(
      "30% behind — 1 of 4 tasks done, 50% elapsed, 1 overdue milestone",
    );
  });

  it("falls back to a plain no-data message when variance is null", () => {
    expect(
      describeScheduleDimension({ schedule_variance_pp: null, inputs: {} }, null),
    ).toBe("No schedule data yet.");
  });
});

describe("describeBudgetDimension", () => {
  it("reads save_toward as percent funded", () => {
    expect(
      describeBudgetDimension({ budget_variance_pp: 40, inputs: {} }, "save_toward"),
    ).toBe("40% funded to date");
  });

  it("reads spend_against over pace with elapsed context", () => {
    expect(
      describeBudgetDimension(
        { budget_variance_pp: 22, inputs: { elapsed_pct: 61 } },
        "spend_against",
      ),
    ).toBe("22% over pace — 61% elapsed");
  });

  it("reads spend_against within the band as on pace", () => {
    expect(
      describeBudgetDimension(
        { budget_variance_pp: 3, inputs: {} },
        "spend_against",
      ),
    ).toBe("on pace");
  });
});

describe("describeMomentumDimension", () => {
  it("reports the average once there's a signal", () => {
    expect(
      describeMomentumDimension({ momentum_mean: 4.2, inputs: {} }),
    ).toBe("4.2 average of the last 3 ratings");
  });

  it("reports partial history distinctly from zero ratings", () => {
    expect(
      describeMomentumDimension({
        momentum_mean: null,
        inputs: { rating_count: 2 },
      }),
    ).toBe("2 ratings so far — need 3 for a signal");
    expect(
      describeMomentumDimension({ momentum_mean: null, inputs: {} }),
    ).toBe("No ratings yet.");
  });
});

describe("isGracePeriod / isUndefinedGoal", () => {
  it("read the reason key, nothing else", () => {
    expect(isGracePeriod({ inputs: { reason: "grace_period" } })).toBe(true);
    expect(isGracePeriod({ inputs: { reason: "undefined_goal" } })).toBe(false);
    expect(isUndefinedGoal({ inputs: { reason: "undefined_goal" } })).toBe(true);
    expect(isUndefinedGoal({ inputs: {} })).toBe(false);
  });
});

describe("hasScheduleMomentumMismatch", () => {
  it("is true only for schedule green + momentum red", () => {
    expect(
      hasScheduleMomentumMismatch({
        schedule_status: "green",
        momentum_status: "red",
      }),
    ).toBe(true);
    expect(
      hasScheduleMomentumMismatch({
        schedule_status: "green",
        momentum_status: "amber",
      }),
    ).toBe(false);
    expect(
      hasScheduleMomentumMismatch({
        schedule_status: "red",
        momentum_status: "red",
      }),
    ).toBe(false);
  });
});
