import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOMEDAY_FILTERS,
  describeWantedDuration,
  distinctCountryCodes,
  dreamState,
  filterSomedayItems,
  isSomedayMilestone,
  sortSomedayItems,
  type SomedayFilters,
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
    kind: "place",
    image_source: null,
    storage_path: null,
    achieved_at: null,
    achieved_note: null,
    achieved_storage_path: null,
    last_surfaced_at: null,
    snoozed_until: null,
    archived_at: null,
    // P8.3 additions.
    cost_base_currency: null,
    cost_base_minor: null,
    cost_fx_rate_applied: null,
    promoted_goal_id: null,
    goal_promoted_at: null,
    ...overrides,
  };
}

function filters(overrides: Partial<SomedayFilters> = {}): SomedayFilters {
  return { ...DEFAULT_SOMEDAY_FILTERS, ...overrides };
}

describe("dreamState", () => {
  it("is dreaming with none of the three timeline columns set", () => {
    expect(dreamState(item())).toBe("dreaming");
  });

  it("is promoted when only promoted_at is set", () => {
    expect(dreamState(item({ promoted_at: "2026-02-01T00:00:00Z" }))).toBe(
      "promoted",
    );
  });

  it("is achieved when only achieved_at is set", () => {
    expect(dreamState(item({ achieved_at: "2026-02-01T00:00:00Z" }))).toBe(
      "achieved",
    );
  });

  it("is archived when only archived_at is set", () => {
    expect(dreamState(item({ archived_at: "2026-02-01T00:00:00Z" }))).toBe(
      "archived",
    );
  });

  it("prefers achieved over promoted when both are set", () => {
    expect(
      dreamState(
        item({
          promoted_at: "2026-02-01T00:00:00Z",
          achieved_at: "2026-03-01T00:00:00Z",
        }),
      ),
    ).toBe("achieved");
  });

  it("prefers archived over everything else", () => {
    expect(
      dreamState(
        item({
          promoted_at: "2026-02-01T00:00:00Z",
          archived_at: "2026-03-01T00:00:00Z",
        }),
      ),
    ).toBe("archived");
  });
});

