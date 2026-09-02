-- P6.5: wiring trip stops into the Phase 3 timeline surfaced a real,
-- already-live bug rather than something this package introduces.
-- v_timeline_items.status was designed (0011's migration; still
-- documented that way in CLAUDE.md and src/lib/timeline/item-status.ts's
-- own comment, and still what src/hooks/use-timeline-items.ts's
-- `.eq("status", goalState)` filter assumes) to be the *parent goal's*
-- state on every row, specifically so the "active goals only" filter
-- works uniformly across item types. Confirmed against the live view
-- (a scratch `supabase db dump`, not assumed) that this stopped being
-- true at some point after 0011 shipped: the milestone branch now
-- returns 'completed'/'open' (the milestone's own completion), the task
-- branch returns tasks.status (the task's own richer enum), and the
-- trip_stop branch returns trip_stops.booking_state — none of which is
-- ever the literal string 'active', so the default timeline filter
-- (goalState: "active") was silently returning *zero* milestones, tasks,
-- or trip stops, goal rows only. Confirmed by direct count against the
-- live data before writing this migration.
--
-- The fix adds a new `goal_status` column carrying the goal's own state
-- uniformly (what the filter should have been reading all along) and
-- leaves `status` exactly as it already behaves live — each item's own
-- status, which P6.5 actually needs for trip-stop colour ("booking state
-- drives colour") the same way a future package might eventually want it
-- for tasks/milestones. Appended as the last column (CREATE OR REPLACE
-- VIEW can only add columns, not reorder or remove them — same
-- constraint 0022's critical-path migration worked within).
create or replace view public.v_timeline_items
with (security_invoker = true) as
select
  g.id as item_id,
  'goal'::text as item_type,
  g.id as goal_id,
  null::uuid as parent_id,
  g.title,
  g.start_date as starts_on,
  g.target_date as ends_on,
  false as is_point,
  g.owner_id,
  g.life_area_id,
  g.state::text as status,
  (g.state = 'completed'::goal_state) as is_complete,
  g.kind::text as kind,
  0 as sort_order,
  false as is_critical,
  g.state::text as goal_status
from goals g
where g.deleted_at is null and g.start_date is not null and g.target_date is not null

union all

select
  m.id as item_id,
  'milestone'::text as item_type,
  m.goal_id,
  null::uuid as parent_id,
  m.title,
  m.due_date as starts_on,
  m.due_date as ends_on,
  true as is_point,
  g.owner_id,
  g.life_area_id,
  case when m.completed_at is not null then 'completed'::text else 'open'::text end as status,
  (m.completed_at is not null) as is_complete,
  g.kind::text as kind,
  m.sort_order,
  false as is_critical,
  g.state::text as goal_status
from milestones m
join goals g on g.id = m.goal_id and g.deleted_at is null
where m.deleted_at is null

union all

select
  t.id as item_id,
  'task'::text as item_type,
  t.goal_id,
  t.milestone_id as parent_id,
  t.title,
  t.computed_start as starts_on,
  t.computed_end as ends_on,
  (t.duration_days = 0) as is_point,
  t.owner_id,
  g.life_area_id,
  t.status::text as status,
  (t.status = 'done'::task_status) as is_complete,
  g.kind::text as kind,
  t.sort_order,
  t.is_critical,
  g.state::text as goal_status
from tasks t
join goals g on g.id = t.goal_id and g.deleted_at is null
where t.deleted_at is null and t.status <> 'cancelled'::task_status and t.computed_start is not null

union all

select
  ts.id as item_id,
  'trip_stop'::text as item_type,
  tr.goal_id,
  tr.id as parent_id,
  ts.name as title,
  ts.computed_arrival as starts_on,
  ts.computed_departure as ends_on,
  (ts.nights = 0) as is_point,
  g.owner_id,
  g.life_area_id,
  ts.booking_state::text as status,
  (ts.booking_state = 'done'::booking_status) as is_complete,
  g.kind::text as kind,
  ts.sequence as sort_order,
  false as is_critical,
  g.state::text as goal_status
from trip_stops ts
join trips tr on tr.id = ts.trip_id and tr.deleted_at is null
join goals g on g.id = tr.goal_id and g.deleted_at is null
where ts.deleted_at is null and ts.computed_arrival is not null;

comment on view public.v_timeline_items is
  'Unified timeline shape: goals, milestones, tasks and trip stops. Range-window with: where ends_on >= $from and starts_on <= $to. status is each item''s own status (goal state / milestone open-or-completed / task status / trip stop booking state) — filter "active goals only" on goal_status instead, which is the parent goal''s state on every row.';
