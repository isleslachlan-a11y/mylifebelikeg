-- P3.1: v_timeline_items, one shape unioning goals, milestones and tasks so
-- the timeline's data layer can query a single relation instead of three,
-- plus the three range indexes P3.1 windows against.
--
-- Numbering: last committed migration is 0009. PHASE-3-REQUIREMENTS.MD's R2
-- names "migration 0010" for the today()/timezone fix specifically — that's
-- a distinct, not-yet-written package (the "today" derivation), not this
-- one, so this file takes 0011 rather than 0010 to avoid colliding with it
-- once it's authored. Like 0009, this has no committed 0001-0008 to build
-- on top of (CLAUDE.md's Database section) and hasn't been run through
-- supabase/local's scratch-Postgres replay for the same reason — reviewed
-- by hand against src/types/database.ts (the generated source of truth for
-- current column/enum shapes) instead. Review this by hand before applying,
-- per DEPLOYMENT.md.
--
-- Shape (fixed by the P3.1 brief): item_id, item_type, goal_id, parent_id,
-- title, starts_on, ends_on, is_point, owner_id, life_area_id, status,
-- is_complete, kind, sort_order.
--
-- Column decisions:
-- * `status` is the *parent goal's* state (goal_state: active / someday /
--   completed / archived / abandoned) on every row, not each item's own
--   status vocabulary — milestones only have completed_at and tasks have a
--   differently-shaped task_status enum, neither of which shares a domain
--   with the other. Denormalizing the goal's state onto every row is what
--   makes "goal state (active only by default)" filterable with one
--   `.eq("status", ...)` across all three item types without an extra join
--   at query time. Each item's own completion is `is_complete` instead.
-- * `is_complete`: goals.state = 'completed'; milestones.completed_at is
--   not null; tasks.status = 'done'.
-- * `kind` carries the parent goal's goal_kind (standard/trip) onto every
--   row, same denormalize-for-query-simplicity reasoning as `status` — a
--   trip's milestones/tasks are identifiable without re-joining goals.
-- * `parent_id`: null for goals (they're the root); a milestone's parent is
--   its goal; a task's parent is its milestone if it has one, else its
--   goal. Gives callers one column to walk the natural tree instead of
--   branching on item_type.
-- * `is_point`: true for milestones (zero-duration by definition, R3);
--   true for a task with duration_days = 0; false for goals and every
--   other task, even one whose start/end happen to coincide — a
--   zero-*width* bar is still a bar, and R3 draws the point/bar
--   distinction from the schema (duration_days), not from rendered width.
-- * starts_on/ends_on come from goals.start_date/target_date,
--   milestones.due_date (both columns), and tasks.computed_start/
--   computed_end (the scheduler's caches — CLAUDE.md rule 5) respectively.
--   Rows with a null bound (e.g. a goal with no target_date) sort
--   themselves out of range-window queries for free: a null on either side
--   of `where ends_on >= $from and starts_on <= $to` is neither true nor
--   false, so the row is excluded rather than erroring — there's nothing
--   to place on the timeline anyway.
--
-- Soft deletes: all three source tables filter out deleted_at is not null,
-- same convention as v_monthly_cashflow (0009).
--
-- SECURITY INVOKER (default from Postgres 15+, explicit here anyway) so
-- this view enforces the querying user's own RLS on goals/milestones/tasks
-- rather than the view owner's — required per CLAUDE.md rule 3. No
-- additional filtering is needed in the view itself for that reason: a
-- collaborator who can't see a given goal can't see its milestones/tasks
-- through this view either, because the underlying table policies are
-- evaluated per row, per querying user, same as querying the tables
-- directly.
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
  (g.state = 'completed') as is_complete,
  g.kind::text as kind,
  0 as sort_order
from goals g
where g.deleted_at is null

union all

select
  m.id as item_id,
  'milestone'::text as item_type,
  m.goal_id,
  m.goal_id as parent_id,
  m.title,
  m.due_date as starts_on,
  m.due_date as ends_on,
  true as is_point,
  g.owner_id,
  g.life_area_id,
  g.state::text as status,
  (m.completed_at is not null) as is_complete,
  g.kind::text as kind,
  m.sort_order
from milestones m
join goals g on g.id = m.goal_id
where m.deleted_at is null
  and g.deleted_at is null

union all

select
  t.id as item_id,
  'task'::text as item_type,
  t.goal_id,
  coalesce(t.milestone_id, t.goal_id) as parent_id,
  t.title,
  t.computed_start as starts_on,
  t.computed_end as ends_on,
  (t.duration_days = 0) as is_point,
  t.owner_id,
  g.life_area_id,
  g.state::text as status,
  (t.status = 'done') as is_complete,
  g.kind::text as kind,
  t.sort_order
from tasks t
join goals g on g.id = t.goal_id
where t.deleted_at is null
  and g.deleted_at is null;

-- Explicit grant, not inherited — same reasoning as 0009: nothing here can
-- see whether an earlier, uncommitted migration used ALTER DEFAULT
-- PRIVILEGES for future public views, so grant directly rather than assume.
grant select on public.v_timeline_items to authenticated;

-- Range indexes for P3.1's windowed query (`where ends_on >= $from and
-- starts_on <= $to`), one per source table since the view itself can't be
-- indexed directly. Partial on deleted_at is null to match the view's own
-- filtering and keep soft-deleted rows out of the index.
create index if not exists goals_range_idx
  on goals (start_date, target_date)
  where deleted_at is null;

create index if not exists milestones_range_idx
  on milestones (due_date)
  where deleted_at is null;

create index if not exists tasks_range_idx
  on tasks (computed_start, computed_end)
  where deleted_at is null;
