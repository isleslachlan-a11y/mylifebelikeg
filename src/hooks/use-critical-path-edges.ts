"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

export type DependencyRow =
  Database["public"]["Tables"]["task_dependencies"]["Row"];

export type UseCriticalPathEdgesOptions = {
  /**
   * The task ids the caller currently has a critical, rendered rect
   * for — same "windowed in, in a non-collapsed lane" set
   * `selectCriticalPathEdges` (`critical-path.ts`) expects as its own
   * `renderedCriticalTaskIds` argument. This hook only fetches edges
   * whose *successor* is in this set; by CPM's own construction a
   * critical task's predecessor along the critical chain is critical
   * too, so this catches the edges that matter without needing to query
   * by predecessor as well. `selectCriticalPathEdges` still re-checks
   * both ends before anything is drawn — this hook's job is fetching,
   * not deciding what's drawable.
   */
  criticalTaskIds: string[];
  /** P5.1's toggle, off by default — no query fires at all while this is false, so leaving critical-path highlighting off costs nothing. */
  enabled: boolean;
  debounceMs?: number;
};

export type UseCriticalPathEdgesResult = {
  edges: DependencyRow[];
  loading: boolean;
  error: string | null;
};

const DEFAULT_DEBOUNCE_MS = 150;

/**
 * The second client-side Supabase query in the app (`use-timeline-items.ts`
 * was the first) — same reasoning: the toggle-driven arrow overlay needs
 * live data the moment `showCriticalPath` flips on, and there's no
 * server round trip in `TimelineView`'s render path to piggyback the
 * fetch onto. `task_dependencies_select`'s RLS (`app.can_view_goal` via
 * the predecessor task's goal) already is the exact authorization
 * surface wanted here, same as `dependency-actions.ts`'s server-side
 * reads — no extra filter layered on top.
 *
 * Debounced and cached by the sorted id list, same shape as
 * `use-timeline-items.ts`'s (filters, window) cache — panning/zooming
 * back to a set of critical task ids already fetched is a cache hit, not
 * a new network call. Not range-windowed the way that hook is: there's
 * no separate "buffer" concept for a set of ids the way there is for a
 * date range, so every change to `criticalTaskIds` is a potential
 * refetch, debounced so a fast pan/zoom sequence settles before firing.
 *
 * All branches (disabled, cache hit, real fetch) funnel through the same
 * single `setTimeout`, with every `setState` call happening inside its
 * callback rather than synchronously in the effect body — React's own
 * guidance (and this project's lint config) flags synchronous `setState`
 * in an effect as a cascading-render risk; `use-timeline-items.ts`
 * follows the identical shape for the same reason, it just never needed
 * a "disabled" branch to fold in.
 */
export function useCriticalPathEdges({
  criticalTaskIds,
  enabled,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseCriticalPathEdgesOptions): UseCriticalPathEdgesResult {
  const idsKey = useMemo(
    () => [...criticalTaskIds].sort().join(","),
    [criticalTaskIds],
  );

  const [edges, setEdges] = useState<DependencyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const cacheRef = useRef<Map<string, DependencyRow[]>>(new Map());

  useEffect(() => {
    const hasWork = enabled && criticalTaskIds.length > 0;
    // No debounce needed for "nothing to fetch" or "already cached" —
    // only a real network fetch waits out `debounceMs`.
    const delay = hasWork && !cacheRef.current.has(idsKey) ? debounceMs : 0;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;

      if (!hasWork) {
        setEdges([]);
        setError(null);
        setLoading(false);
        return;
      }

      const cached = cacheRef.current.get(idsKey);
      if (cached) {
        setEdges(cached);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      void (async () => {
        const { data, error: fetchError } = await supabase
          .from("task_dependencies")
          .select("*")
          .in("successor_task_id", criticalTaskIds);
        if (cancelled) return;

        if (fetchError) {
          setError(fetchError.message);
          setLoading(false);
          return;
        }

        const rows = data ?? [];
        cacheRef.current.set(idsKey, rows);
        setEdges(rows);
        setError(null);
        setLoading(false);
      })();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [idsKey, enabled, debounceMs, supabase, criticalTaskIds]);

  return { edges, loading, error };
}
