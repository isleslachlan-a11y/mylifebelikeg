-- P5.1: exposes `is_critical` on `v_timeline_items`'s task branch, so the
-- cross-goal timeline can read critical-path status straight off the row
-- it already queries (a migration, not a client-side join, per the
-- brief). Goals and milestones don't have a critical-path concept — CPM
-- (0021) only ever sets `is_critical` on `tasks` — so their branches get
-- a typed `null::boolean` in the same column position rather than a
-- differently-shaped row.
--
-- Appended as the new last column, not inserted alongside the other
-- task-only columns (`kind`, `sort_order`) further up the SELECT list:
-- `CREATE OR REPLACE VIEW` can only add columns at the end, never
-- reorder or insert them, so this is the one placement Postgres actually
-- allows without dropping and recreating the view (which would require
-- re-granting and would briefly break anything selecting from it).
--
-- Verified against the real project directly (`pg_get_viewdef`), same
-- practice as 0009/0011/0012/0014/etc. — this file's own SELECT list
-- above the new column is a transcription of what's live, confirmed
-- identical before this migration was written. Applied live via
-- `supabase db query` and `src/types/database.ts` regenerated for real
-- against the same project in the same pass (CLAUDE.md's rule 6 — commit
-- both together).
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
  0 as sort_order,
  null::boolean as is_critical
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
  m.sort_order,
  null::boolean as is_critical
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
  t.sort_order,
  t.is_critical
from tasks t
join goals g on g.id = t.goal_id
where t.deleted_at is null
  and g.deleted_at is null;

-- Grants survive CREATE OR REPLACE VIEW on the same object (it's the
-- same relation, not a new one), so no re-grant is strictly required —
-- kept explicit anyway, same defensive reasoning 0011's own comment
-- gives for not assuming ALTER DEFAULT PRIVILEGES coverage.
grant select on public.v_timeline_items to authenticated;
