import { describe, expect, it } from "vitest";

import { ALLOWED_GOAL_TRANSITIONS, transitionLabel } from "./goal-transitions";

describe("ALLOWED_GOAL_TRANSITIONS", () => {
  it("matches the P1.3 lifecycle graph exactly", () => {
    expect(ALLOWED_GOAL_TRANSITIONS).toEqual({
      active: ["completed", "archived", "abandoned", "someday"],
      someday: ["active", "archived"],
      completed: ["active"],
      archived: ["active"],
      abandoned: ["active"],
    });
  });

  it("every end state's only way out is back to active", () => {
    for (const end of ["completed", "archived", "abandoned"] as const) {
      expect(ALLOWED_GOAL_TRANSITIONS[end]).toEqual(["active"]);
    }
  });
});

describe("transitionLabel", () => {
  it("distinguishes activating from someday vs. reopening an end state", () => {
    expect(transitionLabel("someday", "active")).toBe("Activate");
    expect(transitionLabel("completed", "active")).toBe("Reopen");
    expect(transitionLabel("archived", "active")).toBe("Reopen");
    expect(transitionLabel("abandoned", "active")).toBe("Reopen");
  });

  it("labels the three end-state transitions distinctly", () => {
    expect(transitionLabel("active", "completed")).toBe("Mark complete");
    expect(transitionLabel("active", "archived")).toBe("Archive");
    expect(transitionLabel("active", "abandoned")).toBe("Abandon");
    expect(transitionLabel("active", "someday")).toBe("Move to someday");
  });
});
