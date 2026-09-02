import { describe, expect, it } from "vitest";

import { buildOverviewPlaces, countOverviewPlaces } from "./map-overview";

function dream(
  overrides: Partial<Parameters<typeof buildOverviewPlaces>[0][number]> = {},
) {
  return {
    id: "dream-1",
    title: "Patagonia",
    place_name: null,
    latitude: -50.9423,
    longitude: -73.4068,
    unsplash_thumb_url: null,
    ...overrides,
  };
}

function stop(
  overrides: Partial<Parameters<typeof buildOverviewPlaces>[1][number]> = {},
) {
  return {
    id: "stop-1",
    name: "Tokyo",
    place_name: null,
    latitude: 35.6762,
    longitude: 139.6503,
    unsplash_thumb_url: null,
    booking_state: "booked" as const,
    ...overrides,
  };
}

describe("buildOverviewPlaces", () => {
  it("maps a someday item to a dream place", () => {
    const places = buildOverviewPlaces([dream()], []);
    expect(places).toEqual([
      {
        id: "dream:dream-1",
        kind: "dream",
        title: "Patagonia",
        placeName: null,
        latitude: -50.9423,
        longitude: -73.4068,
        thumbUrl: null,
      },
    ]);
  });

  it("maps a non-done stop to a planned place", () => {
    const places = buildOverviewPlaces([], [stop({ booking_state: "idea" })]);
    expect(places[0]!.kind).toBe("planned");
  });

  it("maps a done stop to a visited place", () => {
    const places = buildOverviewPlaces([], [stop({ booking_state: "done" })]);
    expect(places[0]!.kind).toBe("visited");
  });

  it("drops cancelled stops entirely", () => {
    const places = buildOverviewPlaces(
      [],
      [stop({ booking_state: "cancelled" })],
    );
    expect(places).toEqual([]);
  });

  it("filters out items with no coordinates, defensively", () => {
    const places = buildOverviewPlaces(
      [dream({ id: "no-coords", latitude: null, longitude: null })],
      [stop({ id: "no-coords-2", latitude: null, longitude: null })],
    );
    expect(places).toEqual([]);
  });

  it("combines dreams and stops in one list", () => {
    const places = buildOverviewPlaces(
      [dream()],
      [
        stop({ booking_state: "booked" }),
        stop({ id: "stop-2", booking_state: "done" }),
      ],
    );
    expect(places).toHaveLength(3);
    expect(places.map((p) => p.kind).sort()).toEqual([
      "dream",
      "planned",
      "visited",
    ]);
  });
});

describe("countOverviewPlaces", () => {
  it("counts each kind, defaulting missing kinds to zero", () => {
    const places = buildOverviewPlaces([dream()], []);
    expect(countOverviewPlaces(places)).toEqual({
      dream: 1,
      planned: 0,
      visited: 0,
    });
  });

  it("counts a mixed set correctly", () => {
    const places = buildOverviewPlaces(
      [dream(), dream({ id: "dream-2" })],
      [stop({ booking_state: "done" })],
    );
    expect(countOverviewPlaces(places)).toEqual({
      dream: 2,
      planned: 0,
      visited: 1,
    });
  });
});
