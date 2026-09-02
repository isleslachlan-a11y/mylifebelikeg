import { describe, expect, it } from "vitest";

import {
  distinctCountryCodes,
  filterSomedayItems,
  isSomedayMilestone,
  sortSomedayItems,
  type SomedayItemRow,
} from "./someday";

function item(overrides: Partial<SomedayItemRow> = {}): SomedayItemRow {
  return {
    id: overrides.id ?? "item-1",
    user_id: "user-1",
    title: "Patagonia",
    notes: null,
    life_area_id: null,
    rough_cost_minor: null,
    currency: null,
    place_name: null,
    latitude: null,
    longitude: null,
    mapbox_place_id: null,
    country_code: null,
    unsplash_photo_id: null,
    unsplash_thumb_url: null,
    unsplash_full_url: null,
    unsplash_author_name: null,
    unsplash_author_url: null,
    promoted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("filterSomedayItems", () => {
  const items = [
    item({ id: "a", life_area_id: "travel", country_code: "JP" }),
    item({ id: "b", life_area_id: "travel", country_code: "FR" }),
    item({
      id: "c",
      life_area_id: "food",
      country_code: "JP",
      promoted_at: "2026-02-01T00:00:00Z",
    }),
  ];

  it("returns everything under the default all/all/all filter", () => {
    expect(
      filterSomedayItems(items, {
        lifeAreaId: "all",
        countryCode: "all",
        promoted: "all",
      }),
    ).toHaveLength(3);
  });

  it("filters by life area", () => {
    const result = filterSomedayItems(items, {
      lifeAreaId: "travel",
      countryCode: "all",
      promoted: "all",
    });
    expect(result.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("filters by country, case-insensitively against the stored code", () => {
    const result = filterSomedayItems(items, {
      lifeAreaId: "all",
      countryCode: "JP",
      promoted: "all",
    });
    expect(result.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("filters to promoted-only and not-promoted-only", () => {
    expect(
      filterSomedayItems(items, {
        lifeAreaId: "all",
        countryCode: "all",
        promoted: "promoted",
      }).map((i) => i.id),
    ).toEqual(["c"]);
    expect(
      filterSomedayItems(items, {
        lifeAreaId: "all",
        countryCode: "all",
        promoted: "not_promoted",
      }).map((i) => i.id),
    ).toEqual(["a", "b"]);
  });

  it("combines filters (AND, not OR)", () => {
    const result = filterSomedayItems(items, {
      lifeAreaId: "travel",
      countryCode: "JP",
      promoted: "all",
    });
    expect(result.map((i) => i.id)).toEqual(["a"]);
  });
});

describe("sortSomedayItems", () => {
  it("sorts by date_added, newest first", () => {
    const items = [
      item({ id: "old", created_at: "2026-01-01T00:00:00Z" }),
      item({ id: "new", created_at: "2026-06-01T00:00:00Z" }),
      item({ id: "mid", created_at: "2026-03-01T00:00:00Z" }),
    ];
    expect(sortSomedayItems(items, "date_added").map((i) => i.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("sorts by title, alphabetically", () => {
    const items = [
      item({ id: "z", title: "Zanzibar" }),
      item({ id: "a", title: "Antarctica" }),
    ];
    expect(sortSomedayItems(items, "title").map((i) => i.id)).toEqual([
      "a",
      "z",
    ]);
  });

  it("sorts by cost ascending, with unpriced items sorted last", () => {
    const items = [
      item({ id: "expensive", rough_cost_minor: 900000, currency: "AUD" }),
      item({ id: "unpriced", rough_cost_minor: null }),
      item({ id: "cheap", rough_cost_minor: 5000, currency: "AUD" }),
    ];
    expect(sortSomedayItems(items, "cost").map((i) => i.id)).toEqual([
      "cheap",
      "expensive",
      "unpriced",
    ]);
  });

  it("does not mutate the input array", () => {
    const items = [
      item({ id: "b", title: "B" }),
      item({ id: "a", title: "A" }),
    ];
    const original = [...items];
    sortSomedayItems(items, "title");
    expect(items).toEqual(original);
  });
});

describe("distinctCountryCodes", () => {
  it("returns sorted, deduped, uppercased codes, skipping nulls", () => {
    const items = [
      item({ country_code: "fr" }),
      item({ country_code: "JP" }),
      item({ country_code: "jp" }),
      item({ country_code: null }),
    ];
    expect(distinctCountryCodes(items)).toEqual(["FR", "JP"]);
  });

  it("returns [] for no items", () => {
    expect(distinctCountryCodes([])).toEqual([]);
  });
});

describe("isSomedayMilestone", () => {
  it("is true on every multiple of ten", () => {
    expect(isSomedayMilestone(10)).toBe(true);
    expect(isSomedayMilestone(20)).toBe(true);
  });

  it("is false everywhere else, including zero", () => {
    expect(isSomedayMilestone(9)).toBe(false);
    expect(isSomedayMilestone(11)).toBe(false);
    expect(isSomedayMilestone(0)).toBe(false);
  });
});
