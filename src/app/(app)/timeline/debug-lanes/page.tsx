"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";

import { TimelineView } from "@/components/timeline/timeline-view";
import { todayInZone } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type LifeAreaRow = Database["public"]["Tables"]["life_areas"]["Row"];

const RANGE_PX = 1000;

/**
 * Dev-only verification harness for `TimelineView` end to end: P3.3's
 * lane system, P3.4's horizontal layout at >=768px, and P3.5's vertical
 * layout below that — `TimelineView` now owns zoom/pan itself (P3.5), so
 * this page just supplies the data props and resizes/reloads to switch
 * orientation. Same dev-only/`notFound()`-in-production convention as
 * `/styleguide` and `/timeline/debug-items`.
 *
 * What to check against P3.3's acceptance criteria:
 * - Switch grouping mode (Life Area / Owner / Goal): lanes re-group
 *   immediately, filters and any expanded/collapsed state you'd already
 *   set stay exactly as they were, and — if the lane list is tall enough
 *   to scroll — the page's scroll position doesn't jump.
 * - Shrink the window below 768px (or open devtools' device toolbar):
 *   expanding a lane now collapses whichever other lane was open. Widen
 *   back past 768px: desktop's own per-lane collapse state (from before
 *   you shrank the window) reappears untouched.
 * - A lane containing three items that all overlap in time renders
 *   visibly taller/wider (more stacked coloured blocks) than one whose
 *   items don't overlap.
 *
 * What to check against P3.4's (at >=768px):
 * - Scroll the timeline horizontally: the lane-label gutter on the left
 *   and the date axis at top both stay put; only the bars/diamonds/bands
 *   move.
 * - Pick a task whose start date lands exactly on a visible axis tick,
 *   at each of the five zooms: its bar's left edge lines up with that
 *   tick, not offset from it (R3 — bars anchor, never centre).
 * - A completed task/milestone is `bg-star`, an overdue incomplete one
 *   is `bg-rag-red`, one already underway is `bg-primary`, one that
 *   hasn't started is a hollow `border-subtle` outline. (Goal bands
 *   stopped following this classification in P4.2 — see that phase's
 *   note further down.)
 *
 * What to check against P3.5's (below 768px — devtools device toolbar,
 * set to something like 390px wide):
 * - Zoom defaults to "week" on first load at this width (reload the page
 *   at a narrow width without having touched the zoom selector first).
 * - Time now runs top to bottom; the date rail sticks to the left of
 *   whichever one lane is expanded as you scroll through it vertically.
 * - Three tasks that overlap in time land in side-by-side columns
 *   within the expanded lane, not stacked on top of each other — and
 *   the page stays usable (no horizontal overflow of the whole page,
 *   just of the lane's own item area if it needs it) at 390px.
 * - Scroll to the bottom of the page: content clears the mobile tab bar
 *   rather than sitting behind it.
 *
 * What to check against P3.6's (either breakpoint):
 * - A "Today" line crosses every lane at the current date, labelled, and
 *   simply isn't there if today falls outside the visible window rather
 *   than clamping to an edge.
 * - Scroll into the middle of a task/goal band wide (or tall, on mobile)
 *   enough to exceed the viewport: its label stays visible the whole
 *   time instead of scrolling away with the bar.
 * - A short task's label truncates with an ellipsis; hovering it shows
 *   the full title via the native tooltip.
 * - The financial horizon line, when you have at least one active
 *   `save_toward` goal with a computed `affordable_from`: a second,
 *   visually distinct (dashed, amber) line, labelled "Financial
 *   horizon". Absent entirely otherwise — not a line at epoch.
 *
 * What to check against P3.7's:
 * - Zoom in/out via the +/− buttons, the `+`/`-`/`=` keyboard shortcuts,
 *   and the select — all three land on the same zoom, and the same
 *   *date* stays centred every time (compare the visible window before/
 *   after; it should widen/narrow symmetrically around one fixed point,
 *   not slide). `scale.test.ts` covers the underlying invariant this
 *   relies on; this is the "does the UI actually exercise it" check.
 * - "Today" jumps the anchor back to today regardless of how far you've
 *   panned.
 * - Click any bar/diamond/band: navigates to `/goals/[id]` for that
 *   item's goal. Hovering (or Tab-focusing, for keyboard/screen-reader
 *   parity) shows a card bottom-right with title, relative dates, status,
 *   and — goals only, and only if you wire `scheduleVariances` — schedule
 *   variance. Owner shows a raw id here since this harness doesn't fetch
 *   `ownerNames` (a real page would, the same way it fetches `lifeAreas`).
 * - Set "Life area" to one specific area: lanes re-group to just that
 *   area's items *and* the network tab shows a fresh windowed fetch
 *   (P3.1's hook re-running on the new `lifeAreaId` filter) — "re-lanes
 *   and rewindows correctly" is really two separate things to watch for.
 * - Filter to a combination that matches nothing (e.g. a life area with
 *   no items, active-only with an owner who has none): the "nothing
 *   matches these filters" Fluffy state, distinct from — reload with no
 *   filters touched on a fresh/empty account, if you have one, to see —
 *   the "nothing here yet" one.
 *
 * Fetches this user's own `life_areas` directly (a real Supabase call,
 * not fake data) — reasonable for a dev-only harness; `TimelineView`
 * itself takes `lifeAreas` as a prop rather than fetching them, so a
 * real page can supply them from a server component instead (the
 * pattern already used for e.g. `GoalForm`). `today` is computed once
 * per mount from the browser's own timezone (R2) — a real page would get
 * this from `profiles.timezone` server-side instead; this harness has no
 * server render to do that in. `ownerNames`/`scheduleVariances`/`goalRag`
 * aren't wired here at all — all three are genuinely optional,
 * caller-supplied data `TimelineView` doesn't have the ingredients to
 * compute itself (see that component's own prop docs). Practically:
 * every goal band renders as a neutral `bg-muted` here (P4.2's
 * `ragFillClass` treats an unsupplied map the same as "no RAG data for
 * this goal"), not the four-way date classification goal bands used
 * before P4.2 — a real page supplying `goalRag` from `v_goal_rag` is
 * what brings the actual colours back.
 */
