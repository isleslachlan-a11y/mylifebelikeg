# Performance notes — P3.8

Findings from Phase 3's performance pass, before the timeline ships. This
is the baseline PHASE-3-REQUIREMENTS.MD/the P3.8 brief say Phase 5
(critical-path highlighting, another per-render pass on top of what's
here) needs to compare against — rerun `npx vitest run
src/lib/timeline/perf.test.ts --reporter=verbose` and diff against the
numbers below.

## What this could and couldn't measure

This session has no browser access — no login, no devtools, no real or
simulated device. That splits P3.8's four checklist items into two
categories:

- **Genuinely measured**, with real numbers, in Node via
  `src/lib/timeline/perf.test.ts`: scroll container size at week zoom,
  and stacking cost. Both are pure logic (`createScale`, `groupIntoLanes`,
  `assignSubRows`) with no DOM involved, so they're exactly as measurable
  here as anywhere.
- **Not measurable from here at all**: actual scroll frame rate on a real
  or emulated device, and — beyond a code-level trace — real network
  query counts during an actual scroll gesture (that needs a running app,
  a session, and a browser to scroll). What's recorded for these two is
  either a considered proactive change (frame rate) or a careful by-hand
  trace of the actual debounce/cache code (query count), clearly labelled
  as such rather than presented as an empirical result it isn't.

If you're reading this with real device/browser access, the two
unmeasured items are exactly what to check first — `/timeline/debug-lanes`
and `/timeline/debug-items` (dev-only, `notFound()` in production) both
have manual verification steps written into their module docs already.

## Dataset

`src/lib/timeline/perf.test.ts`'s `generateDataset()`: 24 goals across 6
life areas (lanes, in Life Area grouping mode) spanning 3 years from
2024-01-01, each goal with 3 milestones and 6 tasks (some deliberately
overlapping in pairs/triples, so the stacking algorithm's actual
collision path is exercised, not its cheap no-overlap branch) —
**240 items total**, exceeding the brief's 200-item/6-lane/3-year minimum.
Deterministic (no `Math.random`), so numbers are reproducible across
runs. A 10x variant (2,400 items) checks where the curve bends.

## 1. Scroll container size at week zoom

**Finding: the spike's ~65,700px problem cannot occur in this
architecture, structurally — verified directly, not by rendering
anything.**

The spike's container width scaled with *calendar span × a fixed
px/day*, so a three-year span at a fine zoom produced an enormous
container. This codebase's `createScale(zoom, anchor, rangePx)` (P3.0)
inverts that relationship: `rangePx` is fixed by the caller (the
viewport), and the *domain* — which dates fit into that fixed pixel
range — is what's capped per zoom (`ZOOM_CONFIG`, `week` -> 182 days
max). Container width is therefore `rangePx` always, for every zoom
level, independent of both the zoom and how much data exists:

```
[perf] verified directly: createScale("week", ...).toPixel(domain[1]) === rangePx
[perf] verified directly: createScale("year", ...).toPixel(domain[1]) === rangePx
                            (checked at rangePx = 800, 1000, 2400)
[perf] week zoom's domain span: 182 days (ZOOM_CONFIG.week.maxSpanDays), not 3 years
```

**Nothing changed here.** This is a "confirmed already correct"
finding, not a fix — recorded per the brief's own instruction ("if
nothing needed changing, record that too").

## 2. Stacking cost

**Finding: `assignSubRows` is not measurably hot at realistic scale —
but a real, free memoisation bug was found and fixed anyway, for
Phase 5's headroom.**

Raw cost, in Node, on the 240-item dataset (`month` zoom, one pass
across all 6 lanes, as a single render would do):

```
[perf] groupIntoLanes: 240 items -> 6 lanes in 0.194ms
[perf] assignSubRows x 6 lanes (240 items total): 0.794ms, total depth 51
```

Both comfortably inside a 16.7ms (60fps) frame budget, with headroom to
spare. At 10x scale (2,400 items, stress-testing beyond the brief's
minimum to see where the curve bends):

```
[perf] assignSubRows x 6 lanes (2400 items total, 10x): 3.811ms
```

Roughly linear (0.8ms -> 3.8ms for 10x the items), consistent with the
algorithm's O(n log n) sort dominating rather than any accidental O(n²)
comparison — and P3.1's range windowing means the app would never
actually hold 2,400 items in memory/DOM at once regardless.

**The bug**: `horizontal-timeline.tsx`/`vertical-timeline.tsx` memoised
`assignSubRows` on `[lane.items, scale]` — but `scale` gets a *new
object identity* on every pan (`TimelineView`'s
`createScale(zoom, anchor, rangePx)` reruns whenever `anchor` changes,
not just `zoom`), even though `assignSubRows`'s actual *output* (which
sub-row each item lands in) is mathematically invariant to `anchor` at a
fixed zoom: relative pixel distance between two dates is
`pxPerDay × days-apart`, which depends only on zoom (via `pxPerDay`)
and the dates themselves, never on where the domain starts. Every pan
step was silently re-running full stacking for every visible lane, for
no reason.

