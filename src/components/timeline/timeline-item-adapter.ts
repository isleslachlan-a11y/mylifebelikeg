import type { TimelineItem } from "@/hooks/use-timeline-items";
import type { LaneableItem } from "@/lib/timeline/lanes";
import type { StackableItem } from "@/lib/timeline/stacking";

/**
 * A `v_timeline_items` row with its required fields narrowed to non-null.
 * Every column on `TimelineItem` is typed `T | null` — Postgres reports
 * *every* view column nullable regardless of the underlying tables' own
 * constraints — even though, by construction of the view (0011's
 * migration), `item_id`/`item_type`/`goal_id`/`owner_id`/`title`/
 * `sort_order`/`starts_on`/`ends_on` are never actually null for a row
 * that P3.1's windowed query would return in the first place (a null
 * `starts_on`/`ends_on` fails that query's own range predicate). This
 * type is the boundary where that gap gets resolved once, so
 * `lanes.ts`/`stacking.ts` — both intentionally decoupled from the
 * generated DB type — never have to deal with it.
 */
export type DisplayTimelineItem = LaneableItem & {
  starts_on: string;
  ends_on: string;
  /** Needed by `assignSubRows` (P3.2) — not part of `LaneableItem` itself, which has no stacking concerns. */
  sort_order: number;
  /** Needed by `classifyItemStatus` (P3.4) — same reasoning as `sort_order`. */
  is_complete: boolean;
  /**
   * P5.1: only ever `true` for a task on the critical path — `null` on
   * every goal/milestone row (0022's migration; CPM only sets
   * `is_critical` on `tasks`) coerces to `false` here rather than being
   * treated as a missing/required field, since it's simply inapplicable
   * to those item types, not malformed data.
   */
  is_critical: boolean;
  /**
   * P6.5: each item's *own* status — goal state / milestone open-or-
   * completed / task status / trip stop booking state (0025's fixed
   * `v_timeline_items.status`; `goal_status` is the separate, uniform
   * column the *filter* uses — see `use-timeline-items.ts`). Only
   * trip-stop rendering reads this today (`bookingStateFillClass`), but
   * it's carried through for every item type rather than narrowed to
   * trip_stop alone, since it's genuinely each row's own status now,
   * not a trip-stop-specific concept.
   */
  status: string | null;
  /**
   * P6.5: "bars spanning arrival to departure, or points for zero-night
   * stops" — `nights = 0` from the view, already computed the same way
   * `duration_days = 0`/milestones-are-always-points are for the other
   * branches. Only the trip-stop render branch actually checks this
   * (tasks/goals keep their existing always-a-bar/never-a-point
   * behaviour unchanged — not something P6.5 asked to touch); carried
   * for every item type for the same reason `status` is.
   */
  is_point: boolean;
};

/**
 * Narrows a raw `v_timeline_items` row, dropping it (returning `null`)
 * if a field this component tree actually depends on is missing. In
 * practice this should be everything P3.1 returns — the guard exists so
 * a malformed row degrades to "not shown" instead of crashing the lane
 * view.
 */
export function toDisplayItem(row: TimelineItem): DisplayTimelineItem | null {
  if (
    !row.item_id ||
    !row.goal_id ||
    !row.owner_id ||
    !row.title ||
    !row.starts_on ||
    !row.ends_on ||
    row.sort_order == null ||
    row.is_complete == null ||
    (row.item_type !== "goal" &&
      row.item_type !== "milestone" &&
      row.item_type !== "task" &&
      row.item_type !== "trip_stop")
  ) {
    return null;
  }

  return {
    item_id: row.item_id,
    item_type: row.item_type,
    goal_id: row.goal_id,
    owner_id: row.owner_id,
    life_area_id: row.life_area_id,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    sort_order: row.sort_order,
    is_complete: row.is_complete,
    is_critical: row.is_critical === true,
    status: row.status,
    is_point: row.is_point === true,
    title: row.title,
  };
}

/** `Date`-ifies a `DisplayTimelineItem` for `assignSubRows` — the only place this boundary is crossed (see scale.ts's module doc on the Date/bare-date-string split). */
export function toStackableItem(item: DisplayTimelineItem): StackableItem {
  return {
    item_id: item.item_id,
    item_type: item.item_type,
    starts_on: new Date(item.starts_on),
    ends_on: new Date(item.ends_on),
    sort_order: item.sort_order,
    title: item.title,
  };
}