export default function TimelineDebugLanesPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const [lifeAreas, setLifeAreas] = useState<LifeAreaRow[]>([]);
  const [financialHorizon, setFinancialHorizon] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [today] = useState(() =>
    todayInZone(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date()),
  );

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void (async () => {
      const { data: auth } = await supabase.auth.getClaims();
      const userId = auth?.claims.sub;
      if (!userId) return;

      const [lifeAreasResult, horizonResult] = await Promise.all([
        supabase
          .from("life_areas")
          .select("*")
          .is("deleted_at", null)
          .order("sort_order"),
        // v_financial_horizon returns one row per profile RLS lets this
        // session see — which, per participants-section.tsx's existing
        // profile join, can include shared-goal collaborators, not just
        // your own row. The user_id filter is what narrows that down to
        // "mine", same "RLS is broader than the UI should allow" case
        // CLAUDE.md's server-action convention already documents.
        supabase
          .from("v_financial_horizon")
          .select("horizon_date")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      if (lifeAreasResult.error) {
        setLoadError(lifeAreasResult.error.message);
      } else {
        setLifeAreas(lifeAreasResult.data ?? []);
      }

      const horizonError = horizonResult.error;
      if (horizonError) {
        setLoadError((prev) => prev ?? horizonError.message);
      } else {
        setFinancialHorizon(horizonResult.data?.horizon_date ?? null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-8 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground font-sans text-sm">
          Dev-only · not part of the product
        </p>
        <h1 className="font-display text-3xl">Timeline lanes</h1>
        <p className="text-muted-foreground max-w-prose font-sans text-sm">
          Verification harness for <code>TimelineView</code>. See this
          file&rsquo;s module doc for exactly what to check.
        </p>
      </header>

      {loadError && (
        <p className="text-destructive font-sans text-sm">
          Couldn&rsquo;t load life areas: {loadError}
        </p>
      )}

      <TimelineView
        rangePx={RANGE_PX}
        lifeAreas={lifeAreas}
        today={today}
        financialHorizon={financialHorizon}
      />
    </main>
  );
}