Measured the actual cost of this before fixing it — 30 simulated pan
steps at a fixed zoom, unmemoised, across the 240-item dataset:

```
[perf] 30 pan steps x 6 lanes, unmemoised: 5.899ms total, 0.197ms/step
```

**This is not a real problem at this scale** — 0.2ms of wasted work per
pan step is invisible next to a 16.7ms frame budget. Fixed anyway
(`useMemo` now keys on `scale.pxPerDay`, a zoom-derived primitive,
instead of the whole `scale` object — see both files' inline comments)
because it's free, correct, and directly the kind of redundant
per-render work that stops being free once Phase 5 adds a second pass
(critical-path highlighting) on top of it. `HorizontalTimelineScale`/
`VerticalTimelineScale` both gained a `pxPerDay: number` field to
support this.

The brief's fallback suggestion — "if it's still hot, precompute the
sort key" — wasn't needed. It wasn't hot.

## 3. Scroll frame rate

**Not measurable here — no browser.** What was done instead: added
`content-visibility: auto` to `horizontal-timeline.tsx`'s per-lane body
container, the brief's own suggested cheap lever, ahead of any measured
need, specifically because it's a well-understood, low-risk technique
(lets the browser skip layout/paint for a lane scrolled off the page)
and P3.1's range-windowing already means the DOM node count this
protects against is bounded, not unbounded.

**Checked against R1 before adding — this deserved real scrutiny**:
`content-visibility: auto` implies `contain: paint`, which clips
descendants to the container's own box — the same clipping *mechanism*
`overflow-hidden` uses, which is exactly what broke the spike's sticky
labels. The reasoning it's safe here: `ItemLabel`'s sticky span only
ever needs to render somewhere within `[0, rangePx]` — the lane body's
own full width, which is the entire scrollable domain, not a
viewport-sized window into it. There's nothing outside that box for the
clip to cut off. This is sound as a static analysis but **has not been
confirmed by an actual render** — worth a real-browser check before
trusting it further, and flagged inline in the component itself, not
just here.

**Deliberately not applied to `vertical-timeline.tsx`.** Its single
expanded lane's own scroll container can span years (`rangePx` can be
large) and is the thing a mobile user actually scrolls through — but
`content-visibility: auto`'s skip decision is per-element and binary
(the whole subtree renders or none of it does), based on whether *that
element's own bounding box* intersects the viewport. A container taller
than its scroll viewport, while the user is scrolled somewhere inside
it, always still intersects — so it would essentially never actually
skip anything during normal use. Applying it there would add the same
unverified containment risk as above for no measurable benefit, so it
was left out. If a future windowing pass ever chunks vertical's item
area into discrete, individually-sized sections (e.g. per month), *that*
would be the right place for this technique on mobile.

## 4. Query count

**Not run empirically (needs a live scroll gesture in a browser) — this
is a by-hand trace of `use-timeline-items.ts`'s actual debounce/cache
code**, re-read fresh for this pass rather than assumed unchanged since
P3.1.

At `month` zoom, `maxSpanDays = 730` (per `ZOOM_CONFIG`), so the visible
window is a fixed 2-year span and the buffer on each side ("roughly one
viewport", per R5) is another 2 years — a cached/covered range 6 years
wide, centred on wherever the last fetch's anchor was. Panning by `X`
days from that anchor stays within the same covered range (no new
fetch) as long as `X <= 730` — i.e. **panning up to two years in one
direction fires zero additional queries** beyond the one that covered
the starting position. "Scrolling a year" (365 days, the brief's own
example) is half that threshold: by this trace, it should fire **at
most 1 query total** — the initial load — not "dozens."

Native free-scrolling within whatever's already rendered doesn't touch
`anchor` at all (P3.7 already notes this — `anchor` only moves via the
pan/zoom/today controls), so it can't trigger a fetch regardless of
distance; it also can't reveal data beyond the currently-rendered
`rangePx` window, a known, already-documented limitation from P3.7, not
new here.

This trace didn't turn up a change to make. `/timeline/debug-items`
already logs every real fetch to the console (P3.1) — that's the
empirical confirmation this trace predicts, for whenever a real browser
is available to run it.

## Summary of changes

- `horizontal-timeline.tsx`, `vertical-timeline.tsx`: `assignSubRows`
  memoisation now keys on `scale.pxPerDay` instead of the whole `scale`
  object, eliminating a real (if currently small) per-pan-step
  recomputation of every visible lane's stacking.
- `horizontal-timeline.tsx`: `content-visibility: auto` +
  `containIntrinsicSize` added to each lane's body container.
- `src/lib/timeline/perf.test.ts`: new — the realistic dataset generator
  and the timing assertions above, doubling as a regression guard
  (`npm test` runs it every time) and a rerunnable benchmark for future
  phases.
- Everything else in this document is a confirmed-correct or
  traced-correct finding with nothing to change.
