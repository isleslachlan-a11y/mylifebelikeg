-- Phase 5: critical-path scheduling. Same situation 0014/0016/0018 were
-- in — this documents what's already live rather than introducing new
-- behaviour. `app.recompute_goal_schedule` already existed (part of the
-- original uncaptured schema, pre-dating every committed migration in
-- this repo) as a plain offset-only scheduler; it and
-- `app.cascade_goal_start_date` have since been replaced live with the
-- CPM-aware versions below, and two new trigger functions
-- (`recompute_after_task_change`, `recompute_on_dependency_change`) plus
-- two new triggers were added to actually invoke it on task/dependency
-- changes, not just on the goal's own start_date changing. Verified
-- against the real project directly (`supabase db dump --schema app`,
-- plus `pg_trigger`/`pg_get_triggerdef` for the trigger wiring) — not
-- hand-derived — and against `supabase/local/008 critical path test`,
-- which exercises exactly the behaviour this file captures.
--
-- The forward/backward pass is a fixed-point relaxation over a
-- temporary table, not a topological sort — deliberately: task_dependencies
-- already rejects cycles at write time (`prevent_dependency_cycle`,
-- pre-existing), so the graph is guaranteed a DAG, and iterating to a
-- fixed point needs no separate topological ordering step. Iteration is
-- capped at `2 * task_count + 10` as a termination guarantee, not a
-- performance optimisation — on an acyclic graph the forward pass
-- converges in at most (longest chain length) iterations, so the cap is
-- generous headroom, not a tuned limit.
--
-- Layering, not a replacement: `tasks_derive_dates` (BEFORE trigger,
-- pre-existing, untouched) still writes the simple offset-only
-- computed_start/computed_end on every insert/update — cheap, and
-- correct for the common no-dependencies case. `tasks_recompute_network`
-- (AFTER, new) only escalates to the full CPM pass when
-- `app.goal_has_dependencies` is true, immediately overwriting the
-- BEFORE trigger's simple values with the network-aware ones. A goal
-- with zero dependencies never pays for CPM at all —
-- `recompute_goal_schedule` itself has an early "simple case" branch for
-- exactly this, independent of which trigger called it.
create or replace function app.goal_has_dependencies(p_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
    from task_dependencies td
    join tasks t on t.id = td.successor_task_id
    where t.goal_id = p_goal_id and t.deleted_at is null
  );
$$;

-- The goal's projected finish — the latest computed_end among its
-- non-cancelled tasks. Used by the 008 test and by whatever surfaces
-- "projected end" in the UI going forward; not yet wired to any page
-- (that's a future package, not this migration's job).
create or replace function app.goal_projected_end(p_goal_id uuid)
returns date
language sql
stable
security definer
set search_path = public, app
as $$
  select max(computed_end)
  from tasks
  where goal_id = p_goal_id and deleted_at is null and status <> 'cancelled';
$$;

