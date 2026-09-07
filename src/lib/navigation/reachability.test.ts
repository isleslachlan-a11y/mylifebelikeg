import { describe, expect, it } from "vitest";

import { NAV_MANIFEST, getMoreEntries, getTabBarEntries } from "./manifest";
import { findAppRouterPages, findUncoveredRoutes, tapDepth } from "./reachability";

describe("navigation manifest route coverage", () => {
  it("covers every real route under src/app/(app)", () => {
    const uncovered = findUncoveredRoutes();
    expect(uncovered, `Uncovered route(s) — add a manifest entry (or an explicit, named exclusion) in src/lib/navigation/reachability.ts: ${uncovered.join(", ")}`).toEqual([]);
  });

  it("found a plausible number of real routes (the scan itself didn't silently break)", () => {
    // A floor, not an exact count -- this repo adds routes over time.
    // If this ever drops near zero, the filesystem walk itself broke
    // (wrong root dir, route-group stripping regressed), not "the app
    // shrank."
    expect(findAppRouterPages().length).toBeGreaterThan(20);
  });
});

describe("navigation manifest structure", () => {
  it("has no duplicate ids", () => {
    const ids = NAV_MANIFEST.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate hrefs", () => {
    const hrefs = NAV_MANIFEST.map((e) => e.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("has no duplicate priorities (ties make \"the four highest-priority\" ambiguous)", () => {
    const priorities = NAV_MANIFEST.map((e) => e.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it("puts exactly four entries on the tab bar", () => {
    expect(getTabBarEntries()).toHaveLength(4);
  });

  it("accounts for every entry across the tab bar and the More sheet, with no overlap", () => {
    const tabBarIds = getTabBarEntries().map((e) => e.id);
    const moreIds = getMoreEntries().map((e) => e.id);
    expect(tabBarIds.length + moreIds.length).toBe(NAV_MANIFEST.length);
    expect(tabBarIds.filter((id) => moreIds.includes(id))).toEqual([]);
  });

  it("reaches every manifest entry within three taps of the default screen", () => {
    // The load-bearing acceptance criterion, checked structurally
    // rather than assumed: see tapDepth's own header for why this is a
    // real computation over the manifest's tab-bar/More split, not a
    // hardcoded pass.
    for (const entry of NAV_MANIFEST) {
      expect(tapDepth(entry), `${entry.id} should be reachable within 3 taps`).toBeLessThanOrEqual(3);
    }
  });
});
