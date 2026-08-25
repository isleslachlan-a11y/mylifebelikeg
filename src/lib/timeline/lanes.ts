/**
 * Lane grouping (P3.3): splits a set of `v_timeline_items` rows into
 * lanes for one of three grouping modes. Pure, no React/DOM — same
 * convention as the rest of `timeline/`.
 *
 * Works on bare "YYYY-MM-DD" date strings, not `Date`s: grouping/ordering
 * here only ever compares whole calendar days (ISO date strings sort
 * lexicographically the same as chronologically), so there's no reason to
 * cross into `Date` until a lane's items reach `assignSubRows`/`scale.ts`
 * for actual pixel placement — that conversion happens per-lane, later,
 * closer to where pixels are actually needed.
 *
 * Deliberately doesn't decide which lanes are *visible*: a life area with
 * no items in the current window still gets a lane here (see
 * `groupByLifeArea`) — "empty lanes hidden by default, with a toggle to
 * show them" is a presentation-layer policy, not a grouping one, so the
 * component layer filters `lanes` before rendering, not this function.
 */

export type GroupingMode = "life_area" | "owner" | "goal";

export type LaneableItemType = "goal" | "milestone" | "task";

export type LaneableItem = {
  item_id: string;
  item_type: LaneableItemType;
  goal_id: string;
  owner_id: string;
  life_area_id: string | null;
  /** Bare "YYYY-MM-DD", or null — matches v_timeline_items directly. */
  starts_on: string | null;
  title: string;
};

export type LifeAreaMeta = {
  id: string;
  name: string;
  colour: string;
  sortOrder: number;
};

/**
 * Generic over the item type so a caller passing a narrower type than
 * `LaneableItem` (e.g. one with `starts_on` narrowed to non-null) gets
 * that same narrower type back in `items`, not the widened base type.
 */
export type Lane<T extends LaneableItem = LaneableItem> = {
  laneId: string;
  name: string;
  /** `null` for owner/goal lanes — only life-area lanes have an intrinsic colour. */
  colour: string | null;
  items: T[];
};

export type GroupIntoLanesOptions = {
  /**
   * Every area in this list gets a lane, in `sortOrder`, whether or not
   * it currently has items — required for `"life_area"` mode. In
   * practice this always includes the real, system-seeded "Uncategorised"
   * area (see `src/app/(app)/settings/life-areas/`) alongside a user's
   * own categories, so most goals already land in a *named* lane here,
   * not the synthetic fallback below.
   */
  lifeAreas?: LifeAreaMeta[];
  /** `ownerId -> display name`, for `"owner"` mode. Falls back to the raw id when a name isn't supplied. */
  ownerNames?: Map<string, string>;
  /**
   * `goalId -> title`, for `"goal"` mode, used when the goal's own
   * `item_type: "goal"` row isn't present in `items` (e.g. windowed out
   * of the current fetch — see P3.1's `useTimelineItems`). Falls back to
   * the raw id when neither is available.
   */
  goalTitles?: Map<string, string>;
};

const UNCATEGORISED_LANE_ID = "__uncategorised__";
const UNCATEGORISED_LABEL = "Uncategorised";

export function groupIntoLanes<T extends LaneableItem>(
  items: T[],
  mode: GroupingMode,
  opts: GroupIntoLanesOptions = {},
): Lane<T>[] {
  switch (mode) {
    case "life_area":
      return groupByLifeArea(items, opts.lifeAreas ?? []);
    case "owner":
      return groupByOwner(items, opts.ownerNames ?? new Map());
    case "goal":
      return groupByGoal(items, opts.goalTitles ?? new Map());
  }
}

function pushTo<K, T>(buckets: Map<K, T[]>, key: K, item: T) {
  const bucket = buckets.get(key) ?? [];
  bucket.push(item);
  buckets.set(key, bucket);
}

/**
 * One lane per life area, in `sortOrder`, using the area's own colour —
 * always present, even with zero items (see module doc). Any item whose
 * `life_area_id` doesn't match a known area — genuinely `null`, or an id
 * `lifeAreas` doesn't contain — falls into a synthetic "Uncategorised"
 * lane instead, appended only when it actually has items: unlike a real
 * life area, it has no stable identity to justify always showing it.
 */
function groupByLifeArea<T extends LaneableItem>(
  items: T[],
  lifeAreas: LifeAreaMeta[],
): Lane<T>[] {
  const knownIds = new Set(lifeAreas.map((area) => area.id));
  const buckets = new Map<string, T[]>();
  const fallback: T[] = [];

  for (const item of items) {
    if (item.life_area_id && knownIds.has(item.life_area_id)) {
      pushTo(buckets, item.life_area_id, item);
    } else {
      fallback.push(item);
    }
  }

  const lanes: Lane<T>[] = [...lifeAreas]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((area) => ({
      laneId: area.id,
      name: area.name,
      colour: area.colour,
      items: buckets.get(area.id) ?? [],
    }));

  if (fallback.length > 0) {
    lanes.push({
      laneId: UNCATEGORISED_LANE_ID,
      name: UNCATEGORISED_LABEL,
      colour: null,
      items: fallback,
    });
  }

  return lanes;
}

/**
 * One lane per distinct `owner_id` actually present in `items` — each
 * item already carries the right owner for this purpose (a goal/
 * milestone's row carries the *goal's* owner, a task's row carries the
 * *task's own* owner — denormalized that way in `v_timeline_items`
 * specifically so this grouping doesn't need to special-case item_type).
 * Ordered alphabetically by resolved name — the brief doesn't specify an
 * order for this mode the way it does for life-area (`sortOrder`) and
 * goal (start date), so alphabetical is the least arbitrary default.
 */
function groupByOwner<T extends LaneableItem>(
  items: T[],
  ownerNames: Map<string, string>,
): Lane<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    pushTo(buckets, item.owner_id, item);
  }

  return [...buckets.entries()]
    .map(([ownerId, ownerItems]) => ({
      laneId: ownerId,
      name: ownerNames.get(ownerId) ?? ownerId,
      colour: null,
      items: ownerItems,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One lane per distinct `goal_id`, ordered by the goal's start date.
 * Three-tier fallback, each only used when the tier above isn't
 * available: the goal's own `item_type: "goal"` row's `starts_on` (the
 * authoritative value); else the earliest `starts_on` among the goal's
 * own milestones/tasks in this item set; else the `goal_id` itself, so
 * ordering is always fully deterministic even for a goal with no dated
 * items at all in the current window. Naming follows the same two-tier
 * shape (goal row's title, else the caller-supplied `goalTitles` lookup),
 * with the id itself as the final fallback.
 */
function groupByGoal<T extends LaneableItem>(
  items: T[],
  goalTitles: Map<string, string>,
): Lane<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    pushTo(buckets, item.goal_id, item);
  }

  const entries = [...buckets.entries()].map(([goalId, goalItems]) => {
    const goalRow = goalItems.find(
      (candidate) =>
        candidate.item_type === "goal" && candidate.item_id === goalId,
    );
    const earliestItemStart = goalItems
      .map((candidate) => candidate.starts_on)
      .filter((date): date is string => date != null)
      .sort()
      .at(0);

    const lane: Lane<T> = {
      laneId: goalId,
      name: goalRow?.title ?? goalTitles.get(goalId) ?? goalId,
      colour: null,
      items: goalItems,
    };
    const sortKey = goalRow?.starts_on ?? earliestItemStart ?? goalId;
    return { lane, sortKey };
  });

  return entries
    .sort((a, b) =>
      a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0,
    )
    .map((entry) => entry.lane);
}
