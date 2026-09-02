# Performance budget

> **These are TARGETS, not measurements.** Every "Measured" cell below started
> blank because nothing had been measured yet. Filled in during two passes — P3.8
> (timeline/stacking/data layer/scroll container) and this Phase 5 follow-on
> (critical path) — with real numbers from real environments, never treated as
> observations to retrofit the targets around.
>
> A budget written after measuring is just a description of what you built.

## What this pass could and couldn't measure

This session has database access (`supabase db query` against the real, linked
project) and a Node/vitest environment, but no browser, no real mobile device,
and — this is the one that matters most below — **no realistic amount of data
in the live project** (one profile, a handful of goals). That splits every
section into three honest categories rather than two:

- **Genuinely measured, at the specified scale**: the stacking bucket (50
  items/1 lane) and the critical-path scheduler (50 tasks/30 edges) — both
  reproducible without needing real production data, so both were built as
  exact synthetic fixtures at the brief's own numbers. Critical-path timings
  were run against a temporary goal owned by the real account, timed with
  Postgres's own `clock_timestamp()`, then fully deleted afterward (`DELETE
... CASCADE`, verified empty).
- **Measured, but not at the specified scale, and flagged as such**: the
  `v_timeline_items` window query. `EXPLAIN ANALYZE` against the live project
  gives a real execution time and confirms the query plan actually uses
  `tasks_goal_idx` (0011) rather than a sequential scan — but the live project
  currently holds a handful of goals, not the ≥200-item dataset the test
  conditions call for. The number is real; the conditions aren't the ones this
  document asks for, so it's recorded as a sanity check, not a pass/fail
  result.
- **Not measurable from here at all**: everything that needs a browser, a
  device, or DOM/paint — first paint, zoom re-render, grouping-mode switch,
  scroll frame rate, lane expand/collapse, cache hit rate during a real scroll
  gesture, and the critical-path overlay render (which, additionally, doesn't
  exist yet — see that section). Left genuinely blank rather than guessed.

If you're reading this with real device/browser access, that's exactly what to
check next — `/timeline/debug-lanes` and `/timeline/debug-items` (dev-only,
`notFound()` in production) both have manual verification steps written into
their module docs.

## Test conditions

|         |                                                    |
| ------- | -------------------------------------------------- |
| Dataset | ≥200 timeline items, ≥6 lanes, 3-year span         |
| Desktop | Chrome, 1280×800, 6× CPU throttle                  |
| Mobile  | Real device, not emulator. Note model.             |
| Network | Fast 3G throttle for query timings                 |
| Build   | Production (`next build && next start`), never dev |

Dev-mode numbers are meaningless here — React's development build does extra
work on every render, and the difference is large enough to hide a real problem
or invent a fake one.

Where a "Measured" cell below wasn't produced under these exact conditions
(desktop timing at a synthetic scale, DB timing over a WAN connection to a
managed Postgres rather than local, etc.), that's noted directly under the
table rather than presented as if it met them.

---

## Targets

### Timeline render

| Metric                                | Target   | Ceiling          | Measured                    |
| ------------------------------------- | -------- | ---------------- | --------------------------- |
| First paint, month zoom, 200 items    | < 400 ms | 800 ms           | — not measured (no browser) |
| Zoom change, re-render                | < 150 ms | 300 ms           | — not measured (no browser) |
| Grouping mode switch                  | < 200 ms | 400 ms           | — not measured (no browser) |
| Scroll frame rate, month zoom, mobile | 60 fps   | 45 fps sustained | — not measured (no device)  |
| Lane expand/collapse                  | < 100 ms | 200 ms           | — not measured (no browser) |

Rationale: 150 ms is roughly the threshold at which an interaction stops feeling
instant. Frame rate matters more than any single render time — a dropped frame
mid-scroll is more noticeable than a slightly slow initial paint.

None of this section's five metrics have been measured in any pass to date —
P3.8 was explicit that it covered scroll container size and stacking cost
only, both DOM-free. All five need `next build && next start`, a real desktop
Chrome session (throttled 6×), and — for the frame-rate row — a real phone.

### Stacking (`assignSubRows`)

| Metric                   | Target      | Ceiling | Measured                                                                      |
| ------------------------ | ----------- | ------- | ----------------------------------------------------------------------------- |
| 50 items, one lane       | < 5 ms      | 15 ms   | **0.057 ms**, depth 50 (Node, this pass)                                      |
| 200 items across 6 lanes | < 20 ms     | 50 ms   | **0.794 ms**, 240 items/6 lanes, depth 51 total (Node, P3.8)                  |
| Called per zoom change   | 1× per lane | —       | Confirmed by construction (P3.8's memoisation fix, keyed on `scale.pxPerDay`) |

This runs on every zoom change per lane. Memoise on `(items, zoom, laneKey)`.
If it exceeds the ceiling, the deterministic sort is the likely cause —
precompute the sort key rather than sorting inside the hot path.

Both real numbers come from `src/lib/timeline/perf.test.ts` — the 50-item/1-lane
case is a new test added this pass (`PERF-BUDGET.md: stacking bucket exactly as
specified`), deliberately built with heavy overlap (every item shares a start
with the one two before it, driving the whole lane to depth 50) so it isn't a
best-case empty stack. The 200-item/6-lane row reuses P3.8's own 240-item
dataset rather than re-deriving a separate fixture — it already exceeds this
row's minimum. At 10× scale (2,400 items), `assignSubRows` measured 4.022 ms
this run (was 3.811 ms in P3.8 — noise, not a regression, both wells inside
the stress test's own 200 ms non-gating check) — roughly linear, consistent
with the O(n log n) sort dominating rather than any accidental O(n²)
comparison.

### Data layer

| Metric                           | Target   | Ceiling | Measured                                                                                 |
| -------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------- |
| `v_timeline_items` window query  | < 100 ms | 250 ms  | **0.152 ms execution** (see caveat below — wrong scale)                                  |
| Queries fired scrolling one year | ≤ 4      | 8       | ≤ 1, by-hand trace (P3.8, unchanged code)                                                |
| Cache hit rate, scroll-back      | > 90%    | —       | — not measured (needs a real scroll gesture)                                             |
| Debounce delay                   | 150 ms   | —       | **150 ms** — `DEFAULT_DEBOUNCE_MS` in `use-timeline-items.ts`, read directly from source |

Query count is the one to watch. A debounce that isn't working shows up as
dozens of queries rather than as a slow query.

**The `v_timeline_items` row doesn't meet this document's own test
conditions and shouldn't be read as a pass.** `EXPLAIN ANALYZE` against the
real, linked project for a 2-year window (`ends_on >= current_date - 1 year
and starts_on <= current_date + 1 year`) gives:

```
Planning Time: 2.267 ms
Execution Time: 0.152 ms
```

but the live project currently has a handful of goals, not ≥200 timeline
items — every branch in the plan is a cheap sequential scan over a tiny table
except the tasks branch, which does use `tasks_goal_idx` (confirms 0011's
range index is live and chosen by the planner, at least). A real answer needs
either a seeded ≥200-item fixture in a disposable project, or `pgbench`-style
synthetic load against a throwaway database — neither of which this pass
attempted, since fabricating 200+ rows of fake timeline data in the one real,
shared production project (to then delete) was judged a worse trade than
leaving this honestly unresolved. The "≤ 1 query scrolling a year" and
"150 ms debounce" rows don't have this problem: the first is a trace of fixed
logic independent of data volume, and the second is a source-level constant.

### Scroll container

| Metric                     | Target      | Ceiling   | Measured                                                             |
| -------------------------- | ----------- | --------- | -------------------------------------------------------------------- |
| Container width, week zoom | < 20,000 px | 50,000 px | **= rangePx** (tested 800/1000/2400px), verified structurally (P3.8) |
| Container width, day zoom  | < 5,000 px  | 15,000 px | **= rangePx**, same as above — independent of zoom (P3.8)            |

The P0.8 spike measured ~65,700 px at week zoom for a three-year span. The
P3.0 zoom-dependent domain caps should have retired this. **Verify rather than
assume** — if a zoom still produces an enormous container, cap the domain
further. Do not reach for virtualisation to solve it.

Confirmed already correct, not re-derived this pass: `createScale`'s domain is
zoom-capped (`ZOOM_CONFIG`), so container width is `rangePx` — caller-chosen,
independent of both zoom and how much data exists — for every zoom level, not
only week. See `PERF-NOTES.md` #1 for the full derivation.

### Critical path (Phase 5)

| Metric                                        | Target   | Ceiling | Measured                                                                  |
| --------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------- |
| `recompute_goal_schedule`, 50 tasks, 30 edges | < 50 ms  | 150 ms  | **~14.2 ms avg** (5 runs, 13.6–15.4 ms)                                   |
| Cascade on goal start date change             | < 200 ms | 500 ms  | **35.5 ms** cold, **0.2–0.6 ms** warm-cache (see note)                    |
| Critical path overlay render                  | < 50 ms  | 100 ms  | **0.209 ms** — routing/filtering only, same 50/30 bucket (see note below) |

The scheduler runs in Postgres on every dependency and duration change. It
iterates to a fixed point, so cost scales with graph depth rather than task
count — a long chain is worse than a wide one.

**Methodology.** Both scheduler rows were measured against a real, temporary
goal owned by the actual account on the live project — 50 tasks, 30 edges
(a near-full serial chain: `T1 -> T2 -> ... -> T30`, plus `T1 -> T30` directly,
the worst-case-ish shape this section's own rationale calls out: "a long chain
is worse than a wide one"), created via genuine `INSERT`s so the real triggers
(`tasks_recompute_network`, `task_dependencies_recompute`) did the work, not a
direct function call standing in for them. Deleted afterward
(`DELETE ... CASCADE` on the goal), confirmed empty. Timed with a single-round-trip
`clock_timestamp()` delta (`WITH t0 AS (SELECT clock_timestamp())
UPDATE/SELECT ... RETURNING extract(milliseconds FROM (clock_timestamp() - t0.ts))`)
rather than a wall-clock measurement wrapping a separate client round trip, so
network latency to the pooler (`ap-northeast-1`) is mostly excluded from the
number itself — though each of the 5 `recompute_goal_schedule` runs was still
its own connection, so some per-call overhead is baked in; the real
in-database cost is likely a little lower than 14 ms, not higher.

**The cold/warm split on the cascade row is real and worth understanding, not
noise.** The first `UPDATE goals SET start_date = start_date + 1` after the
network was built took 35.5 ms; the next two took 0.25 ms and 0.18 ms. This is
Postgres's buffer cache: the first run has to read the goal's 50 tasks and 30
dependency rows from disk (or the connection pooler's cold cache) into shared
buffers; every subsequent run on the same rows is served from memory. A real
user's first edit in a session is the 35.5 ms case, not the 0.2 ms one — that's
the number to compare against the 200 ms target, and it clears it by a wide
margin regardless.

**The overlay row is now partially measured, and the rest is still honestly
open.** P5.1 wired `is_critical` (0022's migration) and `task_dependencies`
into the cross-goal timeline: a critical task gets an outline treatment, and
`CriticalPathArrows` (in both `horizontal-timeline.tsx` and
`vertical-timeline.tsx`) draws right-angle routes between critical tasks via
`critical-path.ts`'s `selectCriticalPathEdges` + `routeOrthogonal`. What's
measured above is exactly that pure routing/filtering cost, at the same
50-task/30-edge bucket the scheduler rows use (`perf.test.ts`, "critical path
overlay routing") — **not** the actual SVG paint, which still needs a real
browser and isn't measurable from here, same caveat as the timeline-render
section above. The number is small enough (0.209 ms, comfortably under even
the stacking budget's per-frame ceiling) that routing itself is very unlikely
to be the bottleneck if this row's target is ever missed in a browser — paint
cost, not JS cost, would be the thing to profile first.

---

## What to do when a ceiling is breached

In order of preference, cheapest first:

1. **Memoise.** Most re-render cost is recomputation of unchanged values.
2. **Narrow the window.** Reduce the buffer before reducing what's rendered.
3. **`content-visibility: auto`** on lane containers. One CSS line, and it skips
   layout for off-screen lanes entirely.
4. **Cap the zoom domain.** Cheaper than any rendering change.
5. **Virtualise.** Last resort. Row-recycling libraries assume uniform heights
   and one scroll axis; neither holds here, so this means writing it yourself.

---

## Log

Append each measurement run: date, commit, device, what changed. A single
snapshot tells you whether you're fast today; a series tells you what made you
slow.

| Date       | Commit                  | Device                                                  | Change                         | Notes                                                                                                                                                                                                                                                         |
| ---------- | ----------------------- | ------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-25 | `21d9adb` (P3.8)        | Node (no browser/device this pass)                      | P3.0–P3.7 timeline work        | Scroll container size and stacking cost measured for real; frame rate and query count traced/reasoned, not measured. Found and fixed a real (if small) `assignSubRows` memoisation bug. See `PERF-NOTES.md`.                                                  |
| 2026-08-28 | `6c76a21` (Phase 5 CPM) | Node + live DB (`supabase db query`), no browser/device | Critical-path scheduler (0021) | First budget pass to include this file. Measured the 50-item/1-lane stacking bucket and both critical-path scheduler rows for real; `v_timeline_items` measured but flagged as wrong-scale; timeline-render section and the overlay row remain entirely open. |
