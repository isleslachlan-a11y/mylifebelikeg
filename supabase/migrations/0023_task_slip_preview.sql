-- P5.2: "what happens if this task takes N days longer?" — a preview,
-- never a save. Reuses app.recompute_goal_schedule (0021) directly
-- rather than reimplementing CPM in TypeScript (brief, verbatim: "two
-- implementations of the same algorithm will diverge, and the one in
-- the UI will be the wrong one"). The only genuinely new logic here is
-- running that real scheduler against a temporarily-mutated duration,
-- then throwing away everything it wrote.
--
-- "Calling a Postgres function in a transaction that rolls back" (brief)
-- can't mean the *application* opens a multi-statement transaction and
-- rolls it back itself: every supabase.rpc() call is its own single
-- PostgREST request, wrapped in (and committed at the end of) its own
-- transaction — there's no session persisting across separate network
-- calls to BEGIN against and ROLLBACK later. The one place a rollback
-- can live is *inside* the function, via the standard Postgres dry-run
-- idiom: a nested BEGIN...EXCEPTION block runs inside an implicit
-- savepoint; the real writes happen inside it; the result is captured
-- into a variable declared *outside* the block (so it survives the
-- rollback); a deliberate exception unwinds the block back to that
-- savepoint. The enclosing call still returns normally and its own
-- transaction commits fine — just with none of the block's writes ever
-- having survived.
create or replace function app.preview_task_slip(p_task_id uuid, p_extra_days integer)
returns date
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_goal_id            uuid;
  v_original_duration  integer;
  v_result             date;
  -- Namespaced and specific on purpose: this is compared against
  -- SQLERRM below to tell "our own deliberate rollback signal" apart
  -- from a genuine failure (e.g. a real bug surfacing inside
  -- recompute_goal_schedule) — a message this specific isn't going to
  -- collide with anything raised elsewhere in the call.
  v_rollback_marker constant text :=
    'app.preview_task_slip: intentional rollback, not a real error';
begin
  select goal_id, duration_days into v_goal_id, v_original_duration
  from tasks
  where id = p_task_id and deleted_at is null;

  if v_goal_id is null then
    raise exception 'Task not found.';
  end if;

  -- security definer bypasses RLS entirely, so this is the one place
  -- that has to check explicitly — same surface tasks_write's own RLS
  -- uses for a real duration edit (app.can_edit_goal), so a preview
  -- never sees further than an actual edit would be allowed to reach.
  if not app.can_edit_goal(v_goal_id) then
    raise exception 'Not authorized to preview this task.';
  end if;

  begin
    -- Same floor recompute_goal_schedule's own CPM insert already
    -- applies (greatest(duration_days, 0)) — a preview that would push
    -- duration negative just floors at zero, same as a real edit would.
    update tasks
       set duration_days = greatest(v_original_duration + p_extra_days, 0)
     where id = p_task_id;

    -- tasks_recompute_network (0021's AFTER trigger) already calls this
    -- automatically off the UPDATE above whenever the goal has a
    -- dependency network — which every genuinely critical task's goal
    -- does, by definition. Called again here explicitly anyway: relying
    -- on a trigger's side effect to have already run by the time this
    -- reads goal_projected_end would make correctness depend on trigger
    -- wiring this function doesn't own, for a call that isn't a hot
    -- path (a deliberate, occasional "what if" — not worth the
    -- fragility to save one already-cheap recompute, see
    -- PERF-BUDGET.md's ~14ms scheduler number).
    perform app.recompute_goal_schedule(v_goal_id);
    v_result := app.goal_projected_end(v_goal_id);

    raise exception using message = v_rollback_marker;
  exception
    when others then
      if sqlerrm is distinct from v_rollback_marker then
        raise;
      end if;
      -- Falls through: v_result was already captured before the raise,
      -- and every write inside this block (the duration_days update,
      -- and everything recompute_goal_schedule itself wrote — every
      -- task's computed_start/computed_end/total_float_days/is_critical
      -- on this goal) is rolled back to the implicit savepoint this
      -- EXCEPTION block created. The enclosing transaction is
      -- untouched and commits normally on RETURN below.
  end;

  return v_result;
end;
$$;

grant execute on function app.preview_task_slip(uuid, integer) to authenticated;

-- The callable surface: `app` isn't reachable from supabase.rpc()
-- (PostgREST only exposes public/graphql_public — 0014's own top
-- comment). Same shape as 0015's public.ensure_current_checkin: a thin
-- pass-through, no new privilege granted here — app.preview_task_slip
-- is already SECURITY DEFINER with its own app.can_edit_goal check.
create or replace function public.preview_task_slip(task_id uuid, extra_days integer)
returns date
language sql
set search_path = public, app
as $$
  select app.preview_task_slip(task_id, extra_days);
$$;

-- The read side: "projected end vs target date" for the goal detail
-- page. app.goal_projected_end already existed (0021, "not yet wired to
-- any page — that's a future package's job") — this is that package.
-- security_invoker (rule 3): RLS on goals itself already is the exact
-- authorization surface (same reasoning v_critical_path's own comment
-- gives for tasks), so no separate filter is added on top.
create or replace view public.v_goal_projected_end
with (security_invoker = true) as
select
  g.id as goal_id,
  app.goal_projected_end(g.id) as projected_end
from goals g
where g.deleted_at is null;

grant select on public.v_goal_projected_end to authenticated;
