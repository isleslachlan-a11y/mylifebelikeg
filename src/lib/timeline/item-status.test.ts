import { describe, expect, it } from "vitest";

import { classifyItemStatus } from "./item-status";

const TODAY = "2026-06-15";

describe("classifyItemStatus", () => {
  it("is completed when is_complete is true, regardless of dates", () => {
    expect(
      classifyItemStatus(
        { starts_on: "2020-01-01", ends_on: "2020-01-02", is_complete: true },
        TODAY,
      ),
    ).toBe("completed");
    // Even a future item, if somehow already marked complete.
    expect(
      classifyItemStatus(
        { starts_on: "2030-01-01", ends_on: "2030-01-02", is_complete: true },
        TODAY,
      ),
    ).toBe("completed");
  });

  it("is overdue when incomplete and ends before today", () => {
    expect(
      classifyItemStatus(
        {
          starts_on: "2026-06-01",
          ends_on: "2026-06-10",
          is_complete: false,
        },
        TODAY,
      ),
    ).toBe("overdue");
  });

  it("is in_progress when incomplete, already started, and not yet overdue", () => {
    expect(
      classifyItemStatus(
        {
          starts_on: "2026-06-10",
          ends_on: "2026-06-20",
          is_complete: false,
        },
        TODAY,
      ),
    ).toBe("in_progress");
  });

  it("is in_progress when starting exactly today", () => {
    expect(
      classifyItemStatus(
        { starts_on: TODAY, ends_on: "2026-06-20", is_complete: false },
        TODAY,
      ),
    ).toBe("in_progress");
  });

  it("is in_progress (not overdue) when ending exactly today", () => {
    expect(
      classifyItemStatus(
        { starts_on: "2026-06-01", ends_on: TODAY, is_complete: false },
        TODAY,
      ),
    ).toBe("in_progress");
  });

  it("is not_started when it hasn't begun yet", () => {
    expect(
      classifyItemStatus(
        {
          starts_on: "2026-07-01",
          ends_on: "2026-07-10",
          is_complete: false,
        },
        TODAY,
      ),
    ).toBe("not_started");
  });

  it("treats a zero-duration (milestone-like) item consistently", () => {
    expect(
      classifyItemStatus(
        { starts_on: TODAY, ends_on: TODAY, is_complete: false },
        TODAY,
      ),
    ).toBe("in_progress");
    expect(
      classifyItemStatus(
        {
          starts_on: "2026-06-01",
          ends_on: "2026-06-01",
          is_complete: false,
        },
        TODAY,
      ),
    ).toBe("overdue");
    expect(
      classifyItemStatus(
        {
          starts_on: "2026-07-01",
          ends_on: "2026-07-01",
          is_complete: false,
        },
        TODAY,
      ),
    ).toBe("not_started");
  });
});
