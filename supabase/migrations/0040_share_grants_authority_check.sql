-- Found while implementing P9.1's account-deletion cascade (which
-- reasons about share_grants directly), but this is really a P9.0-class
-- isolation bug: "isolation has to be proven, not assumed" applies just
-- as much to write paths as read paths, and this one was never tested.
--
-- share_grants_insert's own WITH CHECK has only ever been
-- `grantor_id = auth.uid()` -- it never verified the grantor actually
-- has any authority over the resource being granted. Confirmed live
-- (dry-run against a real fixture, not inferred from reading the
-- policy): an authenticated user with zero relationship to another
-- user's goal could insert a share_grants row naming themselves as
-- grantor and a third party as grantee, and that third party would
-- then get real read access to the goal through `goals_select`'s own
-- `app.has_grant('goal', id, 'view')` clause (0037) -- has_grant only
-- ever checks that a matching, unrevoked row exists, never who issued
-- it or whether they were entitled to.
--
-- share_grants_update had a second, independent hole: no WITH CHECK at
-- all, and its USING clause allowed either the grantor *or the
-- grantee* to update a row. Confirmed live: a grantee could
-- unilaterally rewrite their own view-only grant's `scope` to `edit`,
-- with zero involvement from the actual grantor. No application code
-- anywhere in this repo ever updates a share_grants row as the
-- grantee (checked directly -- the only two call sites,
-- profile/[handle]/page.tsx and api/export/route.ts, only ever SELECT),
-- so removing that half of the policy costs nothing real.
--
-- app.can_grant() is the fix for both: resource-type-specific authority,
-- mirroring each resource's own real ownership/collaboration model
-- rather than a blanket check. 'trip' is included even though nothing
-- in this app inserts a trip-type grant yet (trips are goals, per
-- CLAUDE.md; a genuinely goal-scoped share already covers a trip
-- through the same `resource_type = 'goal'` grant 0037 wired up) --
-- the check constraint on share_grants has always allowed 'trip' as a
-- resource_type, so it gets a real authority check now rather than
-- silently defaulting to "false" the way the catch-all ELSE branch
-- would otherwise leave it, in case something ever does start using it.
create or replace function app.can_grant(p_resource_type text, p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select case p_resource_type
    when 'goal' then app.can_edit_goal(p_resource_id)
    when 'trip' then exists (
      select 1 from trips t where t.id = p_resource_id and app.can_edit_goal(t.goal_id)
    )
    when 'someday_item' then exists (
      select 1 from someday_items si where si.id = p_resource_id and si.user_id = auth.uid()
    )
    when 'profile' then p_resource_id = auth.uid()
    else false
  end;
$$;

drop policy share_grants_insert on share_grants;
create policy share_grants_insert on share_grants
  for insert
  with check (
    grantor_id = auth.uid()
    and app.can_grant(resource_type, resource_id)
  );

drop policy share_grants_update on share_grants;
create policy share_grants_update on share_grants
  for update
  using (grantor_id = auth.uid())
  with check (
    grantor_id = auth.uid()
    and app.can_grant(resource_type, resource_id)
  );

do $$
begin
  assert (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'share_grants' and cmd = 'INSERT'
  ) = 1, 'expected exactly one share_grants insert policy';
  assert (
    select with_check is not null from pg_policies
    where schemaname = 'public' and tablename = 'share_grants' and policyname = 'share_grants_update'
  ), 'share_grants_update should have a WITH CHECK clause after this migration';
end $$;
