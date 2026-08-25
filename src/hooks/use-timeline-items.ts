"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { dateToBareDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

export type TimelineItem =
  Database["public"]["Views"]["v_timeline_items"]["Row"];
export type TimelineItemType = "goal" | "milestone" | "task";
export type GoalState = Database["public"]["Enums"]["goal_state"];

export type TimelineItemFilters = {
  /**
   * Goal state to include, applied to every item type via `status` (see
   * the P3.1 migration's column decisions — `status` is the *parent
   * goal's* state on every row, exactly so this filter works uniformly
   * across goals/milestones/tasks). Defaults to `"active"`, matching the
   * rest of the app's default goal view. Pass `null` to include every
   * state.
   */
  goalState?: GoalState | null;
  lifeAreaId?: string;
  ownerId?: string;
  itemTypes?: TimelineItemType[];
};

export type UseTimelineItemsOptions = {
  /**
   * The currently visible window. The hook queries this plus a buffer of
   * roughly one viewport either side (PHASE-3-REQUIREMENTS.MD's R5) —
   * callers pass the tight visible range, not a pre-padded one.
   */
  windowStart: Date;
  windowEnd: Date;
  filters?: TimelineItemFilters;
  /** Delay before a window move outside the cached buffer fires a query. */
  debounceMs?: number;
};

export type UseTimelineItemsResult = {
  items: TimelineItem[];
  loading: boolean;
  error: string | null;
};

const DEFAULT_DEBOUNCE_MS = 150;

type CoveredRange = {
  startMs: number;
  endMs: number;
  /** The filters this range was fetched under — a filters change must
   * force a fetch (or cache hit) regardless of whether the window moved. */
  filtersKey: string;
};

/**
 * P3.1's windowed data layer over `v_timeline_items`. Range-windowed
 * (R5), not list-virtualised — row-recycling libraries assume uniform
 * row heights and a single scroll axis, neither of which holds here
 * (dynamic lane heights, both axes matter).
 *
 * - Queries only items intersecting the visible domain plus a ~1-viewport
 *   buffer either side (`ends_on >= from and starts_on <= to`, against
 *   `goals_range_idx`/`milestones_range_idx`/`tasks_range_idx`).
 * - Refetches only once the visible window moves outside that buffer (or
 *   the filters change), debounced so a scroll gesture settles before it
 *   fires — not once per scroll event/frame.
 * - Caches successful fetches by (filters, buffered window) so scrolling
 *   back to an already-fetched window is a cache hit, not a network call.
 *
 * No rendering here — data layer only, per the P3.1 brief. Verify with
 * `/timeline/debug-items` (dev-only), which dumps `items` as JSON and
 * logs each real network fetch to the console for counting.
 */
export function useTimelineItems({
  windowStart,
  windowEnd,
  filters,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseTimelineItemsOptions): UseTimelineItemsResult {
  const {
    goalState = "active",
    lifeAreaId,
    ownerId,
    itemTypes,
  } = filters ?? {};

  // Content-derived, not reference-derived — an inline `filters={{...}}`
  // object literal at the call site must not defeat caching just because
  // its identity is new every render.
  const filtersKey = useMemo(
    () =>
      JSON.stringify([
        goalState,
        lifeAreaId ?? null,
        ownerId ?? null,
        itemTypes ? [...itemTypes].sort() : null,
      ]),
    [goalState, lifeAreaId, ownerId, itemTypes],
  );

  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable per hook instance — createBrowserClient has no per-render
  // inputs, so there's nothing for exhaustive-deps to ask for here.
  const supabase = useMemo(() => createClient(), []);

  // The buffered range (+ filters) currently reflected in `items`. A ref,
  // not state: it gates whether the effect fetches, so it must not itself
  // trigger a render.
  const coveredRef = useRef<CoveredRange | null>(null);
  // Successful fetches, keyed by filters + day-rounded buffered window —
  // day-rounded because starts_on/ends_on are bare `date` columns, so two
  // buffered windows landing on the same day cover exactly the same rows.
  const cacheRef = useRef<Map<string, TimelineItem[]>>(new Map());

  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();

  useEffect(() => {
    const covered = coveredRef.current;
    const needsFetch =
      !covered ||
      covered.filtersKey !== filtersKey ||
      windowStartMs < covered.startMs ||
      windowEndMs > covered.endMs;
    if (!needsFetch) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      const viewportSpanMs = windowEndMs - windowStartMs;
      const bufferedStartMs = windowStartMs - viewportSpanMs;
      const bufferedEndMs = windowEndMs + viewportSpanMs;
      const fromDate = dateToBareDate(new Date(bufferedStartMs));
      const toDate = dateToBareDate(new Date(bufferedEndMs));
      const cacheKey = `${filtersKey}|${fromDate}|${toDate}`;

      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        coveredRef.current = {
          startMs: bufferedStartMs,
          endMs: bufferedEndMs,
          filtersKey,
        };
        setItems(cached);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      void (async () => {
        let query = supabase
          .from("v_timeline_items")
          .select("*")
          .gte("ends_on", fromDate)
          .lte("starts_on", toDate);

        if (goalState !== null) {
          query = query.eq("status", goalState);
        }
        if (lifeAreaId) {
          query = query.eq("life_area_id", lifeAreaId);
        }
        if (ownerId) {
          query = query.eq("owner_id", ownerId);
        }
        if (itemTypes && itemTypes.length > 0) {
          query = query.in("item_type", itemTypes);
        }

        // Only real network fetches log, so scrolling a window can be
        // verified as "bounded, not one per frame" straight from the
        // console (P3.1's acceptance check) without extra instrumentation.
        console.debug("[useTimelineItems] fetch", { fromDate, toDate });
        const { data, error: fetchError } = await query;
        if (cancelled) return;

        if (fetchError) {
          setError(fetchError.message);
          setLoading(false);
          // Deliberately not caching or advancing coveredRef — the next
          // window/filters change (or a retry of the same one) should hit
          // the network again rather than getting stuck "covered" by a
          // failed fetch.
          return;
        }

        const rows = data ?? [];
        cacheRef.current.set(cacheKey, rows);
        coveredRef.current = {
          startMs: bufferedStartMs,
          endMs: bufferedEndMs,
          filtersKey,
        };
        setItems(rows);
        setError(null);
        setLoading(false);
      })();
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    windowStartMs,
    windowEndMs,
    debounceMs,
    supabase,
    filtersKey,
    goalState,
    lifeAreaId,
    ownerId,
    itemTypes,
  ]);

  return { items, loading, error };
}
