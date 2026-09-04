import type { Database } from "@/types/database";

export type SomedayItemRow =
  Database["public"]["Tables"]["someday_items"]["Row"];

export type DreamKind = Database["public"]["Enums"]["dream_kind"];

export const DREAM_KIND_OPTIONS: DreamKind[] = [
  "place",
  "object",
  "experience",
  "other",
];

export const DREAM_KIND_LABELS: Record<DreamKind, string> = {
  place: "Place",
  object: "Object",
  experience: "Experience",
  other: "Other",
};

/**
 * The four states a dream's own timeline columns collapse into, for
 * filtering and for the grid's own marker (P8.2 brief). Not a stored
 * column — a pure read of `archived_at`/`achieved_at`/`promoted_at`,
 * same "derive, don't duplicate state" instinct `dependency-actions.ts`'s
 * own comment already establishes for critical-path float. Priority
 * order matters where a row could satisfy more than one: `archived_at`
 * wins outright (0031's `achieved_xor_archived` constraint already
 * guarantees it's never *also* achieved, so this is only ever resolving
 * archived-vs-promoted); otherwise `achieved_at` wins over `promoted_at`
 * -- a place that was promoted into a trip and *then* actually visited
 * is more truthfully "achieved" than merely "promoted," per the P8.0
 * brief's own "achieving means you have it" framing.
 */
export type DreamState = "dreaming" | "promoted" | "achieved" | "archived";

export function dreamState(item: SomedayItemRow): DreamState {
  if (item.archived_at) return "archived";
  if (item.achieved_at) return "achieved";
  if (item.promoted_at) return "promoted";
  return "dreaming";
}

export type SomedayFilters = {
  kind: DreamKind | "all";
  lifeAreaId: string | "all";
  countryCode: string | "all";
  /** Raw minor units, no currency conversion -- same documented simplification `sortSomedayItems`'s own "price" sort already accepts (see its comment): a precise cross-currency range isn't this app's FX-rate-stamped ledger path, just a rough personal filter. `null` means unbounded on that side. */
  priceMin: number | null;
  priceMax: number | null;
  /**
   * `"all"` here means "every state except archived" -- not literally
   * every row -- which is what makes "default hides archived" (P8.2
   * brief, verbatim) expressible as this filter's own default value
   * rather than a second, separate flag layered on top of it. Picking
   * "Archived" explicitly is the only way to see archived dreams; there
   * is no option meaning "truly everything, archived included," because
   * nothing in the brief asks the grid to ever show both at once.
   */
  state: "all" | DreamState;
};

export const DEFAULT_SOMEDAY_FILTERS: SomedayFilters = {
  kind: "all",
  lifeAreaId: "all",
  countryCode: "all",
  priceMin: null,
  priceMax: null,
  state: "all",
};

export function filterSomedayItems(
  items: SomedayItemRow[],
  filters: SomedayFilters,
): SomedayItemRow[] {
  return items.filter((item) => {
    if (filters.kind !== "all" && item.kind !== filters.kind) {
      return false;
    }
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
    if (filters.priceMin != null) {
      if (item.rough_cost_minor == null || item.rough_cost_minor < filters.priceMin) {
        return false;
      }
    }
    if (filters.priceMax != null) {
      if (item.rough_cost_minor == null || item.rough_cost_minor > filters.priceMax) {
        return false;
      }
    }
    const state = dreamState(item);
    if (filters.state === "all") {
      if (state === "archived") return false;
    } else if (state !== filters.state) {
      return false;
    }
    return true;
  });
}

export type SomedaySortKey = "newest" | "price" | "longest_held";

/**
 * Each key has one fixed direction rather than a separate asc/desc
 * toggle, per the P6.1 brief's short filter/sort list (P8.2 narrowed the
 * options to exactly these three, dropping the earlier alphabetical
 * sort) — the natural reading for each: newest dreams first,
 * cheapest-to-most-expensive (an unset cost sorts after every priced
 * item, not before — "unknown" isn't "free"), and oldest-first for
 * "longest-held" (how long you've been dreaming about it, not how long
 * ago it was updated). Cost is compared as raw minor units without
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
    case "newest":
      return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "longest_held":
      return sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case "price":
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
 * 11. Pure so `dreams/actions.ts`'s milestone check is unit-testable
 * without a database round trip.
 */
export function isSomedayMilestone(newTotal: number): boolean {
  return newTotal > 0 && newTotal % 10 === 0;
}

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

/** "two" for 2, "twenty" for 20 -- falls back to digits past that (a dream wanted for 21+ years is a real but rare case; digits there read fine, "twenty-one" and beyond isn't worth a full number-to-words implementation for). */
function numberWord(n: number): string {
  return n >= 0 && n < NUMBER_WORDS.length ? (NUMBER_WORDS[n] ?? String(n)) : String(n);
}

/**
 * "The detail view of an achieved dream shows... the interval between
 * them stated: 'wanted for two years, three months'. That interval is
 * the single most affecting thing this feature produces, and it costs
 * one date subtraction" (P8.4 brief, verbatim). Word numbers, not
 * digits -- a deliberate register shift from every other date-ish
 * string in this codebase (`dates.ts`'s own `magnitudeText` is
 * digit-based, "3 weeks", because it's a UI label; this is a sentence
 * meant to be read, not scanned).
 *
 * Calendar-accurate (years/months, not a flat 30-day-month division the
 * way `magnitudeText` approximates) -- from `createdAt` to `achievedAt`,
 * both timestamps, using UTC calendar fields throughout since only the
 * *difference* between two instants matters here, never which local day
 * either one fell on (unlike bare `date` values elsewhere in this app,
 * per CLAUDE.md rule 4 -- these are timestamptz, and a timezone
 * conversion would only ever change both sides' clock time, never the
 * gap between them).
 */
export function describeWantedDuration(
  createdAt: string,
  achievedAt: string,
): string {
  const from = new Date(createdAt);
  const to = new Date(achievedAt);

  let years = to.getUTCFullYear() - from.getUTCFullYear();
  let months = to.getUTCMonth() - from.getUTCMonth();
  if (to.getUTCDate() < from.getUTCDate()) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  years = Math.max(0, years);
  months = Math.max(0, months);

  if (years === 0 && months === 0) {
    return "wanted for less than a month";
  }

  const parts: string[] = [];
  if (years > 0) {
    parts.push(`${numberWord(years)} year${years === 1 ? "" : "s"}`);
  }
  if (months > 0) {
    parts.push(`${numberWord(months)} month${months === 1 ? "" : "s"}`);
  }
  return `wanted for ${parts.join(", ")}`;
}
