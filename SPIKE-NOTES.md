# Timeline spike notes

Findings from `src/app/spike/timeline` (P0.8), before it's deleted. Built with
a shared `Item`/`Lane` component pair taking an `orientation` prop, ~20 fake
items across 6 life areas, three zoom levels, d3-scale's `scaleTime` for the
date→pixel mapping and nothing else. Everything below is from actually
building and testing it — three real bugs got hit and fixed along the way,
not predicted in advance, and the answers below lean on what those bugs
actually were.

## Which zoom level was hardest, and why

**Year, for rendering density; week, for a completely different reason
(navigation, not rendering).** They're hard in different ways:

- **Year** is where the "how many items before it's unreadable" problem
  actually shows up (see below) — items compress into few enough pixels that
  milestones start sitting on top of band edges, and single-day items lose
  their label to truncation. This is a genuine rendering-density problem
  that gets worse, not different in kind, as more items get added.
- **Week** isn't hard to render — it's hard to *find anything in*. At
  60px/day, the full 3-year span is ~65,700px wide. Landing anywhere except
  exactly on today shows a near-empty screen with no indication which
  direction has content. The spike's "Today" button is a workaround, not a
  fix — a real implementation needs either a minimap/overview strip or
  zoom-level-aware default scroll targets, not just "scroll to today and
  hope."

The other three things worth knowing, all found by literally scrolling
around rather than by inspection:

1. **The sticky-label bug.** First attempt at the multi-year band nested the
   sticky title *inside* the tinted div and gave that div `overflow-hidden`
   for rounded corners. That clips the sticky element's containing block
   along with the visual, so once the band's own edges scroll past the
   viewport, the label has nowhere valid left to render — it doesn't stay
   pinned, it **vanishes entirely**. Fixed by splitting the tint and the
   label into sibling elements at the same box: the tint keeps
   `overflow-hidden` for its rounded corners, the label's box is never
   clipped. Confirmed by screenshotting before and after scrolling — before
   the fix the title was gone the moment the band's start scrolled off; after,
   it stays pinned exactly as intended.
2. **That fix is incomplete.** The sticky treatment only applies to items
   flagged `isMultiYear`. But scrolling into the *middle* of an ordinary
   multi-week task at week zoom (where it can be thousands of pixels wide)
   reproduces the identical symptom — the label is a plain child, not
   sticky, so it scrolls out of view just like the band did before the fix.
   The real trigger for "does this item need a pinned label" isn't calendar
   duration, it's **rendered pixel width at the current zoom** — a 3-month
   item at week zoom is exactly as wide as a multi-year item at month zoom.
   Phase 3 needs this keyed off `lengthPx > threshold`, computed per render,
   not off a fixed "over a year" flag.
3. **A hydration mismatch, then an infinite loop, from the same root cause.**
   The "today" marker used `new Date()` directly. Server render and client
   hydration happen a fraction of a second apart, so the two passes computed
   slightly different pixel offsets — real, reproducible hydration-mismatch
   console error. First fix reused the orientation-detection pattern already
   in the file (`useSyncExternalStore`) but passed `Date.now()` straight
   through as the snapshot — which broke a different rule: `getSnapshot` has
   to return a *stable* value between calls unless the store actually
   changed, and `Date.now()` is never equal to itself, so React treated
   every render as a fresh mismatch and looped until "Maximum update depth
   exceeded." Fixed by caching the first read. Two different hooks-adjacent
   footguns from one line of code — worth a checklist entry for Phase 3, not
   just a one-off fix.

## Shared component with an orientation prop, or two implementations?

**Shared for the positioning math, but the layout constants can't be shared
blindly — that's the real lesson, not a clean yes/no.**

The date→pixel math itself is genuinely orientation-agnostic: `scale(date)`
produces one number, and every place that number gets used is a single
ternary — `left/width` vs. `top/height`. That part stayed shared with no
real friction across the whole spike. That's the strongest argument *for*
one component.

But two things broke the assumption that shared also means "reuse the same
numbers":

- `LANE_SIZE` (72px) is a comfortable *row height* in horizontal mode and a
  cramped *column width* in vertical mode. Life-area names truncate hard on
  mobile ("Career & Learning" → "Care...") because the same constant is
  being asked to do two physically different jobs.
- The scroll-container overflow was set asymmetrically
  (`overflow-x-hidden` in vertical mode, on the assumption lanes always fit
  the cross-axis) and that assumption is wrong: 6 life-area columns at 72px
  is 432px, wider than a 390px phone. The "Us" lane is simply unreachable
  in vertical mode right now — not scrollable, not visible, gone.

Recommendation for Phase 3: keep the shared positioning core (it's the part
that's actually hard — date math, scale application, sticky-label logic —
and duplicating it would just mean two places to get it wrong), but make
sizing an explicit per-orientation config object rather than reusing the
same constants for both axes. And whichever axis is the "lane" axis needs
its own scroll affordance in *both* orientations — right now only the time
axis scrolls.

## How many items per lane before year view becomes unreadable

With this spike's data, the densest lane (Move & Home, 4 items) was still
individually readable at year zoom, but only just, and only because none of
its items overlap in time. The real threshold isn't item *count* — it's
whether items in the same lane overlap in time, because **this spike does
no collision detection or stacking at all.** Every item in a lane renders on
the same single row, centered. Two overlapping items in one lane don't
result in a "too crowded" lane — they render directly on top of each other,
illegibly, from the very first overlapping pair. That happens at 2 items,
not some larger number.

So: with non-overlapping items, readability degrades gradually and I'd put
the practical ceiling around 4–5 per lane at year zoom before labels start
truncating past usefulness. With overlapping items — which is the realistic
case for tasks and milestones on a real goal — it breaks at the *first*
overlap. Phase 3 needs per-lane sub-row stacking (the classic Gantt-chart
"pack overlapping intervals into as few rows as needed" algorithm) before
year zoom is usable with real data; this spike doesn't attempt it because it
was out of scope for a one-sitting spike, not because it looked easy to skip.

## Will virtualisation be needed for Phase 3?

**Not yet, and I'd resist adding it speculatively — but the scroll container
size, not the item count, is the thing to watch.**

With 21 items the DOM never got interesting — a few hundred absolutely
positioned divs is cheap regardless of zoom level. For a single user's own
goals/tasks/milestones, even fully populated over several years, item count
landing in the low hundreds seems far more likely than the thousands where
virtualization earns its complexity. I wouldn't build it for Phase 3 on
current evidence.

What I would flag instead: at week zoom, the scrollable content is already
~65,700px along the main axis for a 3-year span, built from a fixed
px-per-day constant. That's a container-*size* problem, independent of how
many items are in it — some browsers/OSes get janky with very large
scrollable regions regardless of child count. If week zoom stays supported
over multi-year spans (rather than, say, being disabled beyond some date
range from "today"), that's worth a real profiling pass with production-like
data before Phase 3 ships it, separately from any virtualization decision
about item count.
