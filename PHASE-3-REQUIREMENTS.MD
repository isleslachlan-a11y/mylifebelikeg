# Phase 3 requirements — derived from the P0.8 spike

Source: `SPIKE-NOTES.md`, commit `e490b50` (spike code, deleted in `f9d8990`).
These are binding requirements for the real timeline, not suggestions.

---

## R1 — Sticky labels are a width problem, not a duration problem

The spike found that `overflow-hidden` on a tinted band clipped its sticky label's containing block, so the label vanished on scroll rather than sticking. Fix: tint and label as siblings, not nested.

**The generalisation matters more than the fix.** The trigger is *rendered pixel width*, not item duration. At week zoom a three-day task can be wider than the viewport; at year zoom a two-year goal might be 90px. So:

- Any item whose rendered width exceeds the viewport gets a sticky label, regardless of duration.
- Any item narrower than its label text gets truncation or a tooltip, regardless of duration.
- Both decisions are made from computed pixel width at the current zoom, never from `duration_days`.
- No element that needs to contain a sticky child may carry `overflow-hidden`. Rounded corners come from a sibling or a mask.

---

## R2 — "Today" has exactly one source, and it is timezone-derived

The spike hit a hydration mismatch from `new Date()` evaluating a few hundred milliseconds apart across server render and client hydration. The first fix — `useSyncExternalStore` with `Date.now()` as the snapshot — violated the "stable between calls" contract and produced an infinite render loop.

**There is a larger version of this bug.** Supabase runs the database in UTC. A Brisbane user (UTC+10) is a calendar day ahead of `current_date` for ten hours of every day. Migration `0010` fixes this server-side by deriving dates from `profiles.timezone`; the client must not reintroduce it.

Requirements:

- `today` is computed once per request from the user's `profiles.timezone` and passed down as a prop. No component calls `new Date()` or `Date.now()` for it.
- Never use a continuously changing value as a `useSyncExternalStore` snapshot. If a live-updating clock is ever wanted, the store must return a stable reference that changes only on a real tick.
- The timeline's `today` marker and the schedule variance number must agree. Both derive from the same timezone-resolved date.
- Post-move this stops being theoretical: two participants on one goal in different hemispheres. RAG anchors to the **goal owner's** timezone so a shared goal shows one set of numbers to everyone. The timeline marker is **viewer-local**. These will legitimately differ by a day; that is correct, not a bug, and the UI should not try to reconcile them.

---

## R3 — Bars anchor to their start date

The spike found bars centred on their start date, inherited from milestone-diamond positioning. Milestones are zero-duration points and *are* centred on their date; bars are intervals and anchor left (or top, vertically) at `computed_start`, extending by duration.

Add a visual regression check: a task starting exactly on a gridline must have its leading edge on that gridline at every zoom.

---

## R4 — Collision handling is required, and it is the real scope

The spike's most important finding: the readability limit isn't item count. The spike had no collision or stacking logic, so overlapping items in one lane break **immediately, not gradually**. Item-count thresholds are a red herring.

Phase 3 needs an interval-stacking algorithm:

- Within a lane, items that overlap in time occupy sub-rows. Lane height is dynamic, driven by the maximum overlap depth in the visible range.
- Overlap is computed in **pixels, not dates** — two items a day apart don't overlap at year zoom but their rendered labels certainly do. Include a minimum-gap constant.
- Sub-row assignment must be stable across zoom changes and scroll. An item jumping rows as you zoom is disorienting.
- Milestones sit in their own reserved sub-row, not interleaved with bars.

Budget for this properly. It is the single largest piece of Phase 3 and it wasn't in the original plan.

---

## R5 — Window by date range; don't virtualise a list

The spike measured a ~65,700px scroll container for a three-year span at week zoom. That width is not itself a problem — browsers handle far larger. The problem is rendering every item into it.

- Query and render only items intersecting the visible range plus a buffer of roughly one viewport either side. The `tasks_window_idx` index on `(computed_start, computed_end)` exists for exactly this.
- This is range windowing, not list virtualisation. Row-recycling libraries assume uniform rows and a single scroll axis; neither holds here.
- Profile the week-zoom container separately before shipping, as the spike recommends. If it does prove a problem, the fix is capping the scrollable span at that zoom rather than virtualising.

---

## R6 — Shared date math, separate layout constants

The spike found the date→pixel math transfers cleanly between orientations but the layout constants (lane sizing, which axis scrolls) do not.

- One shared module owns scale, ticks, and date↔pixel conversion. Orientation-agnostic.
- Two layout components — horizontal and vertical — each with their own constants. Do **not** force one component with an `orientation` prop and conditionals threaded through the layout code.
- Selection, filtering and collapse state live above both and survive the breakpoint switch.

---

## R7 — Re-add `d3-scale`

Removed in `f9d8990` since the spike was its only consumer. Phase 3 needs it back — not for the linear mapping, which is trivial, but for `scaleTime().ticks()`, which generates sensible date tick marks across zoom levels. Hand-rolling "nice" date ticks for week/month/year is a genuine time sink.

---

## Carried into Phase 3 unchanged

- Multi-year goals render as a tinted band across their own lane only (now a case of R1).
- Financial horizon line runs vertically across all lanes — it is a global constraint, not a per-lane one.
- Lane grouping toggles between Life Area (default), Owner, and Goal.
- On mobile, one lane expands at a time.