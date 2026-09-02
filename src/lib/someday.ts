import type { Database } from "@/types/database";

export type SomedayItemRow =
  Database["public"]["Tables"]["someday_items"]["Row"];

export type SomedayFilters = {
  lifeAreaId: string | "all";
  countryCode: string | "all";
  promoted: "all" | "promoted" | "not_promoted";
};

export const DEFAULT_SOMEDAY_FILTERS: SomedayFilters = {
  lifeAreaId: "all",
  countryCode: "all",
  promoted: "all",
};

export function filterSomedayItems(
  items: SomedayItemRow[],
  filters: SomedayFilters,
): SomedayItemRow[] {
  return items.filter((item) => {
    if (
      filters.lifeAreaId !== "all" &&
      item.life_area_id !== filters.lifeAreaId
    ) {
      return false;
    }
    if (
      filters.countryCode !== "all" &&
      (item.country_code ?? "").trim().toUpperCase() !== filters.countryCode
    ) {
      return false;
    }
    if (filters.promoted === "promoted" && !item.promoted_at) return false;
    if (filters.promoted === "not_promoted" && item.promoted_at) return false;
    return true;
  });
}

export type SomedaySortKey = "date_added" | "cost" | "title";

/**
 * Each key has one fixed direction rather than a separate asc/desc
 * toggle, per the P6.1 brief's short filter/sort list — the natural
 * reading for each: newest dreams first, cheapest-to-most-expensive (an
 * unset cost sorts after every priced item, not before — "unknown" isn't
 * "free"), and alphabetical. Cost is compared as raw minor units without
 * currency conversion — a real simplification when items are priced in
 * different currencies (this app never invents an FX conversion outside
 * money.ts's own explicit, rate-stamped paths), acceptable for a rough
 * personal ordering, not presented as a precise ranking.
 */
export function sortSomedayItems(
  items: SomedayItemRow[],
  sortKey: SomedaySortKey,
): SomedayItemRow[] {
  const sorted = [...items];
  switch (sortKey) {
    case "date_added":
      return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "title":
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case "cost":
      return sorted.sort((a, b) => {
        if (a.rough_cost_minor == null && b.rough_cost_minor == null) {
          return a.title.localeCompare(b.title);
        }
        if (a.rough_cost_minor == null) return 1;
        if (b.rough_cost_minor == null) return -1;
        return a.rough_cost_minor - b.rough_cost_minor;
      });
  }
}

/** Distinct, sorted, uppercased country codes actually present — feeds the country filter's own option list, so it never offers a country with zero items. */
export function distinctCountryCodes(items: SomedayItemRow[]): string[] {
  const codes = new Set<string>();
  for (const item of items) {
    const code = item.country_code?.trim().toUpperCase();
    if (code) codes.add(code);
  }
  return [...codes].sort();
}

let regionNames: Intl.DisplayNames | null | undefined;

/** "Japan" for "JP"; falls back to the bare code if Intl.DisplayNames can't resolve it (or isn't available) rather than throwing — a cosmetic nicety, never load-bearing. */
export function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Every tenth item, ever — "Fluffy delivers a milestone message at every
 * tenth item added" (P6.1 brief). `newTotal` is the count *after* the
 * item that was just inserted, so this fires on 10, 20, 30…, not on 9 or
 * 11. Pure so `someday/actions.ts`'s milestone check is unit-testable
 * without a database round trip.
 */
export function isSomedayMilestone(newTotal: number): boolean {
  return newTotal > 0 && newTotal % 10 === 0;
}
