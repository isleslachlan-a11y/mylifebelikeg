import { describe, expect, it } from "vitest";

import {
  bookingStateLabel,
  describeLegEndpoint,
  nextBookingState,
  travelModeLabel,
} from "./trips";

describe("nextBookingState", () => {
  it("advances through the primary progression", () => {
    expect(nextBookingState("idea")).toBe("researching");
    expect(nextBookingState("researching")).toBe("booked");
    expect(nextBookingState("booked")).toBe("done");
  });

  it("has no next state after done", () => {
    expect(nextBookingState("done")).toBeNull();
  });

  it("has no next state for cancelled — a side-exit, not on the ladder", () => {
    expect(nextBookingState("cancelled")).toBeNull();
  });
});

describe("bookingStateLabel", () => {
  it("labels every state", () => {
    expect(bookingStateLabel("idea")).toBe("Idea");
    expect(bookingStateLabel("cancelled")).toBe("Cancelled");
  });
});

describe("travelModeLabel", () => {
  it("labels every mode", () => {
    expect(travelModeLabel("flight")).toBe("Flight");
    expect(travelModeLabel("cycle")).toBe("Cycle");
  });
});

describe("describeLegEndpoint", () => {
  const stops = [
    { id: "a", name: "Tokyo" },
    { id: "b", name: "Kyoto" },
  ];

  it("resolves a stop id to its name", () => {
    expect(describeLegEndpoint("a", stops, "Home")).toBe("Tokyo");
  });

  it("falls back to the trip's origin_name for a null endpoint", () => {
    expect(describeLegEndpoint(null, stops, "Home")).toBe("Home");
  });

  it("falls back to a plain 'Origin' when origin_name is also unset", () => {
    expect(describeLegEndpoint(null, stops, null)).toBe("Origin");
    expect(describeLegEndpoint(null, stops, "  ")).toBe("Origin");
  });

  it("falls back to 'Unknown stop' for a dangling id (shouldn't happen, but not a crash)", () => {
    expect(describeLegEndpoint("nonexistent", stops, "Home")).toBe(
      "Unknown stop",
    );
  });
});
