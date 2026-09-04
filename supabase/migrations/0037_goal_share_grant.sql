-- P9.0: found while building the isolation suite. `share_grants`'s own
-- check constraint has always allowed resource_type = 'goal' (confirmed
-- live), and `invitations` carries the same resource_type/resource_id
-- shape needed to create one -- the schema has been ready for
-- goal-level share grants since before this repo's captured migration
-- log begins. Nothing ever consulted one, though: `goals_select` only
-- ever checked `owner_id`/`goal_participants`, and `app.can_view_goal`/
-- `app.can_edit_goal` (the shared gate tasks/milestones/ledger_entries/
-- rag_snapshots/task_dependencies all read through) never call
-- `app.has_grant` either. A goal-level grant, accepted, currently
-- unlocks nothing at all -- not a leak, but not the feature the schema
-- was built to support.
--
-- The fix here is deliberately narrow, not "wire has_grant into
-- can_view_goal": that function is the single shared gate for tasks,
-- milestones, ledger_entries and rag_snapshots too, so extending it
-- would hand a share-grant viewer the goal's actual money and private
-- ratings, not just the goal itself -- the same money/ledger a
-- goal_participants collaborator legitimately sees but a lighter-weight
-- grant should not. `goal_participants` stays the only way to become a
-- real collaborator (edit access, ledger visibility, tasks, milestones);
-- a `share_grants` row on `resource_type = 'goal'` only ever unlocks the
-- bare `goals` row -- title, dates, state, funding shape -- the same
-- "one row, nothing it cascades to" shape `someday_item`/`profile`
-- grants already have. Read-only regardless of the grant's own `scope`
-- column: `goals_update` is untouched, so an edit-scope goal grant
-- still can't write to the goal -- collaboration already has a
-- mechanism (goal_participants), this isn't a second one.
drop policy goals_select on goals;
create policy goals_select on goals
  for select
  using (
    deleted_at is null
    and (
      owner_id = auth.uid()
      or exists (
        select 1 from goal_participants gp
        where gp.goal_id = goals.id
          and gp.user_id = auth.uid()
          and gp.removed_at is null
      )
      or app.has_grant('goal', id, 'view')
    )
  );

do $$
begin
  assert (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'goals' and policyname = 'goals_select'
  ) = 1, 'expected exactly one goals_select policy after replace';
end $$;
