import { describe, expect, it } from "vitest";

import {
  describeDreamAffordability,
  type DreamAffordabilityRow,
} from "./dream-affordability";

function row(overrides: Partial<DreamAffordabilityRow> = {}): DreamAffordabilityRow {
  return {
    dream_id: "dream-1",
    user_id: "user-1",
    title: "A jacket",
    currency: "GBP",
    rough_cost_minor: 45000,
    monthly_capacity_minor: 10000,
    months_to_afford: 5,
    cost_base_currency: "AUD",
    cost_base_minor: 86400,
    cost_fx_rate_applied: 1.92,
    committed_monthly_minor: 0,
    spare_capacity_minor: 10000,
    realistic_months_to_afford: 5,
    competing_goal_titles: [],
    ...overrides,
  };
}

describe("describeDreamAffordability", () => {
  it("phrases the common case in plain language, matching the brief's own example", () => {
    expect(describeDreamAffordability(row({ months_to_afford: 5 }))).toBe(
      "At your current rate, that's about 5 months away.",
    );
  });

  it("handles the brief's own eleven-month example plainly, not softened", () => {
    expect(
      describeDreamAffordability(
        row({ months_to_afford: 11, realistic_months_to_afford: 11 }),
      ),
    ).toBe("At your current rate, that's about 11 months away.");
  });

  it("uses singular 'month' for exactly one", () => {
    expect(
      describeDreamAffordability(
        row({ months_to_afford: 1, realistic_months_to_afford: 1 }),
      ),
    ).toBe("At your current rate, that's about 1 month away.");
  });

  it("says so plainly when it's affordable today", () => {
    expect(
      describeDreamAffordability(row({ months_to_afford: 0, realistic_months_to_afford: 0 })),
    ).toBe("You could afford this today, if you wanted it.");
  });

  it("says so plainly when there's no capacity at all", () => {
    expect(
      describeDreamAffordability(
        row({ monthly_capacity_minor: 0, months_to_afford: null, realistic_months_to_afford: null }),
      ),
    ).toBe(
      "At your current rate, this isn't moving — there's no monthly capacity spare for it right now.",
    );
  });

  it("says so when no FX conversion is available", () => {
    expect(
      describeDreamAffordability(row({ cost_base_minor: null, cost_base_currency: null })),
    ).toBe(
      "No exchange rate on file for that currency yet — can't say how far away it is.",
    );
  });

  it("names the competing goal and gives the realistic (spare-capacity) figure when they differ", () => {
    expect(
      describeDreamAffordability(
        row({
          months_to_afford: 3,
          committed_monthly_minor: 5000,
          spare_capacity_minor: 5000,
          realistic_months_to_afford: 6,
          competing_goal_titles: ["Move to London"],
        }),
      ),
    ).toBe(
      "At your current rate, that's about 6 months away — Move to London is already using some of what would go toward this.",
    );
  });

  it("uses plural verb agreement for two or more competing goals", () => {
    expect(
      describeDreamAffordability(
        row({
          months_to_afford: 3,
          committed_monthly_minor: 8000,
          spare_capacity_minor: 2000,
          realistic_months_to_afford: 9,
          competing_goal_titles: ["Move to London", "Get Visas"],
        }),
      ),
    ).toContain("Move to London and Get Visas are already using");
  });

  it("says nothing is left over when spare capacity is exhausted", () => {
    expect(
      describeDreamAffordability(
        row({
          months_to_afford: 4,
          committed_monthly_minor: 10000,
          spare_capacity_minor: 0,
          realistic_months_to_afford: null,
          competing_goal_titles: ["Move to London"],
        }),
      ),
    ).toBe(
      "At full capacity this is about 4 months away. But Move to London already claims what you've got spare — there's nothing left over for this yet.",
    );
  });

  it("lists three or more competing goals with an Oxford comma", () => {
    expect(
      describeDreamAffordability(
        row({
          months_to_afford: 4,
          committed_monthly_minor: 10000,
          spare_capacity_minor: 0,
          realistic_months_to_afford: null,
          competing_goal_titles: ["Move to London", "Get Visas", "Paris Weekend"],
        }),
      ),
    ).toContain("Move to London, Get Visas, and Paris Weekend already claim");
  });

  it("doesn't mention competing goals when nothing is committed", () => {
    const result = describeDreamAffordability(
      row({ months_to_afford: 5, committed_monthly_minor: 0, competing_goal_titles: [] }),
    );
    expect(result).not.toContain("already");
  });
});