describe("filterSomedayItems", () => {
  const items = [
    item({ id: "a", kind: "place", life_area_id: "travel", country_code: "JP" }),
    item({ id: "b", kind: "place", life_area_id: "travel", country_code: "FR" }),
    item({
      id: "c",
      kind: "object",
      life_area_id: "food",
      country_code: "JP",
      promoted_at: "2026-02-01T00:00:00Z",
      rough_cost_minor: 5000,
      currency: "AUD",
    }),
    item({
      id: "d",
      kind: "experience",
      archived_at: "2026-02-01T00:00:00Z",
      rough_cost_minor: 900000,
      currency: "AUD",
    }),
  ];

  it("returns everything except archived under the default filters", () => {
    expect(filterSomedayItems(items, DEFAULT_SOMEDAY_FILTERS).map((i) => i.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("filters by kind", () => {
    expect(
      filterSomedayItems(items, filters({ kind: "place" })).map((i) => i.id),
    ).toEqual(["a", "b"]);
  });

  it("filters by life area", () => {
    expect(
      filterSomedayItems(items, filters({ lifeAreaId: "travel" })).map((i) => i.id),
    ).toEqual(["a", "b"]);
  });

  it("filters by country, case-insensitively against the stored code", () => {
    expect(
      filterSomedayItems(items, filters({ countryCode: "JP" })).map((i) => i.id),
    ).toEqual(["a", "c"]);
  });

  it("filters by price range in raw minor units, excluding unpriced items", () => {
    expect(
      filterSomedayItems(items, filters({ priceMin: 1000, priceMax: 10000 })).map(
        (i) => i.id,
      ),
    ).toEqual(["c"]);
  });

  it("filters to a specific state", () => {
    expect(
      filterSomedayItems(items, filters({ state: "promoted" })).map((i) => i.id),
    ).toEqual(["c"]);
    expect(
      filterSomedayItems(items, filters({ state: "archived" })).map((i) => i.id),
    ).toEqual(["d"]);
    expect(
      filterSomedayItems(items, filters({ state: "dreaming" })).map((i) => i.id),
    ).toEqual(["a", "b"]);
  });

  it("combines filters (AND, not OR)", () => {
    expect(
      filterSomedayItems(items, filters({ lifeAreaId: "travel", countryCode: "JP" })).map(
        (i) => i.id,
      ),
    ).toEqual(["a"]);
  });
});

describe("sortSomedayItems", () => {
  it("sorts by newest first", () => {
    const items = [
      item({ id: "old", created_at: "2026-01-01T00:00:00Z" }),
      item({ id: "new", created_at: "2026-06-01T00:00:00Z" }),
      item({ id: "mid", created_at: "2026-03-01T00:00:00Z" }),
    ];
    expect(sortSomedayItems(items, "newest").map((i) => i.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("sorts by longest_held, oldest first", () => {
    const items = [
      item({ id: "old", created_at: "2026-01-01T00:00:00Z" }),
      item({ id: "new", created_at: "2026-06-01T00:00:00Z" }),
      item({ id: "mid", created_at: "2026-03-01T00:00:00Z" }),
    ];
    expect(sortSomedayItems(items, "longest_held").map((i) => i.id)).toEqual([
      "old",
      "mid",
      "new",
    ]);
  });

  it("sorts by price ascending, with unpriced items sorted last", () => {
    const items = [
      item({ id: "expensive", rough_cost_minor: 900000, currency: "AUD" }),
      item({ id: "unpriced", rough_cost_minor: null }),
      item({ id: "cheap", rough_cost_minor: 5000, currency: "AUD" }),
    ];
    expect(sortSomedayItems(items, "price").map((i) => i.id)).toEqual([
      "cheap",
      "expensive",
      "unpriced",
    ]);
  });

  it("does not mutate the input array", () => {
    const items = [
      item({ id: "b", created_at: "2026-02-01T00:00:00Z" }),
      item({ id: "a", created_at: "2026-01-01T00:00:00Z" }),
    ];
    const original = [...items];
    sortSomedayItems(items, "newest");
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

describe("describeWantedDuration", () => {
  it("matches the brief's own example exactly", () => {
    expect(
      describeWantedDuration("2024-01-15T00:00:00Z", "2026-04-20T00:00:00Z"),
    ).toBe("wanted for two years, three months");
  });

  it("uses word numbers, not digits", () => {
    expect(
      describeWantedDuration("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
    ).not.toMatch(/[0-9]/);
  });

  it("says 'less than a month' for a near-immediate achieve", () => {
    expect(
      describeWantedDuration("2026-01-01T00:00:00Z", "2026-01-20T00:00:00Z"),
    ).toBe("wanted for less than a month");
  });

  it("uses singular 'month' and 'year' for exactly one", () => {
    expect(
      describeWantedDuration("2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"),
    ).toBe("wanted for one month");
    expect(
      describeWantedDuration("2025-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
    ).toBe("wanted for one year");
  });

  it("omits months when the interval is whole years", () => {
    expect(
      describeWantedDuration("2023-06-01T00:00:00Z", "2026-06-01T00:00:00Z"),
    ).toBe("wanted for three years");
  });

  it("doesn't round up when the day-of-month hasn't been reached yet", () => {
    // 2024-01-20 -> 2026-04-15 is 2 years, 2 months and change -- the
    // 15th hasn't reached the 20th yet in the final month, so it should
    // NOT count as a full 3rd month.
    expect(
      describeWantedDuration("2024-01-20T00:00:00Z", "2026-04-15T00:00:00Z"),
    ).toBe("wanted for two years, two months");
  });

  it("falls back to digits past twenty years", () => {
    expect(
      describeWantedDuration("2000-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
    ).toBe("wanted for 26 years");
  });
});
