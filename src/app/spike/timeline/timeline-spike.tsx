"use client";

// SPIKE — throwaway, not production code. One shared component with an
// `orientation` branch, on purpose: that choice is literally one of the
// four questions SPIKE-NOTES.md has to answer, and the only honest way to
// answer it is to have actually built it this way and felt where it hurt.

import { scaleTime } from "d3-scale";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";
import { LIFE_AREAS, SPIKE_ITEMS, TIMELINE_END, TIMELINE_START, type SpikeItem } from "./data";

// ReturnType<typeof scaleTime> resolves via the overload with no default
// for its Range generic, collapsing to `unknown` — pin it explicitly.
type TimeScale = ReturnType<typeof scaleTime<number, number>>;

type Zoom = "week" | "month" | "year";

const PX_PER_DAY: Record<Zoom, number> = {
  week: 60,
  month: 14,
  year: 2.2,
};

const RAG_COLOR: Record<SpikeItem["rag"], string> = {
  green: "var(--rag-green)",
  amber: "var(--rag-amber)",
  red: "var(--rag-red)",
  grey: "var(--rag-grey)",
};

const LANE_SIZE = 72; // px, cross-axis extent of an open lane
const LANE_SIZE_COLLAPSED = 32;
const HEADER_SIZE = 44; // px reserved for the axis header

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Orientation is read from the viewport, not chosen — this is the thing
// being tested, so it has to react to an actual resize, not just the
// initial load. matchMedia + useSyncExternalStore (same trick as the
// onboarding form's timezone detection) rather than useState+resize
// listener in an effect: no hydration-mismatch flash, no extra render.
function subscribeToViewport(callback: () => void) {
  const mql = window.matchMedia("(min-width: 768px)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function getIsDesktop() {
  return window.matchMedia("(min-width: 768px)").matches;
}

// Same shape of problem as orientation, different symptom: `new Date()`
// evaluated during the server render and again during client hydration
// lands a few hundred milliseconds apart, so the "today" marker's exact
// pixel offset differs by a fraction of a pixel — React flags the
// mismatch and gives up patching it. First fix attempt reused the
// orientation trick verbatim (getSnapshot returning Date.now()) and hit a
// *second*, worse bug: useSyncExternalStore requires getSnapshot to
// return a stable value between calls unless the store actually changed,
// and Date.now() is never equal to itself — React treated every render as
// a fresh mismatch and looped until "Maximum update depth exceeded."
// Caching the first read fixes both: stable for useSyncExternalStore,
// still correct enough for a marker nobody expects to move mid-session.
let cachedNow: number | null = null;
function subscribeNever() {
  return () => {};
}
function getNow() {
  cachedNow ??= Date.now();
  return cachedNow;
}

export function TimelineSpike() {
  const isDesktop = useSyncExternalStore(subscribeToViewport, getIsDesktop, () => true);
  const orientation: "horizontal" | "vertical" = isDesktop ? "horizontal" : "vertical";

  const [zoom, setZoom] = useState<Zoom>("month");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = useSyncExternalStore(subscribeNever, getNow, () => TIMELINE_START.getTime());

  const scale = useMemo(
    () => scaleTime().domain([TIMELINE_START, TIMELINE_END]),
    [],
  );

  const totalDays = (TIMELINE_END.getTime() - TIMELINE_START.getTime()) / (1000 * 60 * 60 * 24);
  const totalPx = totalDays * PX_PER_DAY[zoom];
  scale.range([0, totalPx]);

  const todayPx = scale(new Date(now));

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (!el) return;
    const target = todayPx - 200;
    if (orientation === "horizontal") el.scrollTo({ left: target, behavior: "smooth" });
    else el.scrollTo({ top: target, behavior: "smooth" });
  };

  const toggleLane = (lane: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(lane)) next.delete(lane);
      else next.add(lane);
      return next;
    });
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-subtle px-4 py-3">
        <h1 className="font-display text-xl">Timeline spike</h1>
        <div className="flex gap-1 rounded-lg border border-subtle p-1">
          {(["week", "month", "year"] as const).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={cn(
                "rounded-md px-3 py-1 text-sm capitalize transition-colors",
                zoom === z
                  ? "bg-raised text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {z}
            </button>
          ))}
        </div>
        <button
          onClick={scrollToToday}
          className="rounded-md border border-subtle px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Today
        </button>
        <span className="text-xs text-muted-foreground">
          orientation: {orientation} (resize the window to switch)
        </span>
      </header>

      <div
        ref={scrollRef}
        className={cn(
          "relative flex-1",
          orientation === "horizontal" ? "overflow-x-auto overflow-y-hidden" : "overflow-y-auto overflow-x-hidden",
        )}
      >
        <div
          className={cn(
            "relative",
            orientation === "horizontal" ? "flex h-full flex-col" : "flex w-full flex-row",
          )}
          style={
            orientation === "horizontal"
              ? { width: totalPx + HEADER_SIZE }
              : { height: totalPx + HEADER_SIZE }
          }
        >
          {/* Today marker — full cross-axis line at the scaled position */}
          <div
            className="pointer-events-none absolute z-30 bg-star"
            style={
              orientation === "horizontal"
                ? { left: todayPx + HEADER_SIZE, top: 0, bottom: 0, width: 2 }
                : { top: todayPx + HEADER_SIZE, left: 0, right: 0, height: 2 }
            }
          />

          {LIFE_AREAS.map((lane) => (
            <Lane
              key={lane}
              lane={lane}
              items={SPIKE_ITEMS.filter((i) => i.lifeArea === lane)}
              scale={scale}
              orientation={orientation}
              collapsed={collapsed.has(lane)}
              onToggle={() => toggleLane(lane)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Lane({
  lane,
  items,
  scale,
  orientation,
  collapsed,
  onToggle,
}: {
  lane: string;
  items: SpikeItem[];
  scale: TimeScale;
  orientation: "horizontal" | "vertical";
  collapsed: boolean;
  onToggle: () => void;
}) {
  const size = collapsed ? LANE_SIZE_COLLAPSED : LANE_SIZE;
  const horizontal = orientation === "horizontal";

  return (
    <div
      className={cn(
        "relative shrink-0 border-subtle",
        horizontal ? "flex w-full border-b" : "flex h-full flex-col border-r",
      )}
      style={horizontal ? { height: size } : { width: size }}
    >
      {/* Lane label — pinned to the start of the cross-axis viewport, sticky
          against the main scroll container (the one with overflow). This
          is the same "sticky label" mechanism as the multi-year band
          titles below, just anchored to the lane instead of an item. */}
      <div
        className={cn(
          "sticky z-20 flex shrink-0 items-center gap-2 bg-background/95 px-2 text-xs font-medium text-muted-foreground backdrop-blur-sm",
          horizontal ? "left-0 h-full w-[--header-size]" : "top-0 w-full h-[--header-size] flex-row",
        )}
        style={{ ["--header-size" as string]: `${HEADER_SIZE}px` }}
      >
        <button onClick={onToggle} className="hover:text-foreground" aria-label={collapsed ? "Expand lane" : "Collapse lane"}>
          {collapsed ? "▸" : "▾"}
        </button>
        {!collapsed && <span className="truncate">{lane}</span>}
      </div>

      {/* Track — items positioned along the main (time) axis via the scale */}
      <div className={cn("relative flex-1", horizontal ? "h-full" : "w-full")}>
        {!collapsed &&
          items.map((item) => (
            <Item key={item.id} item={item} scale={scale} orientation={orientation} />
          ))}
      </div>
    </div>
  );
}

function Item({
  item,
  scale,
  orientation,
}: {
  item: SpikeItem;
  scale: TimeScale;
  orientation: "horizontal" | "vertical";
}) {
  const start = new Date(item.start);
  const end = new Date(item.end);
  const startPx = scale(start) + HEADER_SIZE;
  const endPx = scale(end) + HEADER_SIZE;
  const lengthPx = Math.max(endPx - startPx, 0);
  const isMultiYear = end.getTime() - start.getTime() > ONE_YEAR_MS;
  const horizontal = orientation === "horizontal";
  const color = RAG_COLOR[item.rag];

  if (item.kind === "milestone") {
    return (
      <div
        title={item.title}
        className="absolute top-1/2 left-1/2 z-10 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-subtle"
        style={{
          backgroundColor: color,
          ...(horizontal ? { left: startPx, top: "50%" } : { top: startPx, left: "50%" }),
        }}
      />
    );
  }

  if (isMultiYear) {
    // Tinted band + sticky title, as two SIBLINGS at the same box rather
    // than one element — this is the fix for the fiddliest bug in the
    // whole spike (see SPIKE-NOTES.md). The first attempt nested the
    // sticky label inside the tinted div and gave that div
    // `overflow-hidden` for rounded corners; that clips the sticky
    // element's containing block along with it, so once the band's own
    // edges scroll past the viewport, the label has nowhere valid left to
    // render and just vanishes — it does not stay pinned, it disappears
    // entirely. Splitting the clipped background out from the unclipped
    // label fixes it: the label's box is never clipped, only the tint is.
    const boxStyle = horizontal
      ? { left: startPx, width: lengthPx, top: 4, bottom: 4 }
      : { top: startPx, height: lengthPx, left: 4, right: 4 };
    return (
      <>
        <div
          className="absolute z-0 overflow-hidden rounded-sm"
          style={{ backgroundColor: color, opacity: 0.18, border: `1px solid ${color}`, ...boxStyle }}
        />
        <div className="absolute z-10 flex items-center" style={boxStyle}>
          <span
            className="sticky truncate px-2 text-xs font-medium text-foreground"
            style={horizontal ? { left: HEADER_SIZE + 4 } : { top: HEADER_SIZE + 4 }}
          >
            {item.title}
          </span>
        </div>
      </>
    );
  }

  return (
    <div
      title={`${item.title} (${item.start} – ${item.end})`}
      className={cn(
        "absolute z-10 flex items-center overflow-hidden rounded px-2 text-xs whitespace-nowrap text-deep",
        horizontal ? "-translate-y-1/2" : "-translate-x-1/2",
      )}
      style={{
        backgroundColor: color,
        // The bar's own edge is the item's start date — only the
        // cross-axis is centered in the lane, not the time axis (that
        // would anchor the bar's *midpoint* to its start date instead).
        ...(horizontal
          ? { left: startPx, width: Math.max(lengthPx, 4), top: "50%", height: 24 }
          : { top: startPx, height: Math.max(lengthPx, 4), left: "50%", width: 96 }),
      }}
    >
      {item.title}
    </div>
  );
}
