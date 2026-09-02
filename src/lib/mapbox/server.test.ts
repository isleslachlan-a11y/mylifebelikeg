import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { geocodePlace, MapboxConfigError } from "./server";

function rawFeature(id: string) {
  return {
    properties: {
      mapbox_id: id,
      name: "Kyoto",
      full_address: "Kyoto, Kyoto Prefecture, Japan",
      place_formatted: "Kyoto Prefecture, Japan",
      context: { country: { country_code: "jp" } },
    },
    geometry: { coordinates: [135.7681, 35.0116] as [number, number] },
  };
}

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("MAPBOX_SECRET_TOKEN", "test-secret-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("geocodePlace", () => {
  it("returns [] for a blank query without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await geocodePlace("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a raw Mapbox feature to the trimmed shape, uppercasing the country code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ features: [rawFeature("place.123")] }));
    vi.stubGlobal("fetch", fetchMock);

    const [place] = await geocodePlace("kyoto unique query one");
    expect(place).toEqual({
      id: "place.123",
      name: "Kyoto",
      fullAddress: "Kyoto, Kyoto Prefecture, Japan",
      latitude: 35.0116,
      longitude: 135.7681,
      countryCode: "JP",
    });

    // The secret token travels as a query param, never exposed to a caller.
    const [calledUrl] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toContain("access_token=test-secret-token");
  });

  it("falls back to place_formatted when full_address is absent", async () => {
    const feature = {
      properties: {
        mapbox_id: "place.456",
        name: "Kyoto",
        place_formatted: "Kyoto Prefecture, Japan",
        context: { country: { country_code: "jp" } },
      },
      geometry: { coordinates: [135.7681, 35.0116] as [number, number] },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ features: [feature] }));
    vi.stubGlobal("fetch", fetchMock);

    const [place] = await geocodePlace("fallback unique query");
    expect(place!.fullAddress).toBe("Kyoto Prefecture, Japan");
  });

  it("returns null countryCode when Mapbox doesn't supply one", async () => {
    const feature = {
      properties: {
        mapbox_id: "place.789",
        name: "Kyoto",
        full_address: "Kyoto, Japan",
        context: {},
      },
      geometry: { coordinates: [135.7681, 35.0116] as [number, number] },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ features: [feature] }));
    vi.stubGlobal("fetch", fetchMock);

    const [place] = await geocodePlace("no country unique query");
    expect(place!.countryCode).toBeNull();
  });

  it("caches results by normalized query — a second identical search doesn't refetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ features: [rawFeature("place.cache")] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const query = "  Cache Test Query Unique  ";
    await geocodePlace(query);
    await geocodePlace(query.trim().toLowerCase());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a plain error on a non-OK response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(geocodePlace("server error unique query")).rejects.toThrow(
      /Mapbox geocoding failed/,
    );
  });

  it("throws MapboxConfigError when the secret token isn't configured", async () => {
    vi.unstubAllEnvs();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      geocodePlace("unconfigured unique query"),
    ).rejects.toBeInstanceOf(MapboxConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
