"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { LlamaEmptyState } from "@/components/llama-empty-state";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  useTimelineItems,
  type GoalState,
  type TimelineItemFilters,
  type TimelineItemType,
} from "@/hooks/use-timeline-items";
import type { GoalRag } from "@/lib/rag";
import { groupIntoLanes, type GroupingMode } from "@/lib/timeline/lanes";
import { createScale, type ZoomLevel } from "@/lib/timeline/scale";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";
import { ItemHoverCard } from "./item-hover-card";
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
const GOAL_STATE_OPTIONS: { value: GoalState | "all"; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "someday", label: "Someday" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
  { value: "abandoned", label: "Abandoned" },
  { value: "all", label: "All states" },
];
const DEFAULT_GOAL_STATE_FILTER: GoalState | "all" = "active";

export type TimelineViewProps = {
  /** Total pixel length of the visible time domain — width on desktop, height on mobile (P3.5). */
  rangePx: number;
  lifeAreas: LifeAreaRow[];
  ownerNames?: Map<string, string>;
  goalTitles?: Map<string, string>;
  /**
   * `computeScheduleVariance`'s output (percentage points), keyed by
   * `goal_id`, for the hover card's goal-only schedule-variance row
   * (P3.7). `v_timeline_items` doesn't carry what that calculation
   * needs, so — same as `ownerNames`/`goalTitles` — this is the caller's
   * responsibility to supply; omitted or a missing/null entry just means
   * the card shows no schedule row for that goal, never a fabricated 0.
   */
  scheduleVariances?: Map<string, number | null>;
  /**
   * From `v_goal_rag` (P4.2), keyed by `goal_id` — same caller-supplied
   * contract as `scheduleVariances`, since `v_timeline_items` doesn't
   * carry RAG data either. Drives both timeline layouts' goal-band
   * colouring (replacing P3.4's date-based classification for goals
   * specifically) and the hover card's status row for goal items.
   */
  goalRag?: Map<string, GoalRag>;
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
 * components": grouping mode, filters, hover/focus state, per-lane
 * collapse state, the mobile single-expand rule, and — since P3.5 —
 * zoom/pan too. Plain React state throughout — never `localStorage`/
 * `sessionStorage` (CLAUDE.md rule 7), so all of it resets on a full
 * reload by design, but survives everything short of that: switching
 * grouping mode, toggling filters, and crossing the mobile/desktop
 * breakpoint (R6) all just re-render this same component instance —
 * nothing here ever unmounts the orientation component or keys it by
 * mode/breakpoint, which is what would reset scroll position and blow
 * away collapse/hover state.
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
 * Zooming (button, `+`/`-` keyboard shortcut, or the select) only ever
 * changes `zoom`, never `anchor` — `createScale` always centres its
 * domain on `anchor`, so the centre date is preserved by construction,
 * not by any special-cased "preserve the centre" logic (P3.7's
 * acceptance criterion).
 *
 * Renders `HorizontalTimeline` (P3.4) at >=768px and `VerticalTimeline`
 * (P3.5) below it — two separate components, not one with an
 * `orientation` prop and conditionals threaded through it (R6, and both
 * packages' briefs are explicit about this: the date maths transfers
 * cleanly across orientations, the layout constants do not). P3.7 adds
 * navigation (`onNavigate` -> `/goals/[id]`, wired into every bar/
 * diamond/band in both), a hover/focus-driven info card
 * (`ItemHoverCard`, rendered here as a fixed corner panel rather than a
 * cursor-following tooltip), an expanded filter bar, and two distinct
 * empty states — "no data at all" (a one-time, unwindowed existence
 * check, since the windowed/filtered fetch alone can't tell that case
 * apart from "filtered/windowed to nothing") vs. "filters exclude
 * everything" (data exists; nothing currently matches).
 */
export function TimelineView({
  rangePx,
  lifeAreas,
  ownerNames,
  goalTitles,
  scheduleVariances,
  goalRag,
  today,
  financialHorizon = null,
  initialAnchor,
}: TimelineViewProps) {
  const isMobile = useIsMobile();
  const router = useRouter();

  const [groupingMode, setGroupingMode] = useState<GroupingMode>("life_area");

  const [goalStateFilter, setGoalStateFilter] = useState<GoalState | "all">(
    DEFAULT_GOAL_STATE_FILTER,
  );
  const [lifeAreaFilter, setLifeAreaFilter] = useState<string | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState<string | "all">("all");
  const [itemTypes, setItemTypes] = useState<TimelineItemType[]>(ITEM_TYPES);
  const filters: TimelineItemFilters = useMemo(
    () => ({
      goalState: goalStateFilter === "all" ? null : goalStateFilter,
      lifeAreaId: lifeAreaFilter === "all" ? undefined : lifeAreaFilter,
      ownerId: ownerFilter === "all" ? undefined : ownerFilter,
      itemTypes,
    }),
    [goalStateFilter, lifeAreaFilter, ownerFilter, itemTypes],
  );

  function clearFilters() {
    setGoalStateFilter(DEFAULT_GOAL_STATE_FILTER);
    setLifeAreaFilter("all");
    setOwnerFilter("all");
    setItemTypes(ITEM_TYPES);
  }
  const filtersAreDefault =
    goalStateFilter === DEFAULT_GOAL_STATE_FILTER &&
    lifeAreaFilter === "all" &&
    ownerFilter === "all" &&
    itemTypes.length === ITEM_TYPES.length;

  const [desktopCollapsedLaneIds, setDesktopCollapsedLaneIds] = useState<
    Set<string>
  >(new Set());
  const [mobileExpandedLaneId, setMobileExpandedLaneId] = useState<
    string | null
  >(null);
  const [showEmptyLanes, setShowEmptyLanes] = useState(false);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

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

  function stepZoom(direction: -1 | 1) {
    const index = ZOOM_LEVELS.indexOf(zoom);
    const nextIndex = Math.min(
      Math.max(index + direction, 0),
      ZOOM_LEVELS.length - 1,
    );
    const next = ZOOM_LEVELS[nextIndex];
    if (next) changeZoom(next);
  }

  // +/- (and =, the unshifted key sharing a US keyboard row with +) zoom
  // in/out; only while nothing else is capturing keyboard input, so this
  // never hijacks typing in a real page's filter inputs elsewhere.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        stepZoom(-1); // toward "day" — more granular
      } else if (e.key === "-") {
        e.preventDefault();
        stepZoom(1); // toward "year" — less granular
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

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

  function goToToday() {
    setAnchor(new Date(`${today}T00:00:00.000Z`));
  }

  function navigateToGoal(goalId: string) {
    router.push(`/goals/${goalId}`);
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

  const hoveredItem = useMemo(
    () => displayItems.find((item) => item.item_id === hoveredItemId) ?? null,
    [displayItems, hoveredItemId],
  );

  // A one-time, unwindowed, unfiltered existence check — separate from
  // the windowed/filtered fetch above on purpose. "Filtered/windowed to
  // nothing" and "no data exists at all" are indistinguishable from
  // `displayItems` alone; this is what tells them apart for the two
  // distinct empty states P3.7 asks for. null means "still checking" —
  // deliberately renders neither empty state until this resolves, so a
  // fresh mount never flashes the wrong one.
  const [hasAnyGoalsEver, setHasAnyGoalsEver] = useState<boolean | null>(null);
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    void (async () => {
      const { count, error: countError } = await supabase
        .from("goals")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      if (cancelled || countError) return;
      setHasAnyGoalsEver((count ?? 0) > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const nothingToShow = !loading && !error && displayItems.length === 0;

  return (
    <div className="relative flex flex-col gap-4">
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

        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Zoom out"
            title="Zoom out (-)"
            disabled={zoom === "year"}
            onClick={() => stepZoom(1)}
          >
            −
          </Button>
          <select
            className="border-subtle rounded border px-2 py-1"
            value={zoom}
            onChange={(e) => changeZoom(e.target.value as ZoomLevel)}
            aria-label="Zoom level"
          >
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Zoom in"
            title="Zoom in (+)"
            disabled={zoom === "day"}
            onClick={() => stepZoom(-1)}
          >
            +
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => pan(-0.3)}
          >
            ← Pan
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={goToToday}>
            Today
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
      </div>

      <div className="flex flex-wrap items-center gap-4 font-sans text-sm">
        <label className="flex items-center gap-2">
          Goal state
          <select
            className="border-subtle rounded border px-2 py-1"
            value={goalStateFilter}
            onChange={(e) =>
              setGoalStateFilter(e.target.value as GoalState | "all")
            }
          >
            {GOAL_STATE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          Life area
          <select
            className="border-subtle rounded border px-2 py-1"
            value={lifeAreaFilter}
            onChange={(e) => setLifeAreaFilter(e.target.value)}
          >
            <option value="all">All life areas</option>
            {lifeAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </label>

        {ownerNames && ownerNames.size > 0 && (
          <label className="flex items-center gap-2">
            Owner
            <select
              className="border-subtle rounded border px-2 py-1"
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
            >
              <option value="all">All owners</option>
              {[...ownerNames.entries()].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}

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

        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={showEmptyLanes}
            onChange={(e) => setShowEmptyLanes(e.target.checked)}
          />
          Show empty lanes
        </label>

        {!filtersAreDefault && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="font-sans text-sm">
        {loading && <p className="text-muted-foreground">Loading…</p>}
        {error && <p className="text-destructive">{error}</p>}
      </div>

      {nothingToShow ? (
        hasAnyGoalsEver === false ? (
          <LlamaEmptyState
            speaker="fluffy"
            title="Nothing here yet"
            body="Plant your first goal and it'll show up here, plotted against the calendar."
            action={
              <Button asChild>
                <Link href="/goals/new">New goal</Link>
              </Button>
            }
          />
        ) : hasAnyGoalsEver === true ? (
          <LlamaEmptyState
            speaker="fluffy"
            title="Nothing matches these filters"
            body="Your goals are out there — try widening the date range, or loosening a filter."
            action={
              !filtersAreDefault ? (
                <Button onClick={clearFilters}>Clear filters</Button>
              ) : undefined
            }
          />
        ) : null
      ) : isMobile ? (
        <VerticalTimeline
          lanes={visibleLanes}
          scale={scale}
          rangePx={rangePx}
          today={today}
          financialHorizon={financialHorizon}
          collapsedLaneIds={collapsedLaneIds}
          onToggleLane={toggleLane}
          hoveredItemId={hoveredItemId}
          onHoverItem={setHoveredItemId}
          onNavigate={navigateToGoal}
          goalRag={goalRag}
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
          hoveredItemId={hoveredItemId}
          onHoverItem={setHoveredItemId}
          onNavigate={navigateToGoal}
          goalRag={goalRag}
        />
      )}

      {hoveredItem && (
        <div className={cn("fixed right-4 bottom-4 z-50")}>
          <ItemHoverCard
            item={hoveredItem}
            today={today}
            ownerName={ownerNames?.get(hoveredItem.owner_id)}
            scheduleVariancePp={scheduleVariances?.get(hoveredItem.goal_id)}
            rag={goalRag?.get(hoveredItem.goal_id)}
          />
        </div>
      )}
    </div>
  );
}
