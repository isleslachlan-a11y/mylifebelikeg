"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  useTimelineItems,
  type TimelineItemFilters,
  type TimelineItemType,
} from "@/hooks/use-timeline-items";
import { groupIntoLanes, type GroupingMode } from "@/lib/timeline/lanes";
import { createScale, type ZoomLevel } from "@/lib/timeline/scale";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";
import {
  toDisplayItem,
  type DisplayTimelineItem,
} from "./timeline-item-adapter";
import { HorizontalTimeline } from "./horizontal-timeline";
import { VerticalTimeline } from "./vertical-timeline";

type LifeAreaRow = Database["public"]["Tables"]["life_areas"]["Row"];

const GROUPING_MODES: { value: GroupingMode; label: string }[] = [
  { value: "life_area", label: "Life Area" },
  { value: "owner", label: "Owner" },
  { value: "goal", label: "Goal" },
];
const ITEM_TYPES: TimelineItemType[] = ["goal", "milestone", "task"];
const ZOOM_LEVELS: ZoomLevel[] = ["day", "week", "month", "quarter", "year"];
const DESKTOP_DEFAULT_ZOOM: ZoomLevel = "month";
const MOBILE_DEFAULT_ZOOM: ZoomLevel = "week";

export type TimelineViewProps = {
  /** Total pixel length of the visible time domain — width on desktop, height on mobile (P3.5). */
  rangePx: number;
  lifeAreas: LifeAreaRow[];
  ownerNames?: Map<string, string>;
  goalTitles?: Map<string, string>;
  /** Timezone-resolved, computed once per request by the caller (R2) — never `new Date()` here or below. */
  today: string;
  /**
   * Bare "YYYY-MM-DD" from `app.financial_horizon()` for the current
   * viewer, or `null`/omitted when they have no active funded goals —
   * P3.6 renders nothing for the horizon line in that case, not a line
   * at epoch.
   */
  financialHorizon?: string | null;
  /** The initial scroll anchor. Defaults to `today` when omitted. */
  initialAnchor?: Date;
};

/**
 * Owns everything the Phase 3 briefs require to "live above the lane
 * components": grouping mode, filters, selection, per-lane collapse
 * state, the mobile single-expand rule, and — since P3.5 — zoom/pan too.
 * Plain React state throughout — never `localStorage`/`sessionStorage`
 * (CLAUDE.md rule 7), so all of it resets on a full reload by design,
 * but survives everything short of that: switching grouping mode,
 * toggling filters, and crossing the mobile/desktop breakpoint (R6) all
 * just re-render this same component instance — nothing here ever
 * unmounts the orientation component or keys it by mode/breakpoint,
 * which is what would reset scroll position and blow away collapse/
 * selection state.
 *
 * Desktop and mobile collapse state are tracked *separately*
 * (`desktopCollapsedLaneIds` vs `mobileExpandedLaneId`) rather than
 * trying to derive one from the other. That's what makes "survives the
 * breakpoint switch" true without extra bookkeeping: switching to mobile
 * never touches `desktopCollapsedLaneIds`, so switching back restores
 * exactly what it was, regardless of what got expanded/collapsed while
 * on mobile.
 *
 * Zoom defaults to week on mobile and month on desktop (P3.5 — day/week
 * are "the useful ones on a phone", quarter/year "compress to
 * near-unreadable" there) and keeps tracking that default, per
 * breakpoint, for as long as the user hasn't picked a zoom themselves —
 * `zoomTouchedByUser` latches permanently on the first manual change, so
 * a deliberate choice is never silently overridden by a later resize.
 *
 * Renders `HorizontalTimeline` (P3.4) at >=768px and `VerticalTimeline`
 * (P3.5) below it — two separate components, not one with an
 * `orientation` prop and conditionals threaded through it (R6, and both
 * packages' briefs are explicit about this: the date maths transfers
 * cleanly across orientations, the layout constants do not).
 */
