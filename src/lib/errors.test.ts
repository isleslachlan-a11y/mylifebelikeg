import { describe, expect, it, vi } from "vitest";

import { humanizeDbError } from "./errors";

describe("humanizeDbError", () => {
  it("maps a check constraint violation", () => {
    const error = {
      message:
        'new row for relation "goals" violates check constraint "goal_dates_ordered"',
      details: "",
    };
    expect(humanizeDbError(error)).toBe(
      "Target date must be on or after the start date.",
    );
  });

  it("maps a unique constraint violation", () => {
    const error = {
      message:
        'duplicate key value violates unique constraint "profiles_handle_key"',
      details: "Key (handle)=(lachlan) already exists.",
    };
    expect(humanizeDbError(error)).toBe("That handle is already taken.");
  });

  it("maps the life-area case-insensitive unique-name violation", () => {
    const error = {
      message:
        'duplicate key value violates unique constraint "life_areas_user_name_key"',
      details: "Key (user_id, lower(name))=(...) already exists.",
    };
    expect(humanizeDbError(error)).toBe(
      "You already have a life area with that name.",
    );
  });

  it("maps a task's offset-days-before-goal-start violation", () => {
    const error = {
      message:
        'new row for relation "tasks" violates check constraint "tasks_offset_days_check"',
      details: "",
    };
    expect(humanizeDbError(error)).toBe(
      "A task can't start before the goal's start date.",
    );
  });

  it("checks details when the constraint isn't named in message", () => {
    const error = {
      message: "duplicate key value violates unique constraint",
      details: 'Key already exists, constraint "goal_participants_unique".',
    };
    expect(humanizeDbError(error)).toBe("That person is already on this goal.");
  });

  it("falls back to a generic message and logs the original for unmatched constraints", () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = {
      message: 'violates check constraint "some_future_constraint"',
      details: "",
    };
    expect(humanizeDbError(error)).toBe(
      "Something went wrong — please try again.",
    );
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("falls back for errors with no constraint name at all", () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(humanizeDbError({ message: "connection reset", details: "" })).toBe(
      "Something went wrong — please try again.",
    );
    logSpy.mockRestore();
  });
});