create or replace function app.recompute_goal_schedule(p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_start     date;
  v_rows      integer;
  v_iter      integer := 0;
  v_max_iter  integer;
  v_proj_end  integer;
begin
  select start_date into v_start from goals where id = p_goal_id;

  -- No goal start date: nothing is derivable. Null rather than guess.
  if v_start is null then
    update tasks
       set computed_start = null, computed_end = null,
           total_float_days = null, is_critical = false
     where goal_id = p_goal_id
       and (computed_start is not null or computed_end is not null
            or total_float_days is not null or is_critical);
    return;
  end if;

  -- ---- Simple case: no dependencies. Straight offsets, no float, no CPM. ----
  if not app.goal_has_dependencies(p_goal_id) then
    update tasks t
       set computed_start    = v_start + t.offset_days,
           computed_end      = v_start + t.offset_days + t.duration_days,
           total_float_days  = null,
           is_critical       = false
     where t.goal_id = p_goal_id
       and t.deleted_at is null;
    return;
  end if;

  -- ---- CPM ------------------------------------------------------------------
  create temporary table if not exists _cpm (
    task_id     uuid primary key,
    duration    integer not null,
    es          integer,          -- earliest start, days from goal start
    ef          integer,          -- earliest finish
    ls          integer,          -- latest start
    lf          integer,          -- latest finish
    pinned      boolean not null default false
  ) on commit drop;

  delete from _cpm;

  insert into _cpm (task_id, duration, es, ef, pinned)
  select t.id,
         greatest(t.duration_days, 0),
         t.offset_days,
         t.offset_days + greatest(t.duration_days, 0),
         not exists (
           select 1 from task_dependencies td where td.successor_task_id = t.id
         )
  from tasks t
  where t.goal_id = p_goal_id and t.deleted_at is null and t.status <> 'cancelled';

  select count(*) * 2 + 10 into v_max_iter from _cpm;

  -- ---- Forward pass: relax until stable -------------------------------------
  loop
    v_iter := v_iter + 1;

    with needed as (
      select
        s.task_id,
        max(case td.dep_type
              when 'fs' then p.ef + td.lag_days
              when 'ss' then p.es + td.lag_days
              when 'ff' then p.ef + td.lag_days - s.duration
              when 'sf' then p.es + td.lag_days - s.duration
            end) as required_es
      from _cpm s
      join task_dependencies td on td.successor_task_id = s.task_id
      join _cpm p on p.task_id = td.predecessor_task_id
      group by s.task_id
    )
    update _cpm c
       set es = greatest(c.es, n.required_es),
           ef = greatest(c.es, n.required_es) + c.duration
      from needed n
     where c.task_id = n.task_id
       and c.es < n.required_es;

    get diagnostics v_rows = ROW_COUNT;
    exit when v_rows = 0 or v_iter >= v_max_iter;
  end loop;

  -- Project end is the latest earliest-finish across all tasks.
  select max(ef) into v_proj_end from _cpm;

  -- ---- Backward pass --------------------------------------------------------
  update _cpm set lf = v_proj_end, ls = v_proj_end - duration;

  v_iter := 0;
  loop
    v_iter := v_iter + 1;

    with allowed as (
      select
        p.task_id,
        min(case td.dep_type
              when 'fs' then s.ls - td.lag_days
              when 'ss' then s.ls - td.lag_days + p.duration
              when 'ff' then s.lf - td.lag_days
              when 'sf' then s.lf - td.lag_days + p.duration
            end) as allowed_lf
      from _cpm p
      join task_dependencies td on td.predecessor_task_id = p.task_id
      join _cpm s on s.task_id = td.successor_task_id
      group by p.task_id
    )
    update _cpm c
       set lf = least(c.lf, a.allowed_lf),
           ls = least(c.lf, a.allowed_lf) - c.duration
      from allowed a
     where c.task_id = a.task_id
       and c.lf > a.allowed_lf;

    get diagnostics v_rows = ROW_COUNT;
    exit when v_rows = 0 or v_iter >= v_max_iter;
  end loop;

  -- ---- Write back -----------------------------------------------------------
  update tasks t
     set computed_start   = v_start + c.es,
         computed_end     = v_start + c.ef,
         total_float_days = c.ls - c.es,
         is_critical      = (c.ls - c.es) <= 0
    from _cpm c
   where t.id = c.task_id;

  -- Cancelled tasks sit outside the network.
  update tasks
     set total_float_days = null, is_critical = false
   where goal_id = p_goal_id and status = 'cancelled';
end;
$$;

-- Replaces the pre-CPM cascade, which only ever did the simple offset
-- math directly. Now just defers to recompute_goal_schedule, which
-- itself branches on whether the goal has a dependency network — one
-- code path for "the goal's start moved" regardless of which case
-- applies.
create or replace function app.cascade_goal_start_date()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if new.start_date is distinct from old.start_date then
    perform app.recompute_goal_schedule(new.id);
  end if;
  return null;
end;
$$;

-- New: escalates to a full network recompute only when the goal
-- actually has one — a task edit on a dependency-free goal still gets
-- its cheap BEFORE-trigger (tasks_derive_dates) values and pays nothing
-- extra here.
create or replace function app.recompute_after_task_change()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if app.goal_has_dependencies(new.goal_id) then
    perform app.recompute_goal_schedule(new.goal_id);
  end if;
  return null;
end;
$$;

-- New: any dependency insert/update/delete recomputes the affected
-- goal's schedule unconditionally — a dependency change is by
-- definition a network change, so there's no cheap-case branch here the
-- way recompute_after_task_change has.
create or replace function app.recompute_on_dependency_change()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_goal uuid;
  v_task uuid;
begin
  v_task := coalesce(new.successor_task_id, old.successor_task_id);
  select goal_id into v_goal from tasks where id = v_task;
  if v_goal is not null then
    perform app.recompute_goal_schedule(v_goal);
  end if;
  return null;
end;
$$;

create or replace trigger tasks_recompute_network
after insert or update of offset_days, duration_days, status on public.tasks
for each row execute function app.recompute_after_task_change();

create or replace trigger task_dependencies_recompute
after insert or delete or update on public.task_dependencies
for each row execute function app.recompute_on_dependency_change();

-- The public-facing surface: every non-deleted, non-cancelled task
-- currently on the critical path, across any of the caller's goals.
-- security_invoker (rule 3) — RLS on tasks itself (already the exact
-- authorization surface: a task's own visibility already follows its
-- goal's) governs this exactly as if querying tasks directly, no
-- separate goal_id filter needed.
create or replace view public.v_critical_path
with (security_invoker = true) as
select
  goal_id,
  id as task_id,
  title,
  computed_start,
  computed_end,
  total_float_days,
  is_critical,
  status,
  owner_id
from tasks t
where deleted_at is null and status <> 'cancelled' and is_critical;

grant select on public.v_critical_path to authenticated;

-- Supports both v_critical_path and app.compute_goal_rag's own
-- overdue_critical_tasks count (0014-era, predates this migration but
-- reads is_critical the same way) — a partial index costs nothing on
-- the (overwhelmingly common) non-critical rows it excludes.
create index if not exists tasks_critical_idx on public.tasks (goal_id)
  where is_critical and deleted_at is null;