export function TimelineView({
  rangePx,
  lifeAreas,
  ownerNames,
  goalTitles,
  today,
  financialHorizon = null,
  initialAnchor,
}: TimelineViewProps) {
  const isMobile = useIsMobile();

  const [groupingMode, setGroupingMode] = useState<GroupingMode>("life_area");

  const [goalStateFilter, setGoalStateFilter] = useState<"active" | "all">(
    "active",
  );
  const [itemTypes, setItemTypes] = useState<TimelineItemType[]>(ITEM_TYPES);
  const filters: TimelineItemFilters = useMemo(
    () => ({
      goalState: goalStateFilter === "active" ? "active" : null,
      itemTypes,
    }),
    [goalStateFilter, itemTypes],
  );

  const [desktopCollapsedLaneIds, setDesktopCollapsedLaneIds] = useState<
    Set<string>
  >(new Set());
  const [mobileExpandedLaneId, setMobileExpandedLaneId] = useState<
    string | null
  >(null);
  const [showEmptyLanes, setShowEmptyLanes] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [anchor, setAnchor] = useState(
    () => initialAnchor ?? new Date(`${today}T00:00:00.000Z`),
  );
  const [zoom, setZoom] = useState<ZoomLevel>(DESKTOP_DEFAULT_ZOOM);
  const [zoomTouchedByUser, setZoomTouchedByUser] = useState(false);

  // Tracks the breakpoint-appropriate default for as long as the user
  // hasn't overridden it — see the module doc. Adjusted during render
  // (React's own recommended pattern for "reset/adjust state when a prop
  // changes") rather than in an Effect: an Effect that calls setState
  // unconditionally on every fire, even behind an `if`, forces an extra
  // post-commit render pass; comparing against the previous render's
  // `isMobile` here lets React fold the adjustment into the same render
  // instead.
  const [prevIsMobile, setPrevIsMobile] = useState(isMobile);
  if (isMobile !== prevIsMobile) {
    setPrevIsMobile(isMobile);
    if (!zoomTouchedByUser) {
      setZoom(isMobile ? MOBILE_DEFAULT_ZOOM : DESKTOP_DEFAULT_ZOOM);
    }
  }

  function changeZoom(newZoom: ZoomLevel) {
    setZoomTouchedByUser(true);
    setZoom(newZoom);
  }

  const scale = useMemo(
    () => createScale(zoom, anchor, rangePx),
    [zoom, anchor, rangePx],
  );
  const [windowStart, windowEnd] = scale.domain;

  function pan(fractionOfDomain: number) {
    const domainSpanMs = windowEnd.getTime() - windowStart.getTime();
    setAnchor(
      (prev) => new Date(prev.getTime() + domainSpanMs * fractionOfDomain),
    );
  }

  const { items, loading, error } = useTimelineItems({
    windowStart,
    windowEnd,
    filters,
  });

  const displayItems = useMemo(
    () =>
      items
        .map(toDisplayItem)
        .filter((item): item is DisplayTimelineItem => item !== null),
    [items],
  );

  const lifeAreaMeta = useMemo(
    () =>
      lifeAreas.map((area) => ({
        id: area.id,
        name: area.name,
        colour: area.colour,
        sortOrder: area.sort_order,
      })),
    [lifeAreas],
  );

  const allLanes = useMemo(
    () =>
      groupIntoLanes(displayItems, groupingMode, {
        lifeAreas: lifeAreaMeta,
        ownerNames,
        goalTitles,
      }),
    [displayItems, groupingMode, lifeAreaMeta, ownerNames, goalTitles],
  );
  const allLaneIds = useMemo(() => allLanes.map((l) => l.laneId), [allLanes]);
  const visibleLanes = showEmptyLanes
    ? allLanes
    : allLanes.filter((lane) => lane.items.length > 0);

  const collapsedLaneIds = isMobile
    ? new Set(allLaneIds.filter((id) => id !== mobileExpandedLaneId))
    : desktopCollapsedLaneIds;

  function toggleLane(laneId: string) {
    if (isMobile) {
      // Expanding this one collapses every other lane; expanding the
      // already-expanded one collapses it instead (leaving none open) —
      // ordinary accordion behaviour, at most one lane open at a time.
      setMobileExpandedLaneId((prev) => (prev === laneId ? null : laneId));
      return;
    }
    setDesktopCollapsedLaneIds((prev) => {
      const next = new Set(prev);
      if (next.has(laneId)) {
        next.delete(laneId);
      } else {
        next.add(laneId);
      }
      return next;
    });
  }

  function toggleItemType(type: TimelineItemType) {
    setItemTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4 font-sans text-sm">
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Group lanes by"
        >
          {GROUPING_MODES.map((m) => (
            <Button
              key={m.value}
              type="button"
              size="sm"
              variant={groupingMode === m.value ? "secondary" : "ghost"}
              aria-pressed={groupingMode === m.value}
              onClick={() => setGroupingMode(m.value)}
            >
              {m.label}
            </Button>
          ))}
        </div>

        <label className="flex items-center gap-2">
          Zoom
          <select
            className="border-subtle rounded border px-2 py-1"
            value={zoom}
            onChange={(e) => changeZoom(e.target.value as ZoomLevel)}
          >
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => pan(-0.3)}
          >
            ← Pan
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => pan(0.3)}
          >
            Pan →
          </Button>
        </div>

        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={goalStateFilter === "all"}
            onChange={(e) =>
              setGoalStateFilter(e.target.checked ? "all" : "active")
            }
          />
          Include non-active goals
        </label>

        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={showEmptyLanes}
            onChange={(e) => setShowEmptyLanes(e.target.checked)}
          />
          Show empty lanes
        </label>

        {ITEM_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={itemTypes.includes(type)}
              onChange={() => toggleItemType(type)}
            />
            {type}
          </label>
        ))}
      </div>

      <div className="font-sans text-sm">
        {loading && <p className="text-muted-foreground">Loading…</p>}
        {error && <p className="text-destructive">{error}</p>}
        <p
          className={cn("text-muted-foreground", !selectedItemId && "sr-only")}
        >
          Selected: {selectedItemId ?? "none"}
        </p>
      </div>

      {isMobile ? (
        <VerticalTimeline
          lanes={visibleLanes}
          scale={scale}
          rangePx={rangePx}
          today={today}
          financialHorizon={financialHorizon}
          collapsedLaneIds={collapsedLaneIds}
          onToggleLane={toggleLane}
          selectedItemId={selectedItemId}
          onSelectItem={setSelectedItemId}
        />
      ) : (
        <HorizontalTimeline
          lanes={visibleLanes}
          scale={scale}
          rangePx={rangePx}
          today={today}
          financialHorizon={financialHorizon}
          collapsedLaneIds={collapsedLaneIds}
          onToggleLane={toggleLane}
          selectedItemId={selectedItemId}
          onSelectItem={setSelectedItemId}
        />
      )}
    </div>
  );
}
