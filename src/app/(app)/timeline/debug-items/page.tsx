"use client";

import { useMemo, useState } from "react";
import { notFound } from "next/navigation";

import {
  useTimelineItems,
  type TimelineItemType,
} from "@/hooks/use-timeline-items";
import { createScale, type ZoomLevel } from "@/lib/timeline/scale";

const RANGE_PX = 1000;
const ZOOM_LEVELS: ZoomLevel[] = ["day", "week", "month", "quarter", "year"];
const ALL_ITEM_TYPES: TimelineItemType[] = ["goal", "milestone", "task"];

/**
 * Dev-only verification harness for P3.1's windowed data layer
 * (`useTimelineItems`) — dumps `items`/`loading`/`error` as JSON against
 * whatever pan/zoom/filter state you drive by hand, no rendering built on
 * top of it yet (that's later Phase 3 packages). Same
 * dev-only/`notFound()`-in-production convention as `/styleguide`.
 *
 * To verify the acceptance criteria, open devtools console:
 * - "Pan" a few times quickly, then stop: exactly one
 *   `[useTimelineItems] fetch` line should appear ~150ms after you stop,
 *   not one per click — confirms debouncing.
 * - "Jump far", then "Jump back": the first logs a fetch, the second
 *   does not (assuming it lands back within the still-cached buffer) —
 *   confirms scrolling back doesn't refetch.
 * - Small pans that stay within the current buffer log nothing at all.
 */
export default function TimelineDebugItemsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const [anchor, setAnchor] = useState(() => new Date("2026-06-15"));
  const [goalStateFilter, setGoalStateFilter] = useState<"active" | "all">(
    "active",
  );
  const [itemTypes, setItemTypes] =
    useState<TimelineItemType[]>(ALL_ITEM_TYPES);

  const scale = useMemo(
    () => createScale(zoom, anchor, RANGE_PX),
    [zoom, anchor],
  );
  const [windowStart, windowEnd] = scale.domain;
  const domainSpanMs = windowEnd.getTime() - windowStart.getTime();

  const { items, loading, error } = useTimelineItems({
    windowStart,
    windowEnd,
    filters: {
      goalState: goalStateFilter === "active" ? "active" : null,
      itemTypes,
    },
  });

  function pan(fractionOfDomain: number) {
    setAnchor(
      (prev) => new Date(prev.getTime() + domainSpanMs * fractionOfDomain),
    );
  }

  function toggleItemType(type: TimelineItemType) {
    setItemTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-8 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground font-sans text-sm">
          Dev-only · not part of the product
        </p>
        <h1 className="font-display text-3xl">Timeline items — data layer</h1>
        <p className="text-muted-foreground max-w-prose font-sans text-sm">
          Verification harness for <code>useTimelineItems</code> (P3.1) — watch
          the console while panning/jumping. See this file&rsquo;s module doc
          for exactly what to check.
        </p>
      </header>

      <section className="border-subtle bg-surface flex flex-wrap items-center gap-3 rounded-xl border p-4 font-sans text-sm">
        <label className="flex items-center gap-2">
          Zoom
          <select
            className="border-subtle rounded border px-2 py-1"
            value={zoom}
            onChange={(e) => setZoom(e.target.value as ZoomLevel)}
          >
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          Goal state
          <select
            className="border-subtle rounded border px-2 py-1"
            value={goalStateFilter}
            onChange={(e) =>
              setGoalStateFilter(e.target.value as "active" | "all")
            }
          >
            <option value="active">active only</option>
            <option value="all">all</option>
          </select>
        </label>

        {ALL_ITEM_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={itemTypes.includes(type)}
              onChange={() => toggleItemType(type)}
            />
            {type}
          </label>
        ))}
      </section>

      <section className="flex flex-wrap gap-2 font-sans text-sm">
        <button
          className="border-subtle rounded border px-3 py-1"
          onClick={() => pan(-0.2)}
        >
          ← Pan
        </button>
        <button
          className="border-subtle rounded border px-3 py-1"
          onClick={() => pan(0.2)}
        >
          Pan →
        </button>
        <button
          className="border-subtle rounded border px-3 py-1"
          onClick={() => pan(-5)}
        >
          Jump far back
        </button>
        <button
          className="border-subtle rounded border px-3 py-1"
          onClick={() => pan(5)}
        >
          Jump far
        </button>
        <button
          className="border-subtle rounded border px-3 py-1"
          onClick={() => setAnchor(new Date("2026-06-15"))}
        >
          Reset anchor
        </button>
      </section>

      <section className="flex flex-col gap-2 font-sans text-sm">
        <p>
          Visible window: <strong>{windowStart.toDateString()}</strong> –{" "}
          <strong>{windowEnd.toDateString()}</strong>
        </p>
        <p>
          {loading ? "Loading…" : `${items.length} item(s)`}
          {error ? ` — error: ${error}` : ""}
        </p>
      </section>

      <pre className="border-subtle bg-surface overflow-x-auto rounded-xl border p-4 text-xs">
        {JSON.stringify(items, null, 2)}
      </pre>
    </main>
  );
}
